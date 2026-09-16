import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configuredEnv, configureApp } from '../src/app.setup.js';
import { AUTH_PROVIDER } from '../src/auth/auth-provider.interface.js';
import { AUTH_ADMIN_PROVIDER } from '../src/auth/auth-admin-provider.interface.js';
import { DRIZZLE, type DrizzleDb } from '../src/db/db.module.js';
import { companies, users, userRoles } from '../src/db/schema.js';
import { FakeAuthProvider } from './fake-auth.provider.js';
import { FakeAuthAdminProvider } from './fake-auth-admin.provider.js';
import {
  createTestDb,
  migrateTestSchema,
  truncateAll,
} from './integration/db-harness.js';
import { runSeed } from '../src/db/seed.js';

describe('Companies (e2e)', () => {
  const { sql, db } = createTestDb();
  let app: NestExpressApplication;
  let fakeAuthAdmin: FakeAuthAdminProvider;

  const superAdminAuthId = 'a0000000-0000-0000-0000-000000000001';
  const superAdminToken = `user:${superAdminAuthId}`;

  const regularUserAuthId = 'b0000000-0000-0000-0000-000000000002';
  const regularUserToken = `user:${regularUserAuthId}`;

  beforeAll(async () => {
    await migrateTestSchema();

    fakeAuthAdmin = new FakeAuthAdminProvider();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AUTH_PROVIDER)
      .useClass(FakeAuthProvider)
      .overrideProvider(AUTH_ADMIN_PROVIDER)
      .useValue(fakeAuthAdmin)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>(
      undefined,
      { bodyParser: false },
    );
    configureApp(app, configuredEnv(app));
    await app.init();
  });

  beforeEach(async () => {
    await truncateAll(sql);
    fakeAuthAdmin.clear();

    // 1. Cria empresa sentinel
    const [sentinel] = await db
      .insert(companies)
      .values({
        cnpj: '00000000000191',
        legalName: 'Sentience',
        emailDomain: 'sentience.internal',
      })
      .returning();

    // 2. Cria usuário super_admin
    const [superAdminUser] = await db
      .insert(users)
      .values({
        authId: superAdminAuthId,
        companyId: sentinel.id,
        name: 'Super Admin',
        email: 'admin@sentience.internal',
        cpf: '52998224725',
        status: 'active',
        mustChangePassword: false,
      })
      .returning();

    await db.insert(userRoles).values({
      userId: superAdminUser.id,
      role: 'super_admin',
    });

    // 3. Cria usuário comum (company_admin)
    const [regularUser] = await db
      .insert(users)
      .values({
        authId: regularUserAuthId,
        companyId: sentinel.id,
        name: 'Regular Admin',
        email: 'regular@sentience.internal',
        cpf: '71428793860',
        status: 'active',
        mustChangePassword: false,
      })
      .returning();

    await db.insert(userRoles).values({
      userId: regularUser.id,
      role: 'company_admin',
    });
  });

  afterAll(async () => {
    await app.close();
    await sql.end();
  });

  describe('POST /v1/companies', () => {
    const validPayload = {
      cnpj: '12ABC34501DE35', // IN RFB 2229/2024 válido
      legal_name: 'Alpha Corp Ltda',
      email_domain: 'alphacorp.com.br',
      owner: {
        name: 'Carlos Oliveira',
        email: 'carlos@alphacorp.com.br',
        cpf: '111.444.777-35',
      },
    };

    it('cria empresa e dono com sucesso retornando 201 e dados com senha temporária', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/companies')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(validPayload)
        .expect(201);

      expect(response.body).toEqual({
        company: {
          id: expect.any(String),
          cnpj: '12ABC34501DE35',
          legal_name: 'Alpha Corp Ltda',
          email_domain: 'alphacorp.com.br',
          created_at: expect.any(String),
        },
        owner: {
          id: expect.any(String),
          auth_id: expect.any(String),
          name: 'Carlos Oliveira',
          email: 'carlos@alphacorp.com.br',
          cpf: '11144477735',
          role: 'company_admin',
        },
        temporary_password: expect.stringMatching(/^[A-Za-z0-9]{10}$/),
      });

      // Valida persistência no banco
      const companyRows = await db.select().from(companies);
      expect(companyRows).toHaveLength(2); // sentinel + nova

      const ownerRows = await db.select().from(users);
      expect(ownerRows).toHaveLength(3); // sentinel admin + regular + novo dono

      const roleRows = await db.select().from(userRoles);
      expect(roleRows.filter((r) => r.role === 'company_admin')).toHaveLength(
        2,
      );

      // Valida criação no FakeAuthAdmin
      const authUser = fakeAuthAdmin.getUser(response.body.owner.auth_id);
      expect(authUser).toBeDefined();
      expect(authUser?.email).toBe('carlos@alphacorp.com.br');
      expect(authUser?.password).toBe(response.body.temporary_password);
    });

    it('suporta payload plano (owner_name, owner_email, owner_cpf)', async () => {
      const flatPayload = {
        cnpj: '12ABC34501DE35',
        legal_name: 'Flat Corp Ltda',
        email_domain: 'flatcorp.com.br',
        owner_name: 'Ana Costa',
        owner_email: 'ana@flatcorp.com.br',
        owner_cpf: '01234567890',
      };

      const response = await request(app.getHttpServer())
        .post('/v1/companies')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(flatPayload)
        .expect(201);

      expect(response.body.company.legal_name).toBe('Flat Corp Ltda');
      expect(response.body.owner.name).toBe('Ana Costa');
      expect(response.body.owner.cpf).toBe('01234567890');
    });

    it('retorna 409 Conflict ao tentar cadastrar CNPJ já existente', async () => {
      // Cria a empresa uma primeira vez
      await request(app.getHttpServer())
        .post('/v1/companies')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(validPayload)
        .expect(201);

      // Tenta criar novamente com o mesmo CNPJ
      const response = await request(app.getHttpServer())
        .post('/v1/companies')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(validPayload)
        .expect(409);

      expect(response.body.message).toContain('already exists');
    });

    it('retorna 422 Unprocessable Entity ao tentar cadastrar com email fora do domínio corporativo', async () => {
      const invalidEmailPayload = {
        ...validPayload,
        owner: {
          ...validPayload.owner,
          email: 'carlos@outradominio.com',
        },
      };

      const response = await request(app.getHttpServer())
        .post('/v1/companies')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(invalidEmailPayload)
        .expect(422);

      expect(response.body.message).toContain('domain');
      // Garante que não criou usuário no auth admin
      expect(fakeAuthAdmin.users.size).toBe(0);
    });

    it('retorna 400 Bad Request para CNPJ com dígito verificador inválido', async () => {
      const invalidCnpjPayload = {
        ...validPayload,
        cnpj: '12ABC34501DE99', // DV errado
      };

      await request(app.getHttpServer())
        .post('/v1/companies')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(invalidCnpjPayload)
        .expect(400);
    });

    it('retorna 400 Bad Request para CPF inválido', async () => {
      const invalidCpfPayload = {
        ...validPayload,
        owner: {
          ...validPayload.owner,
          cpf: '12345678900', // DV errado
        },
      };

      await request(app.getHttpServer())
        .post('/v1/companies')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(invalidCpfPayload)
        .expect(400);
    });

    it('retorna 403 Forbidden se o usuário autenticado não tiver papel super_admin', async () => {
      await request(app.getHttpServer())
        .post('/v1/companies')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send(validPayload)
        .expect(403);
    });

    it('retorna 401 Unauthorized quando não fornece header Authorization', async () => {
      await request(app.getHttpServer())
        .post('/v1/companies')
        .send(validPayload)
        .expect(401);
    });

    it('executa compensação de rollback no Supabase Auth se o banco falhar na inserção', async () => {
      const drizzleInstance = app.get<DrizzleDb>(DRIZZLE);
      const originalTx = drizzleInstance.transaction.bind(drizzleInstance);

      vi.spyOn(drizzleInstance, 'transaction').mockRejectedValueOnce(
        new Error('Forced database failure for saga compensation test'),
      );

      await request(app.getHttpServer())
        .post('/v1/companies')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(validPayload)
        .expect(500);

      // Garante que deleteUser foi chamado no authAdminProvider
      expect(fakeAuthAdmin.deleteCalls).toHaveLength(1);
      expect(fakeAuthAdmin.users.size).toBe(0);

      // Restaura o mock
      (drizzleInstance.transaction as any).mockImplementation(originalTx);
    });
  });

  describe('GET /v1/companies', () => {
    it('retorna lista de empresas cadastradas para super_admin', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/companies')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1); // sentinel
      expect(response.body[0]).toEqual({
        id: expect.any(String),
        cnpj: '00000000000191',
        legal_name: 'Sentience',
        email_domain: 'sentience.internal',
        created_at: expect.any(String),
      });
    });

    it('retorna 403 Forbidden para usuário sem papel super_admin', async () => {
      await request(app.getHttpServer())
        .get('/v1/companies')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);
    });
  });

  describe('Seed idempotency test', () => {
    it('executa seed idempotente sem duplicar empresa ou super-admin', async () => {
      // Roda seed contra o schema de teste passando fakeAuthAdmin
      await runSeed({
        schema: 'test',
        authAdminProvider: fakeAuthAdmin,
      });

      const companiesCount1 = (await db.select().from(companies)).length;
      const usersCount1 = (await db.select().from(users)).length;

      // Executa uma segunda vez
      await runSeed({
        schema: 'test',
        authAdminProvider: fakeAuthAdmin,
      });

      const companiesCount2 = (await db.select().from(companies)).length;
      const usersCount2 = (await db.select().from(users)).length;

      expect(companiesCount1).toBe(companiesCount2);
      expect(usersCount1).toBe(usersCount2);
    });
  });
});
