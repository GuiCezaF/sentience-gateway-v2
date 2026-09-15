import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnv } from './config/env.js';
import { AuthModule } from './auth/auth.module.js';
import { DbModule } from './db/db.module.js';
import { HealthController } from './health/health.controller.js';
import { SyncsModule } from './syncs/syncs.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: parseEnv,
      override: process.env.NODE_ENV !== 'test',
    }),
    DbModule,
    AuthModule,
    SyncsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
