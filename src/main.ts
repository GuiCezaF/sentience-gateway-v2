import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configuredEnv, configureApp } from './app.setup.js';

const logger = new ConsoleLogger({
  json: process.env.NODE_ENV === 'production',
});

try {
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger,
    bodyParser: false,
  });
  const env = configuredEnv(app);
  configureApp(app, env);
  await app.listen(env.PORT, '0.0.0.0');
  logger.log(`Listening on ${await app.getUrl()}`);
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  logger.fatal(message);
  process.exit(1);
}
