import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HealthController } from './health/health.controller.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '..', '..', '.env'),
    }),
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
