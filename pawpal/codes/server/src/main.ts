import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { initSentry } from './monitor/sentry';

async function bootstrap() {
  initSentry(process.env.SENTRY_DSN, process.env.NODE_ENV); // R61-1: off unless SENTRY_DSN is set
  const app = await NestFactory.create(AppModule, { rawBody: true }); // raw body is needed to check webhook signatures
  app.setGlobalPrefix('api');
  app.enableCors();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`PawPal server running on http://localhost:${port}/api`);
}
bootstrap();
