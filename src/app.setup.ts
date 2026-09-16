import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from './config/env.js';

export function configuredEnv(app: INestApplication): Env {
  const config = app.get(ConfigService<Env, true>);
  return {
    NODE_ENV: config.get('NODE_ENV'),
    PORT: config.get('PORT'),
    DATABASE_URL: config.get('DATABASE_URL'),
    DB_SCHEMA: config.get('DB_SCHEMA'),
    SUPABASE_URL: config.get('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: config.get('SUPABASE_SERVICE_ROLE_KEY'),
    MAX_SYNC_ITEMS: config.get('MAX_SYNC_ITEMS'),
    BODY_LIMIT: config.get('BODY_LIMIT'),
  };
}

export function configureApp(app: NestExpressApplication, env: Env): void {
  app.set('trust proxy', true);
  app.useBodyParser('json', { limit: env.BODY_LIMIT });
  app.setGlobalPrefix('v1', { exclude: ['healthz'] });
}
