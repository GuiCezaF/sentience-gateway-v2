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
import { DRIZZLE, type DrizzleDb } from '../src/db/db.module.js';
import { syncs, classifications, companies, users } from '../src/db/schema.js';
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

    const [sentinel] = await db
      .insert(companies)
      .values({
        cnpj: '00000000000191',
        legalName: 'Sentience',
        emailDomain: 'sentience.internal',
      })
      .returning();

    await db.insert(users).values([
      {
        id: validUserId,
        authId: validUserId,
        companyId: sentinel.id,
        name: 'Sync User 1',
        email: 'sync1@sentience.internal',
        cpf: '52998224725',
        status: 'active',
        mustChangePassword: false,
      },
      {
        id: 'a0000000-0000-0000-0000-000000000002',
        authId: 'a0000000-0000-0000-0000-000000000002',
        companyId: sentinel.id,
        name: 'Sync User 2',
        email: 'sync2@sentience.internal',
        cpf: '71428793860',
        status: 'active',
        mustChangePassword: false,
      },
    ]);
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

  it('Lote com classificações novas responde 201, grava syncs e classifications com relações e dados corretos', async () => {
    const item1 = {
      classification_id: 'b0000000-0000-4000-8000-000000000001',
      occurred_at: '2026-09-15T18:00:01.000Z',
      emotion: 'happy',
    };
    const item2 = {
      classification_id: 'b0000000-0000-4000-8000-000000000002',
      occurred_at: '2026-09-15T18:00:02.000Z',
      emotion: 'neutral',
    };
    const item3 = {
      classification_id: 'b0000000-0000-4000-8000-000000000003',
      occurred_at: '2026-09-15T18:00:03.000Z',
      emotion: 'sad',
    };

    const response = await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        subject_id: 'sub-agent-01',
        sent_at: '2026-09-15T18:00:05.000Z',
        health: 'ok',
        items: [item1, item2, item3],
      })
      .expect(201);

    expect(response.body).toEqual({
      syncId: expect.any(String),
      health: 'ok',
      receivedCount: 3,
      insertedCount: 3,
      duplicateCount: 0,
    });

    const syncRows = await db.select().from(syncs);
    expect(syncRows).toHaveLength(1);
    expect(syncRows[0].id).toBe(response.body.syncId);
    expect(syncRows[0].receivedCount).toBe(3);
    expect(syncRows[0].insertedCount).toBe(3);
    expect(syncRows[0].duplicateCount).toBe(0);

    const classRows = await db.select().from(classifications);
    expect(classRows).toHaveLength(3);
    for (const row of classRows) {
      expect(row.syncId).toBe(response.body.syncId);
      expect(row.userId).toBe(validUserId);
      expect(row.subjectId).toBe('sub-agent-01');
    }

    const item1Row = classRows.find(
      (c) => c.classificationId === item1.classification_id,
    );
    expect(item1Row).toBeDefined();
    expect(item1Row?.emotion).toBe('happy');
    expect(item1Row?.occurredAt.toISOString()).toBe('2026-09-15T18:00:01.000Z');
  });

  it('identifica e conta Duplicatas entre Sincronizações sem gerar erro', async () => {
    const item1 = {
      classification_id: 'b0000000-0000-4000-8000-000000000001',
      occurred_at: '2026-09-15T18:00:01.000Z',
      emotion: 'happy',
    };
    const item2 = {
      classification_id: 'b0000000-0000-4000-8000-000000000002',
      occurred_at: '2026-09-15T18:00:02.000Z',
      emotion: 'neutral',
    };
    const item3 = {
      classification_id: 'b0000000-0000-4000-8000-000000000003',
      occurred_at: '2026-09-15T18:00:03.000Z',
      emotion: 'sad',
    };

    // Primeiro envio com item1 e item2
    const res1 = await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        subject_id: 'sub-agent-01',
        sent_at: '2026-09-15T18:00:05.000Z',
        health: 'ok',
        items: [item1, item2],
      })
      .expect(201);

    expect(res1.body).toEqual({
      syncId: expect.any(String),
      health: 'ok',
      receivedCount: 2,
      insertedCount: 2,
      duplicateCount: 0,
    });

    // Segundo envio com item2 (duplicata) e item3 (novo)
    const res2 = await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        subject_id: 'sub-agent-01',
        sent_at: '2026-09-15T18:30:00.000Z',
        health: 'ok',
        items: [item2, item3],
      })
      .expect(201);

    expect(res2.body).toEqual({
      syncId: expect.any(String),
      health: 'ok',
      receivedCount: 2,
      insertedCount: 1,
      duplicateCount: 1,
    });

    // Total de classificações no banco é 3
    const classRows = await db.select().from(classifications);
    expect(classRows).toHaveLength(3);

    // O item2 preserva o syncId da primeira sincronização (já que DO NOTHING não altera)
    const item2Row = classRows.find(
      (c) => c.classificationId === item2.classification_id,
    );
    expect(item2Row?.syncId).toBe(res1.body.syncId);
  });

  it('absorve duplicatas dentro do mesmo Lote contabilizando como duplicateCount', async () => {
    const item1 = {
      classification_id: 'b0000000-0000-4000-8000-000000000001',
      occurred_at: '2026-09-15T18:00:01.000Z',
      emotion: 'happy',
    };
    const item1Duplicate = {
      classification_id: 'b0000000-0000-4000-8000-000000000001',
      occurred_at: '2026-09-15T18:00:01.000Z',
      emotion: 'angry',
    };

    const res = await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        subject_id: 'sub-agent-01',
        sent_at: '2026-09-15T18:00:05.000Z',
        health: 'ok',
        items: [item1, item1Duplicate],
      })
      .expect(201);

    expect(res.body).toEqual({
      syncId: expect.any(String),
      health: 'ok',
      receivedCount: 2,
      insertedCount: 1,
      duplicateCount: 1,
    });

    const classRows = await db.select().from(classifications);
    expect(classRows).toHaveLength(1);
    expect(classRows[0].classificationId).toBe(item1.classification_id);
  });

  it('permite o mesmo classification_id para Usuários diferentes (unicidade por Usuário)', async () => {
    const user2Id = 'a0000000-0000-0000-0000-000000000002';
    const tokenUser2 = `user:${user2Id}`;
    const sharedClassificationId = 'b0000000-0000-4000-8000-000000000099';

    const item = {
      classification_id: sharedClassificationId,
      occurred_at: '2026-09-15T18:00:01.000Z',
      emotion: 'happy',
    };

    const res1 = await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        subject_id: 'sub-user-1',
        sent_at: '2026-09-15T18:00:05.000Z',
        health: 'ok',
        items: [item],
      })
      .expect(201);

    expect(res1.body.insertedCount).toBe(1);

    const res2 = await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({
        subject_id: 'sub-user-2',
        sent_at: '2026-09-15T18:00:06.000Z',
        health: 'ok',
        items: [item],
      })
      .expect(201);

    expect(res2.body.insertedCount).toBe(1);
    expect(res2.body.duplicateCount).toBe(0);

    const classRows = await db.select().from(classifications);
    expect(classRows).toHaveLength(2);
  });

  it('rejeita com 400 requisição com mais de 10 000 itens (MAX_SYNC_ITEMS) sem gravar nada', async () => {
    const items = Array.from({ length: 10001 }, (_, i) => ({
      classification_id: `b0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      occurred_at: '2026-09-15T18:00:00.000Z',
      emotion: 'happy',
    }));

    const res = await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        subject_id: 'sub-agent-01',
        sent_at: '2026-09-15T18:00:05.000Z',
        health: 'ok',
        items,
      })
      .expect(400);

    expect(res.body.message).toBe('Validation failed');

    const syncRows = await db.select().from(syncs);
    expect(syncRows).toHaveLength(0);

    const classRows = await db.select().from(classifications);
    expect(classRows).toHaveLength(0);
  });

  it('aceita Lote com múltiplos chunks (1 500 itens) gravando todas as linhas', async () => {
    const totalItems = 1500;
    const items = Array.from({ length: totalItems }, (_, i) => ({
      classification_id: `b0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      occurred_at: '2026-09-15T18:00:00.000Z',
      emotion: 'happy',
    }));

    const res = await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        subject_id: 'sub-agent-01',
        sent_at: '2026-09-15T18:00:05.000Z',
        health: 'ok',
        items,
      })
      .expect(201);

    expect(res.body.receivedCount).toBe(1500);
    expect(res.body.insertedCount).toBe(1500);
    expect(res.body.duplicateCount).toBe(0);

    const classRows = await db.select().from(classifications);
    expect(classRows).toHaveLength(1500);
  });

  it('resolve concorrência entre duas Sincronizações simultâneas com itens sobrepostos', async () => {
    const sharedItem = {
      classification_id: 'b0000000-0000-4000-8000-000000000050',
      occurred_at: '2026-09-15T18:00:00.000Z',
      emotion: 'happy',
    };
    const uniqueItemA = {
      classification_id: 'b0000000-0000-4000-8000-000000000051',
      occurred_at: '2026-09-15T18:00:01.000Z',
      emotion: 'neutral',
    };
    const uniqueItemB = {
      classification_id: 'b0000000-0000-4000-8000-000000000052',
      occurred_at: '2026-09-15T18:00:02.000Z',
      emotion: 'sad',
    };

    const reqA = request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        subject_id: 'sub-agent-01',
        sent_at: '2026-09-15T18:00:05.000Z',
        health: 'ok',
        items: [sharedItem, uniqueItemA],
      });

    const reqB = request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        subject_id: 'sub-agent-01',
        sent_at: '2026-09-15T18:00:05.000Z',
        health: 'ok',
        items: [sharedItem, uniqueItemB],
      });

    const [resA, resB] = await Promise.all([reqA, reqB]);

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);

    expect(resA.body.insertedCount + resB.body.insertedCount).toBe(3);
    expect(resA.body.duplicateCount + resB.body.duplicateCount).toBe(1);

    const classRows = await db.select().from(classifications);
    expect(classRows).toHaveLength(3);
  });

  it('reverte a transação inteira se houver falha ao inserir classificações', async () => {
    const drizzleDb = app.get<DrizzleDb>(DRIZZLE);
    const origTransaction = drizzleDb.transaction.bind(drizzleDb);

    const spy = vi
      .spyOn(drizzleDb, 'transaction')
      .mockImplementation(async (cb) => {
        return origTransaction(async (tx) => {
          const origInsert = tx.insert.bind(tx);
          tx.insert = ((table: any) => {
            if (table === classifications) {
              throw new Error('Simulated failure during classification insert');
            }
            return origInsert(table);
          }) as any;
          return cb(tx);
        });
      });

    const item = {
      classification_id: 'b0000000-0000-4000-8000-000000000001',
      occurred_at: '2026-09-15T18:00:01.000Z',
      emotion: 'happy',
    };

    await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        subject_id: 'sub-agent-01',
        sent_at: '2026-09-15T18:00:05.000Z',
        health: 'ok',
        items: [item],
      })
      .expect(500);

    spy.mockRestore();

    // Verificação de atomicidade: nenhuma linha em syncs nem em classifications
    const syncRows = await db.select().from(syncs);
    expect(syncRows).toHaveLength(0);

    const classRows = await db.select().from(classifications);
    expect(classRows).toHaveLength(0);
  });

  it('aceita Lote com sent_at no futuro e occurred_at > sent_at sem erro semântico de datas (ADR 0003)', async () => {
    const futureSentAt = '2099-01-01T12:00:00.000Z';
    const futureOccurredAt = '2099-01-01T13:00:00.000Z';
    const item = {
      classification_id: 'b0000000-0000-4000-8000-000000000777',
      occurred_at: futureOccurredAt,
      emotion: 'happy',
    };

    const res = await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        subject_id: 'sub-agent-01',
        sent_at: futureSentAt,
        health: 'ok',
        items: [item],
      })
      .expect(201);

    expect(res.body.receivedCount).toBe(1);
    expect(res.body.insertedCount).toBe(1);

    const classRows = await db.select().from(classifications);
    expect(classRows).toHaveLength(1);
    expect(classRows[0].occurredAt.toISOString()).toBe(futureOccurredAt);
  });

  it('aceita Lote no teto de 10 000 itens respondendo 201 com duração registrada abaixo de 10s', async () => {
    const totalItems = 10000;
    const items = Array.from({ length: totalItems }, (_, i) => ({
      classification_id: `b0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      occurred_at: '2026-09-15T18:00:00.000Z',
      emotion: 'happy',
    }));

    const startTime = Date.now();

    const res = await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        subject_id: 'sub-agent-01',
        sent_at: '2026-09-15T18:00:05.000Z',
        health: 'ok',
        items,
      })
      .expect(201);

    const durationMs = Date.now() - startTime;
    console.log(`⏱️ 10 000 items sync duration: ${durationMs}ms`);

    expect(durationMs).toBeLessThan(10000);
    expect(res.body.receivedCount).toBe(10000);
    expect(res.body.insertedCount).toBe(10000);
    expect(res.body.duplicateCount).toBe(0);

    const syncRows = await db.select().from(syncs);
    expect(syncRows).toHaveLength(1);
    expect(syncRows[0].insertedCount).toBe(10000);
  });

  it('retorna 413 Payload Too Large quando o corpo da requisição excede BODY_LIMIT', async () => {
    // 6MB payload em string (BODY_LIMIT padrão é 5mb)
    const bigPayload = JSON.stringify({
      subject_id: 'sub-agent-01',
      sent_at: '2026-09-15T18:00:00.000Z',
      health: 'ok',
      items: [],
      padding: 'x'.repeat(6 * 1024 * 1024),
    });

    await request(app.getHttpServer())
      .post('/v1/syncs')
      .set('Authorization', `Bearer ${validToken}`)
      .set('Content-Type', 'application/json')
      .send(bigPayload)
      .expect(413);

    const syncRows = await db.select().from(syncs);
    expect(syncRows).toHaveLength(0);
  });
});
