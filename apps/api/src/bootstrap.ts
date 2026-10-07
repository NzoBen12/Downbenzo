import { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

export async function createApp(): Promise<NestExpressApplication> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: env.NODE_ENV === 'test' ? ['error'] : ['log', 'warn', 'error'] });
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready', 'metrics'] });
  const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins, credentials: true, allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'] });
  app.enableShutdownHooks();
  return app;
}
