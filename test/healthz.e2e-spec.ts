import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configuredEnv, configureApp } from './../src/app.setup.js';

describe('GET /healthz', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>(
      undefined,
      { bodyParser: false },
    );
    configureApp(app, configuredEnv(app));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('responde 200 { status: ok } fora do prefixo /v1', async () => {
    await request(app.getHttpServer())
      .get('/healthz')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('não está montado em /v1/healthz', async () => {
    await request(app.getHttpServer()).get('/v1/healthz').expect(404);
  });
});
