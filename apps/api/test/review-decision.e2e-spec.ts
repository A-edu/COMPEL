import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, type User } from '@prisma/client';
import request from 'supertest';
import { buildPlaceholderPdf } from '../src/seed/placeholder-pdf.js';
import {
  createTestApp,
  loginAs,
  type MockMailTransport,
  type ResettableThrottlerStorage,
} from './auth-helpers.js';
import {
  createEntityFixtures,
  createOfficer,
  createTestRequest,
  type EntityFixture,
} from './fixtures.js';

const ROPA_PDF = buildPlaceholderPdf(['SYNTHETIC — DEMO DATA', 'RoPA entry']);
const OBJECTION = 'The legal basis for sharing is not stated.';
const JUSTIFICATION = 'The stated purpose meets the PDPL conditions.';
const LENGTH_MESSAGE = 'The justification must be 10 to 1000 characters.';
const ALREADY_DECIDED = 'This request has already been decided.';
const NOT_FLAGGED = 'Only a flagged request can be decided.';
// Stands in for a Sprint 3 source: nothing in the app knows this identifier.
const MADE_UP_SOURCE = 'MADE_UP_COMPLIANCE_CHECK';
const UNKNOWN_ID = 'does-not-exist';
const ROLE_REFUSAL = { message: 'Not found.' };
const REQUEST_REFUSAL = { message: 'Request not found.' };

describe('Final decision (e2e)', () => {
  const prisma = new PrismaClient();
  let app: NestExpressApplication;
  let mail: MockMailTransport;
  let throttler: ResettableThrottlerStorage;
  let fixtures: Awaited<ReturnType<typeof createEntityFixtures>>;
  let sdaia: EntityFixture;
  let a: EntityFixture;
  let b: EntityFixture;
  let c: EntityFixture;
  let officer: User;
  let secondOfficer: User;
  const cookies = {
    officer: '',
    secondOfficer: '',
    a: '',
    b: '',
    c: '',
    sdaia: '',
  };

  const decide = (id: string, body: object, cookie = cookies.officer) =>
    request(app.getHttpServer())
      .post(`/api/review/requests/${id}/decision`)
      .set('Cookie', cookie)
      .send(body);

  const newRequest = async (title: string, from = a, to = b) =>
    (await createTestRequest(prisma, { from, to, title })).request;

  function respond(id: string, position: string, objectionReason?: string) {
    const req = request(app.getHttpServer())
      .post(`/api/requests/${id}/response`)
      .set('Cookie', cookies.b)
      .field('position', position);
    if (objectionReason) req.field('objectionReason', objectionReason);
    return req
      .attach('ropaDocument', ROPA_PDF, {
        filename: 'ropa-entry.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
  }

  async function flaggedByObjection(title: string) {
    const req = await newRequest(title);
    await respond(req.id, 'OBJECTED', OBJECTION);
    return req;
  }

  const addReason = (requestId: string, text = 'Retention is missing.') =>
    prisma.flagReason.create({
      data: { requestId, source: MADE_UP_SOURCE, text },
    });

  const statusOf = async (id: string) =>
    (await prisma.dataSharingRequest.findUniqueOrThrow({ where: { id } }))
      .status;

  const decisionsOf = (requestId: string) =>
    prisma.decision.findMany({ where: { requestId } });

  // Refused, and nothing about the request moved.
  async function expectUnchanged(id: string, status: string) {
    await expect(statusOf(id)).resolves.toBe(status);
    await expect(decisionsOf(id)).resolves.toEqual([]);
  }

  beforeAll(async () => {
    ({ app, mail, throttler } = await createTestApp());
    fixtures = await createEntityFixtures(prisma, 4);
    [sdaia, a, b, c] = fixtures.entities;
    officer = await createOfficer(prisma, sdaia);
    secondOfficer = await prisma.user.create({
      data: {
        email: `officer-2@${sdaia.entity.slug}.example`,
        entityId: sdaia.entity.id,
        role: 'COMPLIANCE_OFFICER',
      },
    });
    cookies.officer = await loginAs(app, mail, officer.email);
    cookies.secondOfficer = await loginAs(app, mail, secondOfficer.email);
    cookies.a = await loginAs(app, mail, a.dpo.email);
    cookies.b = await loginAs(app, mail, b.dpo.email);
    cookies.c = await loginAs(app, mail, c.dpo.email);
    cookies.sdaia = await loginAs(app, mail, sdaia.dpo.email);
  });

  beforeEach(() => throttler.reset());

  afterAll(async () => {
    await fixtures.cleanup();
    await app.close();
    await prisma.$disconnect();
  });

  describe('recording a decision', () => {
    it.each(['APPROVED', 'REJECTED'] as const)(
      'moves a flagged request to %s and records who decided and why',
      async (outcome) => {
        const req = await flaggedByObjection(`Decide ${outcome}`);
        const before = new Date();

        const res = await decide(req.id, {
          outcome,
          justification: JUSTIFICATION,
        }).expect(201);

        expect(res.body).toEqual({ status: outcome });
        await expect(statusOf(req.id)).resolves.toBe(outcome);
        const [decision, ...others] = await decisionsOf(req.id);
        expect(others).toEqual([]);
        expect(decision).toMatchObject({
          requestId: req.id,
          outcome,
          justification: JUSTIFICATION,
          decidedById: officer.id,
        });
        expect(decision.createdAt.getTime()).toBeGreaterThanOrEqual(
          before.getTime() - 1000,
        );
      },
    );

    it('trims the justification before storing it', async () => {
      const req = await flaggedByObjection('Trimmed');

      await decide(req.id, {
        outcome: 'REJECTED',
        justification: `   ${JUSTIFICATION}\n`,
      }).expect(201);

      const [decision] = await decisionsOf(req.id);
      expect(decision.justification).toBe(JUSTIFICATION);
    });

    it('takes the officer from the session, not from the body', async () => {
      const req = await flaggedByObjection('Spoofed officer');

      await decide(
        req.id,
        {
          outcome: 'APPROVED',
          justification: JUSTIFICATION,
          decidedById: secondOfficer.id,
          userId: secondOfficer.id,
        },
        cookies.officer,
      ).expect(201);

      const [decision] = await decisionsOf(req.id);
      expect(decision.decidedById).toBe(officer.id);
    });

    it('lets an officer decide a request SDAIA is a party to', async () => {
      const req = await newRequest('From SDAIA', sdaia, b);
      await addReason(req.id);

      await decide(req.id, {
        outcome: 'APPROVED',
        justification: JUSTIFICATION,
      }).expect(201);
    });
  });

  describe('an invalid decision', () => {
    it.each([
      ['no justification', { outcome: 'APPROVED' }],
      ['an empty justification', { outcome: 'APPROVED', justification: '' }],
      ['spaces only', { outcome: 'APPROVED', justification: ' '.repeat(40) }],
      ['too short', { outcome: 'REJECTED', justification: 'Too short' }],
      [
        'short once trimmed',
        { outcome: 'REJECTED', justification: `   Too short   ` },
      ],
      [
        'too long',
        { outcome: 'REJECTED', justification: 'x'.repeat(1001) },
      ],
      ['not text', { outcome: 'REJECTED', justification: 1234567890 }],
    ])('is refused with %s, and the request stays', async (_, body) => {
      const req = await flaggedByObjection('Bad justification');

      const res = await decide(req.id, body).expect(400);

      expect(res.body.message).toContain(LENGTH_MESSAGE);
      await expectUnchanged(req.id, 'PROVIDER_RESPONDED');
    });

    it('accepts a justification of exactly 10 and 1000 characters', async () => {
      const short = await flaggedByObjection('Shortest');
      const long = await flaggedByObjection('Longest');

      await decide(short.id, {
        outcome: 'APPROVED',
        justification: 'x'.repeat(10),
      }).expect(201);
      await decide(long.id, {
        outcome: 'APPROVED',
        justification: 'x'.repeat(1000),
      }).expect(201);
    });

    it.each([
      ['no outcome', {}],
      ['an unknown outcome', { outcome: 'MAYBE' }],
      ['a status that is not an outcome', { outcome: 'PROVIDER_RESPONDED' }],
    ])('is refused with %s, and the request stays', async (_, extra) => {
      const req = await flaggedByObjection('Bad outcome');

      await decide(req.id, { justification: JUSTIFICATION, ...extra }).expect(
        400,
      );

      await expectUnchanged(req.id, 'PROVIDER_RESPONDED');
    });
  });

  describe('a request that cannot be decided', () => {
    const valid = { outcome: 'APPROVED', justification: JUSTIFICATION };

    it('refuses a pending request', async () => {
      const req = await newRequest('Pending');

      const res = await decide(req.id, valid).expect(409);

      expect(res.body.message).toBe(NOT_FLAGGED);
      await expectUnchanged(req.id, 'AWAITING_PROVIDER_RESPONSE');
    });

    it('refuses a request already decided, and keeps the first decision', async () => {
      const req = await flaggedByObjection('Decided twice');
      await decide(req.id, {
        outcome: 'REJECTED',
        justification: JUSTIFICATION,
      }).expect(201);

      const res = await decide(
        req.id,
        { outcome: 'APPROVED', justification: 'A different justification.' },
        cookies.secondOfficer,
      ).expect(409);

      expect(res.body.message).toBe(ALREADY_DECIDED);
      await expect(statusOf(req.id)).resolves.toBe('REJECTED');
      const [decision, ...others] = await decisionsOf(req.id);
      expect(others).toEqual([]);
      expect(decision).toMatchObject({
        outcome: 'REJECTED',
        justification: JUSTIFICATION,
        decidedById: officer.id,
      });
    });

    it('gives the same 404 for an endorsed request and an unknown ID', async () => {
      const req = await newRequest('Endorsed');
      await respond(req.id, 'ENDORSED');

      const closed = await decide(req.id, valid).expect(404);
      const unknown = await decide(UNKNOWN_ID, valid).expect(404);

      expect(closed.body).toEqual(REQUEST_REFUSAL);
      expect(unknown.body).toEqual(closed.body);
      await expectUnchanged(req.id, 'PROVIDER_RESPONDED');
    });
  });

  describe('two officers at once', () => {
    it('records exactly one decision and tells the other officer', async () => {
      // Repeated, because a single pass can miss the moment they overlap.
      for (let round = 0; round < 5; round++) {
        const req = await flaggedByObjection(`Race ${round}`);

        const [first, second] = await Promise.all([
          decide(
            req.id,
            { outcome: 'APPROVED', justification: 'Approved by the first.' },
            cookies.officer,
          ),
          decide(
            req.id,
            { outcome: 'REJECTED', justification: 'Rejected by the second.' },
            cookies.secondOfficer,
          ),
        ]);

        expect([first.status, second.status].sort()).toEqual([201, 409]);
        const loser = first.status === 409 ? first : second;
        expect(loser.body.message).toBe(ALREADY_DECIDED);

        // The stored status and the record agree, whoever won.
        const winner = first.status === 201 ? first : second;
        const decisions = await decisionsOf(req.id);
        expect(decisions).toHaveLength(1);
        expect(decisions[0].outcome).toBe(winner.body.status);
        await expect(statusOf(req.id)).resolves.toBe(winner.body.status);
      }
    });
  });

  describe('a reason from another source', () => {
    it('decides an endorsed request flagged only by that source', async () => {
      const req = await newRequest('Other source, endorsed');
      await respond(req.id, 'ENDORSED');
      await addReason(req.id);

      await decide(req.id, {
        outcome: 'REJECTED',
        justification: JUSTIFICATION,
      }).expect(201);

      await expect(statusOf(req.id)).resolves.toBe('REJECTED');
      await expect(decisionsOf(req.id)).resolves.toHaveLength(1);
    });

    it('decides a request flagged before the provider has responded', async () => {
      const req = await newRequest('Other source, no response');
      await addReason(req.id);

      await decide(req.id, {
        outcome: 'APPROVED',
        justification: JUSTIFICATION,
      }).expect(201);

      await expect(statusOf(req.id)).resolves.toBe('APPROVED');
    });

    it('keeps a reason arriving after the decision, without reopening it', async () => {
      const req = await flaggedByObjection('Late reason');
      await decide(req.id, {
        outcome: 'REJECTED',
        justification: JUSTIFICATION,
      }).expect(201);

      await addReason(req.id, 'Arrived after the decision.');

      await expect(
        prisma.flagReason.count({ where: { requestId: req.id } }),
      ).resolves.toBe(2);
      await expect(statusOf(req.id)).resolves.toBe('REJECTED');
      await decide(
        req.id,
        { outcome: 'APPROVED', justification: JUSTIFICATION },
        cookies.secondOfficer,
      ).expect(409);
    });
  });

  describe('everyone but an officer', () => {
    const valid = { outcome: 'APPROVED', justification: JUSTIFICATION };

    it('needs a session', async () => {
      const req = await flaggedByObjection('No session');

      await request(app.getHttpServer())
        .post(`/api/review/requests/${req.id}/decision`)
        .send(valid)
        .expect(401);

      await expectUnchanged(req.id, 'PROVIDER_RESPONDED');
    });

    it('gets the same refusal from every DPO, whatever the request and body', async () => {
      const pending = await newRequest('Pending');
      const objected = await flaggedByObjection('Objected');
      const endorsed = await newRequest('Endorsed');
      await respond(endorsed.id, 'ENDORSED');
      const decided = await flaggedByObjection('Decided');
      await decide(decided.id, valid).expect(201);

      const targets = [
        pending.id,
        objected.id,
        endorsed.id,
        decided.id,
        UNKNOWN_ID,
      ];
      for (const cookie of [cookies.a, cookies.b, cookies.c, cookies.sdaia]) {
        for (const id of targets) {
          for (const body of [valid, {}]) {
            const res = await decide(id, body, cookie).expect(404);
            expect(res.body).toEqual(ROLE_REFUSAL);
          }
        }
      }

      await expectUnchanged(objected.id, 'PROVIDER_RESPONDED');
      await expectUnchanged(pending.id, 'AWAITING_PROVIDER_RESPONSE');
    });

    it('gains nothing from values the client sends', async () => {
      const req = await flaggedByObjection('Spoofed role');

      const res = await request(app.getHttpServer())
        .post(
          `/api/review/requests/${req.id}/decision?role=COMPLIANCE_OFFICER&userId=${officer.id}`,
        )
        .set('Cookie', cookies.a)
        .set('X-Role', 'COMPLIANCE_OFFICER')
        .set('X-User-Id', officer.id)
        .send({
          ...valid,
          role: 'COMPLIANCE_OFFICER',
          userId: officer.id,
          entityId: sdaia.entity.id,
        })
        .expect(404);

      expect(res.body).toEqual(ROLE_REFUSAL);
      await expectUnchanged(req.id, 'PROVIDER_RESPONDED');
    });
  });

  describe('what the parties see afterwards', () => {
    it('shows the outcome, never the justification', async () => {
      const req = await flaggedByObjection('Outcome only');
      await decide(req.id, {
        outcome: 'REJECTED',
        justification: JUSTIFICATION,
      }).expect(201);

      for (const cookie of [cookies.a, cookies.b]) {
        const detail = await request(app.getHttpServer())
          .get(`/api/requests/${req.id}`)
          .set('Cookie', cookie)
          .expect(200);
        expect(detail.body).toMatchObject({ status: 'REJECTED' });
        expect(detail.text).not.toContain(JUSTIFICATION);
      }
    });
  });
});
