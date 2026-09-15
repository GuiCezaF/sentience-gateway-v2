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
import { syncs, classifications } from '../../src/db/schema.js';
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

  it('cria syncs e classifications no schema "test" com RLS habilitada', async () => {
    const rows = await sql.unsafe<
      { tablename: string; rowsecurity: boolean }[]
    >(
      `SELECT tablename, rowsecurity
       FROM pg_tables
       WHERE schemaname = '${TEST_SCHEMA}'
         AND tablename IN ('syncs', 'classifications')
       ORDER BY tablename`,
    );

    expect(rows).toHaveLength(2);
    expect(rows).toEqual([
      { tablename: 'classifications', rowsecurity: true },
      { tablename: 'syncs', rowsecurity: true },
    ]);
  });

  it('não cria syncs nem classifications no schema public', async () => {
    const rows = await sql.unsafe<{ tablename: string }[]>(
      `SELECT tablename
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename IN ('syncs', 'classifications')`,
    );

    expect(rows).toHaveLength(0);
  });

  it('classifications.sync_id referencia syncs.id com ON DELETE RESTRICT', async () => {
    const fks = await sql.unsafe<{ conname: string; confdeltype: string }[]>(
      `SELECT conname, confdeltype
       FROM pg_constraint
       WHERE conrelid = '${TEST_SCHEMA}.classifications'::regclass
         AND contype = 'f'`,
    );

    expect(fks).toHaveLength(1);
    expect(fks[0].conname).toBe('classifications_sync_id_syncs_id_fk');
    expect(fks[0].confdeltype).toBe('r'); // 'r' = RESTRICT
  });

  it('possui os índices esperados para performance de consultas', async () => {
    const indexes = await sql.unsafe<{ indexname: string }[]>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = '${TEST_SCHEMA}'
         AND tablename IN ('syncs', 'classifications')
       ORDER BY indexname`,
    );

    const indexNames = indexes.map((i) => i.indexname);
    expect(indexNames).toContain('syncs_user_received_idx');
    expect(indexNames).toContain('classifications_user_occurred_idx');
  });

  it('fornece client postgres.js e Drizzle por DI no NestJS e permite operações no schema configurado', async () => {
    expect(injectedSql).toBeDefined();
    expect(injectedDrizzle).toBeDefined();

    const [sync] = await injectedDrizzle
      .insert(syncs)
      .values({
        userId: 'a0000000-0000-0000-0000-000000000001',
        subjectId: 'sub-1',
        sentAt: new Date(),
        health: 'ok',
        receivedCount: 1,
        insertedCount: 1,
        duplicateCount: 0,
      })
      .returning();

    expect(sync.id).toBeDefined();
    expect(sync.health).toBe('ok');

    const [classification] = await injectedDrizzle
      .insert(classifications)
      .values({
        userId: 'a0000000-0000-0000-0000-000000000001',
        classificationId: 'b0000000-0000-0000-0000-000000000001',
        syncId: sync.id,
        occurredAt: new Date(),
        emotion: 'happy',
      })
      .returning();

    expect(classification.classificationId).toBe(
      'b0000000-0000-0000-0000-000000000001',
    );
    expect(classification.syncId).toBe(sync.id);

    const selectedSyncs = await injectedDrizzle.select().from(syncs);
    expect(selectedSyncs).toHaveLength(1);
    expect(selectedSyncs[0].id).toBe(sync.id);
  });

  it('limpa os dados entre testes com truncateAll', async () => {
    const existingSyncs = await db.select().from(syncs);
    expect(existingSyncs).toHaveLength(0);

    const existingClassifications = await db.select().from(classifications);
    expect(existingClassifications).toHaveLength(0);
  });
});
