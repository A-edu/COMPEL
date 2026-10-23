import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MailModule } from '../mail/mail.module.js';
import { AuthEventService } from './auth-event.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OtpService } from './otp.service.js';
import { SessionGuard } from './session.guard.js';
import { SessionService } from './session.service.js';

@Module({
  imports: [MailModule],
  controllers: [AuthController],
  providers: [
    AuthEventService,
    AuthService,
    OtpService,
    SessionService,
    // Global: every route needs a session unless marked @Public().
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AuthModule {}
