import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, type User } from '@prisma/client';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { FLAG_SOURCE_PROVIDER_OBJECTION } from '../src/requests/flag-reasons.js';
import { buildPlaceholderPdf } from '../src/seed/placeholder-pdf.js';
import {
  createTestApp,
  envNumber,
  loginAs,
  loginWithCode,
  type MockMailTransport,
  type ResettableThrottlerStorage,
} from './auth-helpers.js';
import {
  createEntityFixtures,
  createOfficer,
  createTestRequest,
  type EntityFixture,
} from './fixtures.js';

const NOT_FOUND = { message: 'Not found.' };
const UNKNOWN_ID = 'does-not-exist';

describe('Compliance officer access (e2e)', () => {
  const prisma = new PrismaClient();
  let app: NestExpressApplication;
  let mail: MockMailTransport;
  let throttler: ResettableThrottlerStorage;
  let fixtures: Awaited<ReturnType<typeof createEntityFixtures>>;
  // `sdaia` stands in for the officer's entity and is a party to `fromSdaia`.
  let sdaia: EntityFixture;
  let a: EntityFixture;
  let b: EntityFixture;
  let officer: User;

  const api = () => request(app.getHttpServer());
  const hash = (token: string) =>
    createHash('sha256').update(token).digest('hex');

  const flag = (requestId: string, text = 'Objection.') =>
    prisma.flagReason.create({
      data: { requestId, source: FLAG_SOURCE_PROVIDER_OBJECTION, text },
    });

  beforeAll(async () => {
    ({ app, mail, throttler } = await createTestApp());
    fixtures = await createEntityFixtures(prisma, 3);
    [sdaia, a, b] = fixtures.entities;
    officer = await createOfficer(prisma, sdaia);
  });

  beforeEach(() => throttler.reset());

  afterAll(async () => {
    await fixtures.cleanup();
    await app.close();
    await prisma.$disconnect();
  });

  describe('login', () => {
    it('tells an officer and a DPO their role once logged in', async () => {
      const asOfficer = await loginWithCode(app, mail, officer.email);
      expect(asOfficer.res.body.user.role).toBe('COMPLIANCE_OFFICER');
      const asDpo = await loginWithCode(app, mail, a.dpo.email);
      expect(asDpo.res.body.user.role).toBe('DPO');

      const me = await api()
        .get('/api/auth/me')
        .set('Cookie', `compel_session=${asOfficer.cookie.token}`)
        .expect(200);
      expect(me.body.user).toEqual({
        id: officer.id,
        email: officer.email,
        role: 'COMPLIANCE_OFFICER',
      });
    });

    it('treats an officer, a DPO and an unknown email the same before login', async () => {
      const emails = [officer.email, a.dpo.email, 'nobody@unknown.example'];
      const responses = [];
      for (const email of emails) {
        const res = await api()
          .post('/api/auth/otp/request')
          .send({ email })
          .expect(200);
        responses.push(res.body);
      }
      expect(responses[0]).toEqual(responses[1]);
      expect(responses[1]).toEqual(responses[2]);

      const failures = [];
      for (const email of emails) {
        const res = await api()
          .post('/api/auth/otp/verify')
          .send({ email, code: '000000' })
          .expect(401);
        failures.push(res.body);
      }
      expect(failures[0]).toEqual(failures[1]);
      expect(failures[1]).toEqual(failures[2]);
    });

    it('sends an officer the same login email as a DPO', async () => {
      const body = async (email: string) => {
        const before = mail.sent.length;
        await api().post('/api/auth/otp/request').send({ email }).expect(200);
        const { subject, text, from } = await mail.waitForMessage(before);
        return { subject, from, text: text.replace(/\d{6}/, 'CODE') };
      };
      expect(await body(officer.email)).toEqual(await body(a.dpo.email));
    });

    it('records an officer login and logout as for a DPO', async () => {
      const { cookie } = await loginWithCode(app, mail, officer.email);
      await api()
        .post('/api/auth/logout')
        .set('Cookie', `compel_session=${cookie.token}`)
        .expect(204);
      await api()
        .get('/api/review/requests')
        .set('Cookie', `compel_session=${cookie.token}`)
        .expect(401);

      for (const type of ['LOGIN_SUCCEEDED', 'LOGOUT'] as const) {
        await expect(
          prisma.authEvent.count({ where: { userId: officer.id, type } }),
        ).resolves.toBeGreaterThan(0);
      }
    });

    it('expires an idle officer session and records it', async () => {
      const { cookie } = await loginWithCode(app, mail, officer.email);
      const idleMinutes = envNumber('SESSION_IDLE_MINUTES');
      await prisma.session.updateMany({
        where: { tokenHash: hash(cookie.token) },
        data: { lastSeenAt: new Date(Date.now() - (idleMinutes + 1) * 60_000) },
      });

      await api()
        .get('/api/review/requests')
        .set('Cookie', `compel_session=${cookie.token}`)
        .expect(401);
      await expect(
        prisma.session.count({ where: { tokenHash: hash(cookie.token) } }),
      ).resolves.toBe(0);
      await expect(
        prisma.authEvent.count({
          where: { userId: officer.id, type: 'SESSION_EXPIRED' },
        }),
      ).resolves.toBeGreaterThan(0);
    });
  });

  describe('the review console', () => {
    it('needs a session', async () => {
      await api().get('/api/review/requests').expect(401);
    });

    it('is open to an officer', async () => {
      const cookie = await loginAs(app, mail, officer.email);
      const pending = await createTestRequest(prisma, { from: a, to: b });
      const res = await api()
        .get('/api/review/requests')
        .set('Cookie', cookie)
        .expect(200);
      const ids = (res.body as { items: { id: string }[] }).items.map(
        (r) => r.id,
      );
      expect(ids).toContain(pending.request.id);
    });

    it('refuses every DPO identically, whatever the client sends', async () => {
      const dpos = [a, b, sdaia].map((f) => f.dpo.email);
      for (const email of dpos) {
        const cookie = await loginAs(app, mail, email);
        const res = await api()
          .get(
            `/api/review/requests?role=COMPLIANCE_OFFICER&userId=${officer.id}`,
          )
          .set('Cookie', cookie)
          .set('X-Role', 'COMPLIANCE_OFFICER')
          .set('X-User-Id', officer.id)
          .set('X-Entity-Id', sdaia.entity.id)
          .expect(404);
        expect(res.body).toEqual(NOT_FOUND);
      }
    });

    it('follows the stored role, not what the session started with', async () => {
      const cookie = await loginAs(app, mail, a.dpo.email);
      await prisma.user.update({
        where: { id: a.dpo.id },
        data: { role: 'COMPLIANCE_OFFICER' },
      });
      await api().get('/api/review/requests').set('Cookie', cookie).expect(200);
      await prisma.user.update({
        where: { id: a.dpo.id },
        data: { role: 'DPO' },
      });
      await api().get('/api/review/requests').set('Cookie', cookie).expect(404);
    });
  });

  describe('an officer has no DPO access', () => {
    let cookie: string;
    let fromSdaia: string;
    let toSdaia: string;

    beforeAll(async () => {
      throttler.reset();
      cookie = await loginAs(app, mail, officer.email);
      fromSdaia = (await createTestRequest(prisma, { from: sdaia, to: a }))
        .request.id;
      toSdaia = (await createTestRequest(prisma, { from: a, to: sdaia }))
        .request.id;
      await flag(toSdaia);
    });

    it.each(['sent', 'received'])('has no %s list', async (direction) => {
      const res = await api()
        .get(`/api/requests?direction=${direction}`)
        .set('Cookie', cookie)
        .expect(404);
      expect(res.body).toEqual(NOT_FOUND);
    });

    it("cannot open a request through the DPO routes, even SDAIA's", async () => {
      for (const id of [fromSdaia, toSdaia, UNKNOWN_ID]) {
        const res = await api()
          .get(`/api/requests/${id}`)
          .set('Cookie', cookie)
          .expect(404);
        expect(res.body).toEqual(NOT_FOUND);
      }
    });

    it("cannot download a request's document through the DPO routes", async () => {
      const document = await prisma.document.findFirstOrThrow({
        where: { requestId: fromSdaia },
      });
      await api()
        .get(`/api/requests/${fromSdaia}/documents/${document.id}`)
        .set('Cookie', cookie)
        .expect(404);
    });

    it('cannot submit a request', async () => {
      await api()
        .post('/api/requests')
        .set('Cookie', cookie)
        .field('title', 'From an officer')
        .field('providingEntityId', a.entity.id)
        .attach('requestForm', buildPlaceholderPdf(['SYNTHETIC — DEMO DATA']), {
          filename: 'form.pdf',
          contentType: 'application/pdf',
        })
        .expect(404);
      await expect(
        prisma.dataSharingRequest.count({
          where: { submittedById: officer.id },
        }),
      ).resolves.toBe(0);
    });

    it('cannot respond to a request, even one sent to SDAIA', async () => {
      const pending = (await createTestRequest(prisma, { from: a, to: sdaia }))
        .request;
      await api()
        .post(`/api/requests/${pending.id}/response`)
        .set('Cookie', cookie)
        .field('position', 'ENDORSED')
        .attach(
          'ropaDocument',
          buildPlaceholderPdf(['SYNTHETIC — DEMO DATA']),
          {
            filename: 'ropa.pdf',
            contentType: 'application/pdf',
          },
        )
        .expect(404);
      await expect(
        prisma.providerResponse.count({ where: { requestId: pending.id } }),
      ).resolves.toBe(0);
    });

    it('cannot list providing entities', async () => {
      await api().get('/api/entities').set('Cookie', cookie).expect(404);
    });
  });

  it("keeps SDAIA's DPO working as a DPO", async () => {
    const cookie = await loginAs(app, mail, sdaia.dpo.email);
    await api()
      .get('/api/requests?direction=sent')
      .set('Cookie', cookie)
      .expect(200);
    await api().get('/api/entities').set('Cookie', cookie).expect(200);
  });
});
