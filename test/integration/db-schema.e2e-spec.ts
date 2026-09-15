import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type postgres from 'postgres';
import { AppModule } from '../../src/app.module.js';
import { configuredEnv, configureApp } from '../../src/app.setup.js';
import {
  POSTGRES_CLIENT,
  DRIZZLE,
  type DrizzleDb,
} from '../../src/db/db.module.js';
import { companies, users, userRoles } from '../../src/db/schema.js';
import {
  createTestDb,
  migrateTestSchema,
  truncateAll,
  TEST_SCHEMA,
} from './db-harness.js';

describe('Database Schema & Integration Harness (e2e)', () => {
  const { sql, db } = createTestDb();
  let app: NestExpressApplication;
  let injectedSql: postgres.Sql;
  let injectedDrizzle: DrizzleDb;

  beforeAll(async () => {
    // 1. Run migrations on test schema
    await migrateTestSchema();

    // 2. Compile Nest application to verify DI
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>(
      undefined,
      { bodyParser: false },
    );
    configureApp(app, configuredEnv(app));
    await app.init();

    injectedSql = app.get<postgres.Sql>(POSTGRES_CLIENT);
    injectedDrizzle = app.get<DrizzleDb>(DRIZZLE);
  });

  beforeEach(async () => {
    await truncateAll(sql);
  });

  afterAll(async () => {
    await app.close();
    await sql.end();
  });

  it('cria todas as tabelas no schema "test" com RLS habilitada', async () => {
    const rows = await sql.unsafe<
      { tablename: string; rowsecurity: boolean }[]
    >(
      `SELECT tablename, rowsecurity
       FROM pg_tables
       WHERE schemaname = '${TEST_SCHEMA}'
         AND tablename IN ('syncs', 'classifications', 'companies', 'users', 'user_roles')
       ORDER BY tablename`,
    );

    expect(rows).toHaveLength(5);
    expect(rows).toEqual([
      { tablename: 'classifications', rowsecurity: true },
      { tablename: 'companies', rowsecurity: true },
      { tablename: 'syncs', rowsecurity: true },
      { tablename: 'user_roles', rowsecurity: true },
      { tablename: 'users', rowsecurity: true },
    ]);
  });

  it('não cria as tabelas do gateway no schema public', async () => {
    const rows = await sql.unsafe<{ tablename: string }[]>(
      `SELECT tablename
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename IN ('syncs', 'classifications', 'companies', 'users', 'user_roles')`,
    );

    expect(rows).toHaveLength(0);
  });

  it('garante chaves estrangeiras com ações corretas', async () => {
    const fks = await sql.unsafe<
      { conname: string; confdeltype: string; relname: string }[]
    >(
      `SELECT c.conname, c.confdeltype, cl.relname
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       WHERE n.nspname = '${TEST_SCHEMA}'
         AND c.contype = 'f'
       ORDER BY c.conname`,
    );

    const fkMap = new Map(fks.map((f) => [f.conname, f.confdeltype]));
    expect(fkMap.get('classifications_sync_id_syncs_id_fk')).toBe('r'); // RESTRICT
    expect(fkMap.get('users_company_id_companies_id_fk')).toBe('r'); // RESTRICT
    expect(fkMap.get('user_roles_user_id_users_id_fk')).toBe('c'); // CASCADE
  });

  it('possui restrições de unicidade UNIQUE(cnpj) e UNIQUE(company_id, cpf)', async () => {
    const uniques = await sql.unsafe<{ conname: string }[]>(
      `SELECT c.conname
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       WHERE n.nspname = '${TEST_SCHEMA}'
         AND c.contype = 'u'
       ORDER BY c.conname`,
    );

    const conNames = uniques.map((u) => u.conname);
    expect(conNames).toContain('companies_cnpj_unique');
    expect(conNames).toContain('users_company_cpf_unique');
    expect(conNames).toContain('users_auth_id_unique');
    expect(conNames).toContain('user_roles_user_role_unique');
  });

  it('possui os índices esperados para performance de consultas', async () => {
    const indexes = await sql.unsafe<{ indexname: string }[]>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = '${TEST_SCHEMA}'
         AND tablename IN ('syncs', 'classifications', 'companies', 'users', 'user_roles')
       ORDER BY indexname`,
    );

    const indexNames = indexes.map((i) => i.indexname);
    expect(indexNames).toContain('syncs_user_received_idx');
    expect(indexNames).toContain('classifications_user_occurred_idx');
    expect(indexNames).toContain('companies_cnpj_idx');
    expect(indexNames).toContain('users_company_id_idx');
    expect(indexNames).toContain('users_auth_id_idx');
    expect(indexNames).toContain('user_roles_user_id_idx');
  });

  it('permite persistência relacional de empresa, usuário e papéis via Drizzle', async () => {
    expect(injectedSql).toBeDefined();
    expect(injectedDrizzle).toBeDefined();

    const [company] = await injectedDrizzle
      .insert(companies)
      .values({
        cnpj: '12ABC34501DE35',
        legalName: 'Acme Corp Ltda',
        emailDomain: 'acme.com.br',
      })
      .returning();

    expect(company.id).toBeDefined();
    expect(company.cnpj).toBe('12ABC34501DE35');

    const [user] = await injectedDrizzle
      .insert(users)
      .values({
        authId: 'c0000000-0000-0000-0000-000000000001',
        companyId: company.id,
        name: 'Maria Silva',
        email: 'maria@acme.com.br',
        cpf: '52998224725',
        status: 'active',
        mustChangePassword: true,
      })
      .returning();

    expect(user.id).toBeDefined();
    expect(user.companyId).toBe(company.id);

    const [role] = await injectedDrizzle
      .insert(userRoles)
      .values({
        userId: user.id,
        role: 'company_admin',
      })
      .returning();

    expect(role.id).toBeDefined();
    expect(role.role).toBe('company_admin');

    const selectedCompanies = await injectedDrizzle.select().from(companies);
    expect(selectedCompanies).toHaveLength(1);
    const selectedUsers = await injectedDrizzle.select().from(users);
    expect(selectedUsers).toHaveLength(1);
    const selectedRoles = await injectedDrizzle.select().from(userRoles);
    expect(selectedRoles).toHaveLength(1);
  });

  it('limpa os dados entre testes com truncateAll', async () => {
    const existingCompanies = await db.select().from(companies);
    expect(existingCompanies).toHaveLength(0);

    const existingUsers = await db.select().from(users);
    expect(existingUsers).toHaveLength(0);

    const existingRoles = await db.select().from(userRoles);
    expect(existingRoles).toHaveLength(0);
  });
});
