import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import {
  MAIL_TRANSPORT,
  type MailMessage,
  type MailTransport,
} from '../src/mail/mail.transport.js';

// Records messages instead of sending them.
export class MockMailTransport implements MailTransport {
  readonly sent: MailMessage[] = [];

  sendMail(message: MailMessage): Promise<unknown> {
    this.sent.push(message);
    return Promise.resolve({});
  }

  // Sending is not awaited by the API, so poll until the message after
  // `count` arrives.
  async waitForMessage(count: number, timeoutMs = 2000): Promise<MailMessage> {
    const deadline = Date.now() + timeoutMs;
    while (this.sent.length <= count) {
      if (Date.now() > deadline) throw new Error('No email arrived.');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return this.sent[count];
  }
}

// The real in-memory throttler storage, swapped for a fresh one between
// tests so limits from one test cannot fail another. Limits themselves are
// unchanged.
export class ResettableThrottlerStorage implements ThrottlerStorage {
  private inner = new ThrottlerStorageService();

  increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): ReturnType<ThrottlerStorage['increment']> {
    return this.inner.increment(key, ttl, limit, blockDuration, throttlerName);
  }

  reset(): void {
    this.inner.onApplicationShutdown();
    this.inner = new ThrottlerStorageService();
  }
}

export async function createTestApp(): Promise<{
  app: NestExpressApplication;
  mail: MockMailTransport;
  throttler: ResettableThrottlerStorage;
}> {
  const mail = new MockMailTransport();
  const throttler = new ResettableThrottlerStorage();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MAIL_TRANSPORT)
    .useValue(mail)
    .overrideProvider(ThrottlerStorage)
    .useValue(throttler)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return { app, mail, throttler };
}

// One entity with an active and an inactive DPO, removed again by cleanup().
export async function createFixtures(prisma: PrismaClient) {
  const slug = `e2e-${randomBytes(4).toString('hex')}`;
  const entity = await prisma.entity.create({
    data: {
      name: `E2E Entity ${slug}`,
      slug,
      dataOfficeEmail: `dmo@${slug}.example`,
    },
  });
  const user = await prisma.user.create({
    data: { email: `dpo@${slug}.example`, entityId: entity.id },
  });
  const inactiveUser = await prisma.user.create({
    data: {
      email: `inactive@${slug}.example`,
      entityId: entity.id,
      isActive: false,
    },
  });

  const cleanup = async () => {
    const userIds = [user.id, inactiveUser.id];
    await prisma.authEvent.deleteMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { email: { endsWith: `${slug}.example` } },
        ],
      },
    });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.otpChallenge.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.entity.delete({ where: { id: entity.id } });
  };

  return { slug, entity, user, inactiveUser, cleanup };
}

export function codeFrom(message: MailMessage): string {
  const match = /\b(\d{6})\b/.exec(message.text);
  if (!match) throw new Error('No code in email.');
  return match[1];
}

export function sessionCookie(setCookie: string[] | string | undefined) {
  const cookies = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  const raw = cookies.find((c) => c.startsWith('compel_session='));
  if (!raw) return undefined;
  const [pair, ...attributes] = raw.split(';').map((part) => part.trim());
  return {
    raw,
    token: decodeURIComponent(pair.slice('compel_session='.length)),
    attributes: attributes.map((a) => a.toLowerCase()),
  };
}

// Logs `email` in through the real OTP flow, reading the code from the mocked
// transport. Returns the verify response, the code and the parsed cookie.
export async function loginWithCode(
  app: NestExpressApplication,
  mail: MockMailTransport,
  email: string,
) {
  const before = mail.sent.length;
  await request(app.getHttpServer())
    .post('/api/auth/otp/request')
    .send({ email })
    .expect(200);
  const code = codeFrom(await mail.waitForMessage(before));
  const res = await request(app.getHttpServer())
    .post('/api/auth/otp/verify')
    .send({ email, code })
    .expect(200);
  const cookie = sessionCookie(res.headers['set-cookie']);
  if (!cookie) throw new Error('No session cookie.');
  return { res, code, cookie };
}

// Logs `email` in and returns the Cookie header value for later requests:
//
//   const cookie = await loginAs(app, mail, a.dpo.email);
//   await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie);
//
// Each login counts towards the OTP rate limits; call throttler.reset() in
// beforeEach when a file logs in many times.
export async function loginAs(
  app: NestExpressApplication,
  mail: MockMailTransport,
  email: string,
): Promise<string> {
  const { cookie } = await loginWithCode(app, mail, email);
  return `compel_session=${cookie.token}`;
}

export function envNumber(name: string): number {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be set for e2e tests.`);
  }
  return value;
}
