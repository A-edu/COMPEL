import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import request from 'supertest';
import {
  codeFrom,
  createFixtures,
  createTestApp,
  envNumber,
  type MockMailTransport,
  type ResettableThrottlerStorage,
  sessionCookie,
} from './auth-helpers.js';

const REQUESTED = {
  message: 'If this email is registered, a code has been sent.',
};
const INVALID = { message: 'Invalid or expired code.' };
const TOO_MANY = {
  message: 'Too many attempts. Please wait a few minutes and try again.',
};

describe('Auth (e2e)', () => {
  const prisma = new PrismaClient();
  let app: NestExpressApplication;
  let mail: MockMailTransport;
  let throttler: ResettableThrottlerStorage;
  let fixtures: Awaited<ReturnType<typeof createFixtures>>;

  const api = () => request(app.getHttpServer());

  // Requests a code for `email` and returns it from the mocked transport.
  async function requestCode(email: string): Promise<string> {
    const before = mail.sent.length;
    await api().post('/api/auth/otp/request').send({ email }).expect(200);
    return codeFrom(await mail.waitForMessage(before));
  }

  async function login(email = fixtures.user.email) {
    const code = await requestCode(email);
    const res = await api()
      .post('/api/auth/otp/verify')
      .send({ email, code })
      .expect(200);
    const cookie = sessionCookie(res.headers['set-cookie']);
    if (!cookie) throw new Error('No session cookie.');
    return { res, code, cookie };
  }

  function wrongCode(code: string): string {
    return ((Number(code) + 1) % 1_000_000).toString().padStart(6, '0');
  }

  beforeAll(async () => {
    ({ app, mail, throttler } = await createTestApp());
    fixtures = await createFixtures(prisma);
  });

  afterAll(async () => {
    await fixtures?.cleanup();
    await app?.close();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    throttler.reset();
  });

  describe('POST /api/auth/otp/request', () => {
    it('gives an unknown email exactly the same response as a known one', async () => {
      const known = await api()
        .post('/api/auth/otp/request')
        .send({ email: fixtures.user.email });
      const unknown = await api()
        .post('/api/auth/otp/request')
        .send({ email: `nobody@${fixtures.slug}.example` });
      const inactive = await api()
        .post('/api/auth/otp/request')
        .send({ email: fixtures.inactiveUser.email });

      for (const res of [known, unknown, inactive]) {
        expect(res.status).toBe(200);
        expect(res.body).toEqual(REQUESTED);
        expect(res.headers['set-cookie']).toBeUndefined();
      }
      expect(unknown.headers['content-type']).toBe(
        known.headers['content-type'],
      );
      expect(unknown.text).toBe(known.text);
    });

    it('emails only active users, with the code and its validity', async () => {
      const before = mail.sent.length;
      await api()
        .post('/api/auth/otp/request')
        .send({ email: `nobody@${fixtures.slug}.example` })
        .expect(200);
      await api()
        .post('/api/auth/otp/request')
        .send({ email: fixtures.inactiveUser.email })
        .expect(200);
      await api()
        .post('/api/auth/otp/request')
        .send({ email: `  ${fixtures.user.email.toUpperCase()} ` })
        .expect(200);

      const message = await mail.waitForMessage(before);
      expect(mail.sent).toHaveLength(before + 1);
      expect(message.subject).toBe('Your COMPEL login code');
      expect(message.text).toContain(codeFrom(message));
      expect(message.text).toContain(`${process.env.OTP_TTL_MINUTES} minutes`);
    });

    it('stores only a hash of the code and records OTP_REQUESTED', async () => {
      const code = await requestCode(fixtures.user.email);
      const challenge = await prisma.otpChallenge.findFirstOrThrow({
        where: { userId: fixtures.user.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(challenge.codeHash).not.toBe(code);
      expect(challenge.codeHash).not.toContain(code);
      expect(challenge.codeHash).toMatch(/^[0-9a-f]{64}$/);

      const unknownEmail = `Nobody@${fixtures.slug}.example`;
      await api()
        .post('/api/auth/otp/request')
        .send({ email: unknownEmail })
        .expect(200);
      const event = await prisma.authEvent.findFirstOrThrow({
        where: { email: unknownEmail, type: 'OTP_REQUESTED' },
      });
      expect(event.userId).toBeNull();
      expect(event.ip).toBeTruthy();
    });

    it('returns 400 with a single message for an invalid email', async () => {
      const res = await api()
        .post('/api/auth/otp/request')
        .send({ email: 'not-an-email' })
        .expect(400);
      expect(res.body).toEqual({ message: expect.any(String) });
    });

    it('returns 429 for code requests beyond the per-email limit', async () => {
      const limit = envNumber('OTP_RATE_LIMIT_PER_EMAIL');
      const email = `nobody@${fixtures.slug}.example`;
      for (let i = 0; i < limit; i++) {
        await api().post('/api/auth/otp/request').send({ email }).expect(200);
      }
      // Changing case or padding does not reset the count.
      const res = await api()
        .post('/api/auth/otp/request')
        .send({ email: ` ${email.toUpperCase()}` })
        .expect(429);
      expect(res.body).toEqual(TOO_MANY);
    });

    it('returns 429 for code requests beyond the per-IP limit', async () => {
      const limit = envNumber('OTP_RATE_LIMIT_PER_IP');
      for (let i = 0; i < limit; i++) {
        await api()
          .post('/api/auth/otp/request')
          .send({ email: `nobody${i}@${fixtures.slug}.example` })
          .expect(200);
      }
      const res = await api()
        .post('/api/auth/otp/request')
        .send({ email: `another@${fixtures.slug}.example` })
        .expect(429);
      expect(res.body).toEqual(TOO_MANY);
    });
  });

  describe('POST /api/auth/otp/verify', () => {
    it('logs in with a correct code, sets the cookie, and /me returns the user', async () => {
      const { res, cookie } = await login();
      const expected = {
        user: { id: fixtures.user.id, email: fixtures.user.email },
        entity: {
          id: fixtures.entity.id,
          name: fixtures.entity.name,
          slug: fixtures.entity.slug,
        },
      };
      expect(res.body).toEqual(expected);

      expect(cookie.attributes).toContain('httponly');
      expect(cookie.attributes).toContain('samesite=lax');
      expect(cookie.attributes).toContain('path=/');
      expect(cookie.attributes).not.toContain('secure');

      const me = await api()
        .get('/api/auth/me')
        .set('Cookie', `compel_session=${cookie.token}`)
        .expect(200);
      expect(me.body).toEqual(expected);

      const session = await prisma.session.findFirstOrThrow({
        where: { userId: fixtures.user.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(session.tokenHash).not.toBe(cookie.token);
      expect(session.tokenHash).toBe(
        createHash('sha256').update(cookie.token).digest('hex'),
      );
      await expect(
        prisma.authEvent.count({
          where: { userId: fixtures.user.id, type: 'LOGIN_SUCCEEDED' },
        }),
      ).resolves.toBeGreaterThan(0);
    });

    it('sets a Secure cookie when the original host is not localhost', async () => {
      const email = fixtures.user.email;
      const code = await requestCode(email);
      const res = await api()
        .post('/api/auth/otp/verify')
        .set('X-Forwarded-Host', 'compel.example')
        .send({ email, code })
        .expect(200);
      expect(sessionCookie(res.headers['set-cookie'])?.attributes).toContain(
        'secure',
      );
    });

    it('returns 401 "Invalid or expired code." for a wrong code', async () => {
      const code = await requestCode(fixtures.user.email);
      const res = await api()
        .post('/api/auth/otp/verify')
        .send({ email: fixtures.user.email, code: wrongCode(code) })
        .expect(401);
      expect(res.body).toEqual(INVALID);
      expect(res.headers['set-cookie']).toBeUndefined();
      await expect(
        prisma.authEvent.count({
          where: { userId: fixtures.user.id, type: 'LOGIN_FAILED' },
        }),
      ).resolves.toBeGreaterThan(0);
    });

    it('rejects a code for an unknown or inactive email with the same 401', async () => {
      for (const email of [
        `nobody@${fixtures.slug}.example`,
        fixtures.inactiveUser.email,
      ]) {
        const res = await api()
          .post('/api/auth/otp/verify')
          .send({ email, code: '123456' })
          .expect(401);
        expect(res.body).toEqual(INVALID);
      }
    });

    it('rejects an expired code', async () => {
      const code = await requestCode(fixtures.user.email);
      await prisma.otpChallenge.updateMany({
        where: { userId: fixtures.user.id, consumedAt: null },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await api()
        .post('/api/auth/otp/verify')
        .send({ email: fixtures.user.email, code })
        .expect(401);
      expect(res.body).toEqual(INVALID);
    });

    it('rejects the correct code after OTP_MAX_ATTEMPTS wrong attempts', async () => {
      const maxAttempts = envNumber('OTP_MAX_ATTEMPTS');
      const code = await requestCode(fixtures.user.email);
      for (let i = 0; i < maxAttempts; i++) {
        await api()
          .post('/api/auth/otp/verify')
          .send({ email: fixtures.user.email, code: wrongCode(code) })
          .expect(401);
      }
      // The per-email rate limit can equal OTP_MAX_ATTEMPTS; clear it so this
      // test exercises the attempt lock rather than the throttler.
      throttler.reset();
      const res = await api()
        .post('/api/auth/otp/verify')
        .send({ email: fixtures.user.email, code })
        .expect(401);
      expect(res.body).toEqual(INVALID);
    });

    it('does not accept a used code again', async () => {
      const { code } = await login();
      const res = await api()
        .post('/api/auth/otp/verify')
        .send({ email: fixtures.user.email, code })
        .expect(401);
      expect(res.body).toEqual(INVALID);
    });

    it('lets only one of two concurrent correct submissions log in', async () => {
      const email = fixtures.user.email;
      const code = await requestCode(email);
      const results = await Promise.all([
        api().post('/api/auth/otp/verify').send({ email, code }),
        api().post('/api/auth/otp/verify').send({ email, code }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it('invalidates the previous code when a new one is requested', async () => {
      const first = await requestCode(fixtures.user.email);
      const second = await requestCode(fixtures.user.email);
      await api()
        .post('/api/auth/otp/verify')
        .send({ email: fixtures.user.email, code: first })
        .expect(401);
      await api()
        .post('/api/auth/otp/verify')
        .send({ email: fixtures.user.email, code: second })
        .expect(200);
    });

    it('returns 400 with a single message for a malformed code', async () => {
      const res = await api()
        .post('/api/auth/otp/verify')
        .send({ email: fixtures.user.email, code: '12ab' })
        .expect(400);
      expect(res.body).toEqual({ message: expect.any(String) });
    });

    it('returns 429 for verify attempts beyond the per-email limit', async () => {
      const limit = envNumber('OTP_RATE_LIMIT_PER_EMAIL');
      const email = `nobody@${fixtures.slug}.example`;
      for (let i = 0; i < limit; i++) {
        await api()
          .post('/api/auth/otp/verify')
          .send({ email, code: '123456' })
          .expect(401);
      }
      const res = await api()
        .post('/api/auth/otp/verify')
        .send({ email, code: '123456' })
        .expect(429);
      expect(res.body).toEqual(TOO_MANY);
    });
  });

  describe('sessions', () => {
    it('returns 401 without a session cookie', async () => {
      const res = await api().get('/api/auth/me').expect(401);
      expect(res.body).toEqual({ message: expect.any(String) });
    });

    it('returns 401 for an idle session and records SESSION_EXPIRED', async () => {
      const { cookie } = await login();
      const idleMinutes = envNumber('SESSION_IDLE_MINUTES');
      await prisma.session.updateMany({
        where: {
          tokenHash: createHash('sha256').update(cookie.token).digest('hex'),
        },
        data: { lastSeenAt: new Date(Date.now() - (idleMinutes + 1) * 60_000) },
      });

      await api()
        .get('/api/auth/me')
        .set('Cookie', `compel_session=${cookie.token}`)
        .expect(401);
      await expect(
        prisma.session.count({
          where: {
            tokenHash: createHash('sha256').update(cookie.token).digest('hex'),
          },
        }),
      ).resolves.toBe(0);
      await expect(
        prisma.authEvent.count({
          where: { userId: fixtures.user.id, type: 'SESSION_EXPIRED' },
        }),
      ).resolves.toBeGreaterThan(0);
    });

    it('returns 401 for a session past its absolute expiry', async () => {
      const { cookie } = await login();
      await prisma.session.updateMany({
        where: {
          tokenHash: createHash('sha256').update(cookie.token).digest('hex'),
        },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await api()
        .get('/api/auth/me')
        .set('Cookie', `compel_session=${cookie.token}`)
        .expect(401);
    });

    it('logout makes the session unusable and clears the cookie', async () => {
      const { cookie } = await login();
      const res = await api()
        .post('/api/auth/logout')
        .set('Cookie', `compel_session=${cookie.token}`)
        .expect(204);

      const cleared = sessionCookie(res.headers['set-cookie']);
      expect(cleared?.token).toBe('');
      expect(cleared?.attributes).toContain('httponly');
      expect(cleared?.attributes).toContain('samesite=lax');
      expect(cleared?.attributes).toContain('path=/');

      await api()
        .get('/api/auth/me')
        .set('Cookie', `compel_session=${cookie.token}`)
        .expect(401);
      await expect(
        prisma.authEvent.count({
          where: { userId: fixtures.user.id, type: 'LOGOUT' },
        }),
      ).resolves.toBeGreaterThan(0);
    });
  });
});
