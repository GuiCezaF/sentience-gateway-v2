import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configuredEnv, configureApp } from '../src/app.setup.js';
import { AUTH_PROVIDER } from '../src/auth/auth-provider.interface.js';
import { AUTH_ADMIN_PROVIDER } from '../src/auth/auth-admin-provider.interface.js';
import { companies, users, userRoles } from '../src/db/schema.js';
import { FakeAuthProvider } from './fake-auth.provider.js';
import { FakeAuthAdminProvider } from './fake-auth-admin.provider.js';
import {
  createTestDb,
  migrateTestSchema,
  truncateAll,
} from './integration/db-harness.js';

describe('Auth Login (e2e)', () => {
  const { sql, db } = createTestDb();
  let app: NestExpressApplication;
  let fakeAuthAdmin: FakeAuthAdminProvider;

  let sentinelAuthId: string;
  let companyId: string;

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

    companyId = sentinel.id;

    // 2. Cria usuário super_admin no auth admin e no banco local
    const createdAdmin = await fakeAuthAdmin.createUser({
      email: 'admin@sentience.internal',
      password: 'SuperPassword123!',
    });
    sentinelAuthId = createdAdmin.id;

    const [superAdminUser] = await db
      .insert(users)
      .values({
        authId: sentinelAuthId,
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
  });

  afterAll(async () => {
    await app.close();
    await sql.end();
  });

  it('realiza login com sucesso retornando 200 OK e contrato camelCase', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email: 'admin@sentience.internal',
        password: 'SuperPassword123!',
      })
      .expect(200);

    expect(res.body).toEqual({
      accessToken: `user:${sentinelAuthId}`,
      refreshToken: `refresh:${sentinelAuthId}`,
      tokenType: 'bearer',
      expiresIn: 3600,
      user: {
        id: expect.any(String),
        authId: sentinelAuthId,
        companyId: companyId,
        name: 'Super Admin',
        email: 'admin@sentience.internal',
        cpf: '52998224725',
        status: 'active',
        mustChangePassword: false,
        roles: ['super_admin'],
        company: {
          id: companyId,
          cnpj: '00000000000191',
          legalName: 'Sentience',
          emailDomain: 'sentience.internal',
        },
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });
  });

  it('repassa o cabeçalho X-Forwarded-For para o provedor de autenticação', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('X-Forwarded-For', '203.0.113.195, 70.41.3.18')
      .send({
        email: 'admin@sentience.internal',
        password: 'SuperPassword123!',
      })
      .expect(200);

    expect(fakeAuthAdmin.signInCalls).toHaveLength(1);
    expect(fakeAuthAdmin.signInCalls[0].clientIp).toBe('203.0.113.195');
  });

  it('permite login de usuário com mustChangePassword: true retornando a flag', async () => {
    const createdNew = await fakeAuthAdmin.createUser({
      email: 'novo@sentience.internal',
      password: 'TempPassword123',
    });

    const [newUser] = await db
      .insert(users)
      .values({
        authId: createdNew.id,
        companyId,
        name: 'Novo Usuário',
        email: 'novo@sentience.internal',
        cpf: '11144477735',
        status: 'active',
        mustChangePassword: true,
      })
      .returning();

    await db.insert(userRoles).values({
      userId: newUser.id,
      role: 'user',
    });

    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email: 'novo@sentience.internal',
        password: 'TempPassword123',
      })
      .expect(200);

    expect(res.body.user.mustChangePassword).toBe(true);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('rejeita credenciais inválidas (senha incorreta) com 401 Unauthorized genérico', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email: 'admin@sentience.internal',
        password: 'WrongPassword!',
      })
      .expect(401);

    expect(res.body).toEqual({
      statusCode: 401,
      message: 'Invalid email or password',
    });
  });

  it('rejeita credenciais inválidas (email inexistente) com 401 Unauthorized genérico', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email: 'nonexistent@sentience.internal',
        password: 'SomePassword123!',
      })
      .expect(401);

    expect(res.body).toEqual({
      statusCode: 401,
      message: 'Invalid email or password',
    });
  });

  it('rejeita usuário existente no Auth mas ausente no banco local com 401 Unauthorized genérico', async () => {
    await fakeAuthAdmin.createUser({
      email: 'orphan@sentience.internal',
      password: 'OrphanPassword123!',
    });

    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email: 'orphan@sentience.internal',
        password: 'OrphanPassword123!',
      })
      .expect(401);

    expect(res.body).toEqual({
      statusCode: 401,
      message: 'Invalid email or password',
    });
  });

  it('bloqueia login de usuário inativo com 403 Forbidden e payload {"error": "user_inactive"}', async () => {
    const inactiveAuth = await fakeAuthAdmin.createUser({
      email: 'inactive@sentience.internal',
      password: 'Password123!',
    });

    const [inactiveUser] = await db
      .insert(users)
      .values({
        authId: inactiveAuth.id,
        companyId,
        name: 'Inativo User',
        email: 'inactive@sentience.internal',
        cpf: '71428793860',
        status: 'inactive',
        mustChangePassword: false,
      })
      .returning();

    await db.insert(userRoles).values({
      userId: inactiveUser.id,
      role: 'user',
    });

    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email: 'inactive@sentience.internal',
        password: 'Password123!',
      })
      .expect(403);

    expect(res.body).toEqual({
      error: 'user_inactive',
    });
  });

  it('rejeita body inválido com 400 Bad Request', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email: 'invalid-email-format',
      })
      .expect(400);

    expect(res.body.message).toBe('Validation failed');
    expect(res.body.issues).toBeDefined();
  });
});
