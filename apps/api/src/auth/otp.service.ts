import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthEventService } from './auth-event.service.js';
import {
  generateOtpCode,
  hashesEqual,
  hashOtpCode,
  normalizeEmail,
} from './auth.crypto.js';

export const INVALID_CODE_MESSAGE = 'Invalid or expired code.';

const MINUTE_MS = 60_000;

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly events: AuthEventService,
    private readonly config: ConfigService,
  ) {}

  // Same outcome for unknown, inactive and active accounts; only an active
  // user gets a challenge and an email.
  async requestCode(submittedEmail: string, ip?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(submittedEmail) },
    });
    await this.events.record('OTP_REQUESTED', {
      userId: user?.id ?? null,
      email: submittedEmail,
      ip,
    });
    if (!user?.isActive) return;

    const ttlMinutes = this.config.getOrThrow<number>('OTP_TTL_MINUTES');
    const code = generateOtpCode();
    const now = new Date();
    await this.prisma.$transaction([
      // Invalidate every earlier challenge that is still usable.
      this.prisma.otpChallenge.updateMany({
        where: { userId: user.id, consumedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      }),
      this.prisma.otpChallenge.create({
        data: {
          userId: user.id,
          codeHash: hashOtpCode(code, this.secret()),
          expiresAt: new Date(now.getTime() + ttlMinutes * MINUTE_MS),
        },
      }),
    ]);

    this.mail.sendLoginCode(user.email, code, ttlMinutes);
  }

  // Returns the user id on success. Every failure throws the same 401.
  async verifyCode(
    submittedEmail: string,
    code: string,
    ip?: string,
  ): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(submittedEmail) },
    });
    const fail = async (): Promise<never> => {
      await this.events.record('LOGIN_FAILED', {
        userId: user?.id ?? null,
        email: submittedEmail,
        ip,
      });
      throw new UnauthorizedException(INVALID_CODE_MESSAGE);
    };
    if (!user?.isActive) return fail();

    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) return fail();

    const maxAttempts = this.config.getOrThrow<number>('OTP_MAX_ATTEMPTS');
    const now = new Date();
    const usable = {
      id: challenge.id,
      consumedAt: null,
      expiresAt: { gt: now },
      attempts: { lt: maxAttempts },
    };

    // Count this attempt atomically before comparing, so concurrent guesses
    // can never exceed OTP_MAX_ATTEMPTS. Once attempts reaches the limit the
    // challenge is dead, even for the correct code.
    const reserved = await this.prisma.otpChallenge.updateMany({
      where: usable,
      data: { attempts: { increment: 1 } },
    });
    if (reserved.count !== 1) return fail();

    if (!hashesEqual(challenge.codeHash, hashOtpCode(code, this.secret()))) {
      return fail();
    }

    // Conditional consume: of two concurrent correct submissions, only one
    // finds consumedAt still null.
    const consumed = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) return fail();

    await this.events.record('LOGIN_SUCCEEDED', {
      userId: user.id,
      email: submittedEmail,
      ip,
    });
    return user.id;
  }

  private secret(): string {
    return this.config.getOrThrow<string>('OTP_HASH_SECRET');
  }
}
