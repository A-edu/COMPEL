import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { AuthModule } from './auth/auth.module.js';
import { otpThrottleOptions } from './auth/otp-throttle.config.js';
import { validateEnv } from './config/env.validation.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { StorageModule } from './storage/storage.module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '..', '..', '.env'),
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: otpThrottleOptions,
    }),
    PrismaModule,
    StorageModule.register(),
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
