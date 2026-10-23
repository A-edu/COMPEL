import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthEventService } from './auth-event.service.js';
import { generateSessionToken, hashSessionToken } from './auth.crypto.js';
import type { SessionUser } from './session-user.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: AuthEventService,
    private readonly config: ConfigService,
  ) {}

  async create(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = generateSessionToken();
    const now = Date.now();
    const expiresAt = new Date(
      now + this.config.getOrThrow<number>('SESSION_ABSOLUTE_HOURS') * HOUR_MS,
    );
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashSessionToken(token),
        lastSeenAt: new Date(now),
        expiresAt,
      },
    });
    return { token, expiresAt };
  }

  // Returns the session's user, or null when the token is unknown, idle for
  // too long, past its absolute expiry, or belongs to an inactive user.
  // Expired sessions are deleted and recorded as SESSION_EXPIRED.
  async validate(token: string, ip?: string): Promise<SessionUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true },
    });
    if (!session) return null;

    const now = Date.now();
    const idleLimitMs =
      this.config.getOrThrow<number>('SESSION_IDLE_MINUTES') * MINUTE_MS;
    const expired =
      now - session.lastSeenAt.getTime() > idleLimitMs ||
      now >= session.expiresAt.getTime();

    if (expired || !session.user.isActive) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      if (expired) {
        await this.events.record('SESSION_EXPIRED', {
          userId: session.userId,
          email: session.user.email,
          ip,
        });
      }
      return null;
    }

    await this.prisma.session.updateMany({
      where: { id: session.id },
      data: { lastSeenAt: new Date(now) },
    });
    return { userId: session.userId, entityId: session.user.entityId };
  }

  async logout(token: string, ip?: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true },
    });
    if (!session) return;
    await this.prisma.session.deleteMany({ where: { id: session.id } });
    await this.events.record('LOGOUT', {
      userId: session.userId,
      email: session.user.email,
      ip,
    });
  }
}
