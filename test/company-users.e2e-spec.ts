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
import { eq } from 'drizzle-orm';
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

describe('Company Users (e2e)', () => {
  const { sql, db } = createTestDb();
  let app: NestExpressApplication;
  let fakeAuthAdmin: FakeAuthAdminProvider;

  const superAdminAuthId = 'a0000000-0000-0000-0000-000000000001';
  const superAdminToken = `user:${superAdminAuthId}`;

  const companyAdminAAuthId = 'b0000000-0000-0000-0000-000000000002';
  const companyAdminAToken = `user:${companyAdminAAuthId}`;

  const companyAdminBAuthId = 'c0000000-0000-0000-0000-000000000003';
  const companyAdminBToken = `user:${companyAdminBAuthId}`;

  const regularUserAAuthId = 'd0000000-0000-0000-0000-000000000004';
  const regularUserAToken = `user:${regularUserAAuthId}`;

  const pendingPasswordAdminAuthId = 'e0000000-0000-0000-0000-000000000005';
  const pendingPasswordAdminToken = `user:${pendingPasswordAdminAuthId}`;

  let companyAId: string;
  let companyBId: string;

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

    // 1. Sentinel Company + Super Admin
    const [sentinel] = await db
      .insert(companies)
      .values({
        cnpj: '00000000000191',
        legalName: 'Sentience',
        emailDomain: 'sentience.internal',
      })
      .returning();

    const [superAdmin] = await db
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
      userId: superAdmin.id,
      role: 'super_admin',
    });

    // 2. Company A + Admin A
    const [compA] = await db
      .insert(companies)
      .values({
        cnpj: '12ABC34501DE35',
        legalName: 'Alpha Corp Ltda',
        emailDomain: 'alphacorp.com.br',
      })
      .returning();
    companyAId = compA.id;

    const [adminA] = await db
      .insert(users)
      .values({
        authId: companyAdminAAuthId,
        companyId: compA.id,
        name: 'Carlos Oliveira',
        email: 'carlos@alphacorp.com.br',
        cpf: '71428793860',
        status: 'active',
        mustChangePassword: false,
      })
      .returning();

    await db.insert(userRoles).values({
      userId: adminA.id,
      role: 'company_admin',
    });

    // 3. Company B + Admin B
    const [compB] = await db
      .insert(companies)
      .values({
        cnpj: '98ZYX76502VU14',
        legalName: 'Beta Corp Ltda',
        emailDomain: 'betacorp.com.br',
      })
      .returning();
    companyBId = compB.id;

    const [adminB] = await db
      .insert(users)
      .values({
        authId: companyAdminBAuthId,
        companyId: compB.id,
        name: 'Roberto Souza',
        email: 'roberto@betacorp.com.br',
        cpf: '11144477735',
        status: 'active',
        mustChangePassword: false,
      })
      .returning();

    await db.insert(userRoles).values({
      userId: adminB.id,
      role: 'company_admin',
    });

    // 4. Regular User A in Company A
    const [regularUserA] = await db
      .insert(users)
      .values({
        authId: regularUserAAuthId,
        companyId: compA.id,
        name: 'Juliana Paes',
        email: 'juliana@alphacorp.com.br',
        cpf: '01234567890',
        status: 'active',
        mustChangePassword: false,
      })
      .returning();

    await db.insert(userRoles).values({
      userId: regularUserA.id,
      role: 'user',
    });

    // 5. Admin with pending password change in Company A
    const [pendingAdmin] = await db
      .insert(users)
      .values({
        authId: pendingPasswordAdminAuthId,
        companyId: compA.id,
        name: 'Pending Admin',
        email: 'pending@alphacorp.com.br',
        cpf: '12345678909',
        status: 'active',
        mustChangePassword: true,
      })
      .returning();

    await db.insert(userRoles).values({
      userId: pendingAdmin.id,
      role: 'company_admin',
    });
  });

  afterAll(async () => {
    await app.close();
    await sql.end();
  });

  describe('POST /v1/companies/:companyId/users', () => {
    const validPayload = {
      name: 'Eduardo Rocha',
      email: 'eduardo@alphacorp.com.br',
      cpf: '23456789092',
    };

    it('cadastra novo usuário na empresa retornando 201, papel user, must_change_password true e senha temporária', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/companies/${companyAId}/users`)
        .set('Authorization', `Bearer ${companyAdminAToken}`)
        .send(validPayload)
        .expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        auth_id: expect.any(String),
        name: 'Eduardo Rocha',
        email: 'eduardo@alphacorp.com.br',
        cpf: '23456789092',
        role: 'user',
        status: 'active',
        must_change_password: true,
        temporary_password: expect.stringMatching(/^[A-Za-z0-9]{10}$/),
        created_at: expect.any(String),
      });

      // Valida persistência no banco
      const userInDb = await db
        .select()
        .from(users)
        .where(eq(users.id, res.body.id));
      expect(userInDb).toHaveLength(1);
      expect(userInDb[0].mustChangePassword).toBe(true);
      expect(userInDb[0].status).toBe('active');
      expect(userInDb[0].companyId).toBe(companyAId);

      const rolesInDb = await db
        .select()
        .from(userRoles)
        .where(eq(userRoles.userId, res.body.id));
      expect(rolesInDb).toHaveLength(1);
      expect(rolesInDb[0].role).toBe('user');

      // Valida criação no FakeAuthAdmin
      const authRecord = fakeAuthAdmin.getUser(res.body.auth_id);
      expect(authRecord).toBeDefined();
      expect(authRecord?.email).toBe('eduardo@alphacorp.com.br');
      expect(authRecord?.password).toBe(res.body.temporary_password);
    });

    it('suporta payload com full_name e CPF com pontuação', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/companies/${companyAId}/users`)
        .set('Authorization', `Bearer ${companyAdminAToken}`)
        .send({
          full_name: 'Marcos Pontes',
          email: 'marcos@alphacorp.com.br',
          cpf: '345.678.901-75',
        })
        .expect(201);

      expect(res.body.name).toBe('Marcos Pontes');
      expect(res.body.cpf).toBe('34567890175');
    });

    it('rejeita com 422 Unprocessable Entity se o domínio do email for diferente do registrado na empresa', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/companies/${companyAId}/users`)
        .set('Authorization', `Bearer ${companyAdminAToken}`)
        .send({
          name: 'Intruso Silva',
          email: 'intruso@gmail.com',
          cpf: '34567890175',
        })
        .expect(422);

      expect(res.body.message).toContain('domain');
      expect(fakeAuthAdmin.users.size).toBe(0);
    });

    it('rejeita com 400 Bad Request para CPF com dígitos verificadores inválidos', async () => {
      await request(app.getHttpServer())
        .post(`/v1/companies/${companyAId}/users`)
        .set('Authorization', `Bearer ${companyAdminAToken}`)
        .send({
          name: 'DV Incorreto',
          email: 'dv@alphacorp.com.br',
          cpf: '123.456.789-00',
        })
        .expect(400);

      expect(fakeAuthAdmin.users.size).toBe(0);
    });

    it('bloqueia com 409 Conflict se o CPF já estiver cadastrado na mesma empresa', async () => {
      // Cria o primeiro usuário
      await request(app.getHttpServer())
        .post(`/v1/companies/${companyAId}/users`)
        .set('Authorization', `Bearer ${companyAdminAToken}`)
        .send(validPayload)
        .expect(201);

      // Tenta criar outro usuário na mesma empresa com o mesmo CPF
      const res = await request(app.getHttpServer())
        .post(`/v1/companies/${companyAId}/users`)
        .set('Authorization', `Bearer ${companyAdminAToken}`)
        .send({
          name: 'Clone Silva',
          email: 'clone@alphacorp.com.br',
          cpf: validPayload.cpf,
        })
        .expect(409);

      expect(res.body.message).toContain('CPF already exists in this company');
    });

    it('permite cadastrar o mesmo CPF em empresas diferentes (unicidade relacional por empresa)', async () => {
      // Cria na Empresa A
      await request(app.getHttpServer())
        .post(`/v1/companies/${companyAId}/users`)
        .set('Authorization', `Bearer ${companyAdminAToken}`)
        .send(validPayload)
        .expect(201);

      // Cria na Empresa B com o MESMO CPF mas email do domínio B
      const resB = await request(app.getHttpServer())
        .post(`/v1/companies/${companyBId}/users`)
        .set('Authorization', `Bearer ${companyAdminBToken}`)
        .send({
          name: 'Eduardo na Beta',
          email: 'eduardo@betacorp.com.br',
          cpf: validPayload.cpf,
        })
        .expect(201);

      expect(resB.body.cpf).toBe(validPayload.cpf);
      expect(resB.body.email).toBe('eduardo@betacorp.com.br');
    });

    it('bloqueia com 409 Conflict se o email já estiver cadastrado no sistema', async () => {
      // Email do admin da empresa A já existe
      const res = await request(app.getHttpServer())
        .post(`/v1/companies/${companyAId}/users`)
        .set('Authorization', `Bearer ${companyAdminAToken}`)
        .send({
          name: 'Duplicado Email',
          email: 'carlos@alphacorp.com.br',
          cpf: '34567890175',
        })
        .expect(409);

      expect(res.body.message).toContain('already exists');
    });

    it('bloqueia com 409 Conflict se o email já existir no Supabase Auth', async () => {
      // Simula usuário que já existe no Auth
      await fakeAuthAdmin.createUser({
        email: 'ja-existe-auth@alphacorp.com.br',
        password: 'Password123!',
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/companies/${companyAId}/users`)
        .set('Authorization', `Bearer ${companyAdminAToken}`)
        .send({
          name: 'Auth Existente',
          email: 'ja-existe-auth@alphacorp.com.br',
          cpf: '34567890175',
        })
        .expect(409);

      expect(res.body.message).toContain('already exists');
    });

    it('bloqueia com 403 Forbidden quando company_admin tenta cadastrar usuário em outra empresa', async () => {
      // Admin da Empresa A tenta cadastrar usuário na Empresa B
      const res = await request(app.getHttpServer())
        .post(`/v1/companies/${companyBId}/users`)
        .set('Authorization', `Bearer ${companyAdminAToken}`)
        .send({
          name: 'Ataque Tenant',
          email: 'ataque@betacorp.com.br',
          cpf: '34567890175',
        })
        .expect(403);

      expect(res.body.message).toContain(
        'Access denied: user does not belong to this company',
      );
      expect(fakeAuthAdmin.users.size).toBe(0);
    });

    it('permite que super_admin cadastre usuários em qualquer empresa', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/companies/${companyAId}/users`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(validPayload)
        .expect(201);

      expect(res.body.email).toBe(validPayload.email);
    });

    it('bloqueia usuário com papel "user" com 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post(`/v1/companies/${companyAId}/users`)
        .set('Authorization', `Bearer ${regularUserAToken}`)
        .send(validPayload)
        .expect(403);
    });

    it('bloqueia solicitante com pendência de troca de senha com 403 password_change_required', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/companies/${companyAId}/users`)
        .set('Authorization', `Bearer ${pendingPasswordAdminToken}`)
        .send(validPayload)
        .expect(403);

      expect(res.body).toEqual({
        error: 'password_change_required',
      });
    });

    it('executa compensação de rollback no Supabase Auth se o banco falhar na transação', async () => {
      const drizzleInstance = app.get<DrizzleDb>(DRIZZLE);
      const originalTx = drizzleInstance.transaction.bind(drizzleInstance);

      vi.spyOn(drizzleInstance, 'transaction').mockRejectedValueOnce(
        new Error('Forced database transaction failure for user saga'),
      );

      await request(app.getHttpServer())
        .post(`/v1/companies/${companyAId}/users`)
        .set('Authorization', `Bearer ${companyAdminAToken}`)
        .send(validPayload)
        .expect(500);

      // Garante compensação
      expect(fakeAuthAdmin.deleteCalls).toHaveLength(1);
      expect(fakeAuthAdmin.users.size).toBe(0);

      vi.mocked(drizzleInstance.transaction).mockImplementation(originalTx);
    });
  });

  describe('GET /v1/companies/:companyId/users', () => {
    it('lista todos os usuários pertencentes à empresa para o company_admin correspondente', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/companies/${companyAId}/users`)
        .set('Authorization', `Bearer ${companyAdminAToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      // Empresa A tem: Carlos Oliveira (admin), Juliana Paes (user), Pending Admin (admin)
      expect(res.body.length).toBeGreaterThanOrEqual(3);

      const carlos = res.body.find(
        (u: any) => u.email === 'carlos@alphacorp.com.br',
      );
      expect(carlos).toBeDefined();
      expect(carlos.role).toBe('company_admin');
      expect(carlos.roles).toContain('company_admin');
      expect(carlos.temporary_password).toBeUndefined();

      const juliana = res.body.find(
        (u: any) => u.email === 'juliana@alphacorp.com.br',
      );
      expect(juliana).toBeDefined();
      expect(juliana.role).toBe('user');
    });

    it('bloqueia com 403 Forbidden quando company_admin tenta listar usuários de outra empresa', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/companies/${companyBId}/users`)
        .set('Authorization', `Bearer ${companyAdminAToken}`)
        .expect(403);

      expect(res.body.message).toContain(
        'Access denied: user does not belong to this company',
      );
    });

    it('permite que super_admin liste usuários de qualquer empresa', async () => {
      const resA = await request(app.getHttpServer())
        .get(`/v1/companies/${companyAId}/users`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      const resB = await request(app.getHttpServer())
        .get(`/v1/companies/${companyBId}/users`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(
        resA.body.some((u: any) => u.email === 'carlos@alphacorp.com.br'),
      ).toBe(true);
      expect(
        resB.body.some((u: any) => u.email === 'roberto@betacorp.com.br'),
      ).toBe(true);
    });

    it('retorna 404 Not Found quando super_admin busca empresa inexistente', async () => {
      const nonExistentId = 'f0000000-0000-0000-0000-000000000999';
      await request(app.getHttpServer())
        .get(`/v1/companies/${nonExistentId}/users`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(404);
    });

    it('retorna 400 Bad Request para formato de UUID inválido na rota', async () => {
      await request(app.getHttpServer())
        .get('/v1/companies/invalid-uuid/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(400);
    });

    it('bloqueia usuário comum com papel "user" com 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get(`/v1/companies/${companyAId}/users`)
        .set('Authorization', `Bearer ${regularUserAToken}`)
        .expect(403);
    });
  });
});
