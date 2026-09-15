import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnv } from './config/env.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: parseEnv,
      override: true,
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
