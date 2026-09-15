import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from 'vitest';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configuredEnv, configureApp } from '../src/app.setup.js';
import { AUTH_PROVIDER } from '../src/auth/auth-provider.interface.js';
import { syncs } from '../src/db/schema.js';
import { FakeAuthProvider } from './fake-auth.provider.js';
import {
  createTestDb,
  migrateTestSchema,
  truncateAll,
} from './integration/db-harness.js';

describe('POST /v1/syncs (e2e)', () => {
  const { sql, db } = createTestDb();
  let app: NestExpressApplication;

  const validUserId = 'a0000000-0000-0000-0000-000000000001';
  const validToken = `user:${validUserId}`;

  beforeAll(async () => {
    await migrateTestSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AUTH_PROVIDER)
      .useClass(FakeAuthProvider)
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
  });

  afterAll(async () => {
    await app.close();
    await sql.end();
  });

  it('Pulso "ok" responde 201, grava a linha correta no banco e não emite warn', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});

    const pulsePayload = {
      subject_id: 'sub-agent-01',
      sent_at: '2026-09-15T18:00:00.000Z',
      health: 'ok',
      items: [],
    };

    const response = await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .send(pulsePayload)
      .expect(201);

    expect(response.body).toEqual({
      syncId: expect.any(String),
      health: 'ok',
      receivedCount: 0,
      insertedCount: 0,
      duplicateCount: 0,
    });

    const rows = await db.select().from(syncs);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(response.body.syncId);
    expect(rows[0].userId).toBe(validUserId);
    expect(rows[0].subjectId).toBe('sub-agent-01');
    expect(rows[0].health).toBe('ok');
    expect(rows[0].sentAt.toISOString()).toBe('2026-09-15T18:00:00.000Z');
    expect(rows[0].receivedCount).toBe(0);
    expect(rows[0].insertedCount).toBe(0);
    expect(rows[0].duplicateCount).toBe(0);

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('Pulso "camera" responde 201, grava a linha com a Saúde certa e emite warn agent_health_degraded', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});

    const pulsePayload = {
      subject_id: 'sub-camera-fail',
      sent_at: '2026-09-15T18:05:00.000Z',
      health: 'camera',
      items: [],
    };

    const response = await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .send(pulsePayload)
      .expect(201);

    expect(response.body.health).toBe('camera');

    const rows = await db.select().from(syncs);
    expect(rows).toHaveLength(1);
    expect(rows[0].health).toBe('camera');
    expect(rows[0].subjectId).toBe('sub-camera-fail');

    expect(warnSpy).toHaveBeenCalledWith({
      event: 'agent_health_degraded',
      userId: validUserId,
      subjectId: 'sub-camera-fail',
      health: 'camera',
      sentAt: '2026-09-15T18:05:00.000Z',
    });

    warnSpy.mockRestore();
  });

  it('Pulso "model" responde 201, grava a linha com a Saúde certa e emite warn agent_health_degraded', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});

    const pulsePayload = {
      subject_id: 'sub-model-fail',
      sent_at: '2026-09-15T18:10:00.000Z',
      health: 'model',
      items: [],
    };

    const response = await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .send(pulsePayload)
      .expect(201);

    expect(response.body.health).toBe('model');

    const rows = await db.select().from(syncs);
    expect(rows).toHaveLength(1);
    expect(rows[0].health).toBe('model');
    expect(rows[0].subjectId).toBe('sub-model-fail');

    expect(warnSpy).toHaveBeenCalledWith({
      event: 'agent_health_degraded',
      userId: validUserId,
      subjectId: 'sub-model-fail',
      health: 'model',
      sentAt: '2026-09-15T18:10:00.000Z',
    });

    warnSpy.mockRestore();
  });

  it('retorna 401 e não escreve no banco quando o header Authorization está ausente', async () => {
    await request(app.getHttpServer())
      .post('/v1/syncs')
      .send({
        subject_id: 'sub-01',
        sent_at: '2026-09-15T18:00:00.000Z',
        health: 'ok',
        items: [],
      })
      .expect(401);

    const rows = await db.select().from(syncs);
    expect(rows).toHaveLength(0);
  });

  it('retorna 401 e não escreve no banco quando o header Authorization é malformado', async () => {
    await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', 'Basic dXNlcjpwYXNz')
      .send({
        subject_id: 'sub-01',
        sent_at: '2026-09-15T18:00:00.000Z',
        health: 'ok',
        items: [],
      })
      .expect(401);

    const rows = await db.select().from(syncs);
    expect(rows).toHaveLength(0);
  });

  it('retorna 401 e não escreve no banco quando o AuthProvider recusa o token', async () => {
    await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', 'Bearer user:not-a-valid-uuid')
      .send({
        subject_id: 'sub-01',
        sent_at: '2026-09-15T18:00:00.000Z',
        health: 'ok',
        items: [],
      })
      .expect(401);

    const rows = await db.select().from(syncs);
    expect(rows).toHaveLength(0);
  });

  it('retorna 400 e não escreve no banco quando o corpo é inválido (saúde desconhecida)', async () => {
    await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        subject_id: 'sub-01',
        sent_at: '2026-09-15T18:00:00.000Z',
        health: 'unknown_health',
        items: [],
      })
      .expect(400);

    const rows = await db.select().from(syncs);
    expect(rows).toHaveLength(0);
  });

  it('retorna 400 e não escreve no banco quando data possui offset (+00:00)', async () => {
    await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        subject_id: 'sub-01',
        sent_at: '2026-09-15T18:00:00+00:00',
        health: 'ok',
        items: [],
      })
      .expect(400);

    const rows = await db.select().from(syncs);
    expect(rows).toHaveLength(0);
  });

  it('retorna 400 e não escreve no banco quando subject_id está vazio', async () => {
    await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        subject_id: '',
        sent_at: '2026-09-15T18:00:00.000Z',
        health: 'ok',
        items: [],
      })
      .expect(400);

    const rows = await db.select().from(syncs);
    expect(rows).toHaveLength(0);
  });
});
