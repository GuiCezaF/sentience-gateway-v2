import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { eq } from 'drizzle-orm';
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

describe('Users & Password Enforcement (e2e)', () => {
  const { sql, db } = createTestDb();
  let app: NestExpressApplication;
  let fakeAuthAdmin: FakeAuthAdminProvider;

  const superAdminAuthId = 'a0000000-0000-0000-0000-000000000001';
  const superAdminToken = `user:${superAdminAuthId}`;

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

    // 2. Cria usuário super_admin no auth admin e no banco local
    await fakeAuthAdmin.createUser({
      email: 'admin@sentience.internal',
      password: 'SuperPassword123!',
    });

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
  });

  afterAll(async () => {
    await app.close();
    await sql.end();
  });

  it('executa o ciclo completo de primeiro acesso e troca de senha', async () => {
    // 1. Super-admin cria uma nova empresa e dono com senha temporária
    const companyPayload = {
      cnpj: '12ABC34501DE35',
      legal_name: 'Alpha Corp Ltda',
      email_domain: 'alphacorp.com.br',
      owner: {
        name: 'Carlos Oliveira',
        email: 'carlos@alphacorp.com.br',
        cpf: '111.444.777-35',
      },
    };

    const createCompanyRes = await request(app.getHttpServer())
      .post('/v1/companies')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send(companyPayload)
      .expect(201);

    const ownerAuthId = createCompanyRes.body.owner.auth_id;
    const tempPassword = createCompanyRes.body.temporary_password;
    const ownerToken = `user:${ownerAuthId}`;

    expect(tempPassword).toBeDefined();
    expect(ownerAuthId).toBeDefined();

    // 2. Novo dono tenta acessar GET /v1/users/me -> bloqueado com 403 password_change_required
    const blockedProfileRes = await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(403);

    expect(blockedProfileRes.body).toEqual({
      error: 'password_change_required',
    });

    // 3. Novo dono tenta enviar um Pulso em /v1/syncs -> bloqueado com 403 password_change_required
    const blockedSyncRes = await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        subject_id: 'inst-1',
        sent_at: '2026-09-15T20:00:00.000Z',
        health: 'ok',
        items: [],
      })
      .expect(403);

    expect(blockedSyncRes.body).toEqual({
      error: 'password_change_required',
    });

    // 4. Dono tenta trocar senha informando senha atual incorreta -> 400 Bad Request
    const wrongCurrentPassRes = await request(app.getHttpServer())
      .patch('/v1/users/me/password')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        currentPassword: 'wrongPassword123',
        newPassword: 'newSafePassword123!',
      })
      .expect(400);

    expect(wrongCurrentPassRes.body.message).toContain(
      'Invalid current password',
    );

    // Verifica que must_change_password ainda é true
    const userBeforeChange = await db
      .select()
      .from(users)
      .where(eq(users.authId, ownerAuthId));
    expect(userBeforeChange[0].mustChangePassword).toBe(true);

    // 5. Dono troca a senha com sucesso via PATCH /v1/users/me/password
    const changePasswordRes = await request(app.getHttpServer())
      .patch('/v1/users/me/password')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        currentPassword: tempPassword,
        newPassword: 'newSafePassword123!',
      })
      .expect(200);

    expect(changePasswordRes.body).toEqual({
      message: 'Password changed successfully',
    });

    // Valida que a senha foi atualizada no provedor de autenticação
    const authRecord = fakeAuthAdmin.getUser(ownerAuthId);
    expect(authRecord?.password).toBe('newSafePassword123!');

    // Valida que must_change_password foi desmarcado no banco local
    const userAfterChange = await db
      .select()
      .from(users)
      .where(eq(users.authId, ownerAuthId));
    expect(userAfterChange[0].mustChangePassword).toBe(false);

    // 6. Dono agora tem acesso liberado a GET /v1/users/me
    const profileRes = await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(profileRes.body).toEqual({
      id: expect.any(String),
      auth_id: ownerAuthId,
      name: 'Carlos Oliveira',
      email: 'carlos@alphacorp.com.br',
      cpf: '11144477735',
      status: 'active',
      must_change_password: false,
      company: {
        id: createCompanyRes.body.company.id,
        cnpj: '12ABC34501DE35',
        legal_name: 'Alpha Corp Ltda',
        email_domain: 'alphacorp.com.br',
      },
      roles: ['company_admin'],
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });

    // 7. Dono agora tem acesso liberado a /v1/syncs
    const syncRes = await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        subject_id: 'inst-1',
        sent_at: '2026-09-15T20:00:00.000Z',
        health: 'ok',
        items: [],
      })
      .expect(201);

    expect(syncRes.body.health).toBe('ok');
  });

  it('bloqueia usuário inativo (status !== "active") com 403 Forbidden', async () => {
    const inactiveAuthId = 'c0000000-0000-0000-0000-000000000003';
    const inactiveToken = `user:${inactiveAuthId}`;

    const sentinelCompany = (await db.select().from(companies))[0];

    const [inactiveUser] = await db
      .insert(users)
      .values({
        authId: inactiveAuthId,
        companyId: sentinelCompany.id,
        name: 'Inactive User',
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
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${inactiveToken}`)
      .expect(403);

    expect(res.body.message).toBe('User is inactive');
  });

  it('bloqueia usuário não cadastrado no banco local com 401 Unauthorized', async () => {
    const unmappedToken = 'user:e0000000-0000-0000-0000-000000000099';

    await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${unmappedToken}`)
      .expect(401);
  });

  it('rejeita troca de senha quando a nova senha tem menos de 8 caracteres', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/users/me/password')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        currentPassword: 'SuperPassword123!',
        newPassword: 'short',
      })
      .expect(400);

    expect(res.body.message).toBe('Validation failed');
  });
});
