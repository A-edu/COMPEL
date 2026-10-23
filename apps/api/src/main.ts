import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  const port = process.env.API_PORT ?? 3001;
  await app.listen(port, '127.0.0.1');
}
await bootstrap();
