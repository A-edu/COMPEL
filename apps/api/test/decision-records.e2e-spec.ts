import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, type Prisma, type User } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FLAG_SOURCE_PROVIDER_OBJECTION } from '../src/requests/flag-reasons.js';
import { buildPlaceholderPdf } from '../src/seed/placeholder-pdf.js';
import { seedDemoData } from '../src/seed/seed-data.js';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../src/storage/storage.interface.js';
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
  removeEntities,
  type EntityFixture,
} from './fixtures.js';

const ROPA_PDF = buildPlaceholderPdf(['SYNTHETIC — DEMO DATA', 'RoPA entry']);
const OBJECTION = 'The legal basis for sharing is not stated.';
// Distinctive, so finding it anywhere in a response means it leaked.
const JUSTIFICATION = 'Justification-7f3a: the purpose meets the PDPL conditions.';
// Stands in for a Sprint 3 source: nothing in the app knows this identifier.
const MADE_UP_SOURCE = 'MADE_UP_COMPLIANCE_CHECK';
const ROLE_REFUSAL = { message: 'Not found.' };
const SEEDED_FLAGGED_TITLE = 'Employee wage records for contribution audits';

const ENTITIES_JSON = join(
  dirname(fileURLToPath(import.meta.url)),
  '../prisma/seed/entities.json',
);

describe('Decision records (e2e)', () => {
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

  const get = (path: string, cookie: string) =>
    request(app.getHttpServer()).get(`/api${path}`).set('Cookie', cookie);

  const decide = (
    id: string,
    outcome: 'APPROVED' | 'REJECTED' = 'REJECTED',
    cookie = cookies.officer,
  ) =>
    request(app.getHttpServer())
      .post(`/api/review/requests/${id}/decision`)
      .set('Cookie', cookie)
      .send({ outcome, justification: JUSTIFICATION });

  const respond = (id: string, position = 'OBJECTED') => {
    const req = request(app.getHttpServer())
      .post(`/api/requests/${id}/response`)
      .set('Cookie', cookies.b)
      .field('position', position);
    if (position === 'OBJECTED') req.field('objectionReason', OBJECTION);
    return req.attach('ropaDocument', ROPA_PDF, {
      filename: 'ropa-entry.pdf',
      contentType: 'application/pdf',
    });
  };

  async function flagged(title: string) {
    const { request: req } = await createTestRequest(prisma, {
      from: a,
      to: b,
      title,
    });
    await respond(req.id).expect(201);
    return req;
  }

  async function decided(title: string, outcome?: 'APPROVED' | 'REJECTED') {
    const req = await flagged(title);
    await decide(req.id, outcome).expect(201);
    return req;
  }

  const stored = (requestId: string) =>
    prisma.decision.findUnique({ where: { requestId } });

  const statusOf = async (id: string) =>
    (await prisma.dataSharingRequest.findUniqueOrThrow({ where: { id } }))
      .status;

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await fixtures.cleanup();
    await app.close();
    await prisma.$disconnect();
  });

  describe('retrieving a decision', () => {
    it('shows the request, outcome, time, justification, officer and flag reasons', async () => {
      const req = await decided('Retrieved', 'APPROVED');
      const record = await stored(req.id);

      const res = await get(
        `/review/requests/${req.id}`,
        cookies.officer,
      ).expect(200);

      expect(res.body).toMatchObject({
        id: req.id,
        reference: req.reference,
        title: 'Retrieved',
        status: 'APPROVED',
        flagged: false,
        decision: {
          outcome: 'APPROVED',
          justification: JUSTIFICATION,
          createdAt: record?.createdAt.toISOString(),
          decidedBy: { email: officer.email },
        },
      });
      expect(Object.keys(res.body.decision).sort()).toEqual([
        'createdAt',
        'decidedBy',
        'justification',
        'outcome',
      ]);
      expect(res.body.flagReasons).toEqual([
        {
          id: expect.any(String),
          source: FLAG_SOURCE_PROVIDER_OBJECTION,
          text: OBJECTION,
          createdAt: expect.any(String),
        },
      ]);
    });

    it('can be read by another officer, and still names the one who decided', async () => {
      const req = await decided('Read by another');

      const res = await get(
        `/review/requests/${req.id}`,
        cookies.secondOfficer,
      ).expect(200);

      expect(res.body.decision).toMatchObject({
        justification: JUSTIFICATION,
        decidedBy: { email: officer.email },
      });
    });

    it('can be found through the decided view', async () => {
      const req = await decided('Found later');

      const list = await get(
        '/review/requests?view=decided',
        cookies.officer,
      ).expect(200);

      expect(
        (list.body as { items: { id: string }[] }).items.map((r) => r.id),
      ).toContain(
        req.id,
      );
    });

    it('is null before a decision exists', async () => {
      const { request: pending } = await createTestRequest(prisma, {
        from: a,
        to: b,
        title: 'Pending',
      });
      const objected = await flagged('Flagged');

      for (const id of [pending.id, objected.id]) {
        const res = await get(`/review/requests/${id}`, cookies.officer).expect(
          200,
        );
        expect(res.body.decision).toBeNull();
      }
    });

    it('marks a reason raised after the decision, and only that one', async () => {
      const req = await decided('Late reason');
      const record = await stored(req.id);
      const later = await prisma.flagReason.create({
        data: {
          requestId: req.id,
          source: MADE_UP_SOURCE,
          text: 'Arrived after the decision.',
          createdAt: new Date((record?.createdAt.getTime() ?? 0) + 1000),
        },
      });

      const res = await get(
        `/review/requests/${req.id}`,
        cookies.officer,
      ).expect(200);

      const [objection, late] = res.body.flagReasons as {
        id: string;
        raisedAfterDecision?: true;
      }[];
      expect(objection).not.toHaveProperty('raisedAfterDecision');
      expect(late).toMatchObject({ id: later.id, raisedAfterDecision: true });
      expect(res.body.status).toBe('REJECTED');
    });
  });

  describe('changing or removing a decision', () => {
    it.each(['patch', 'put', 'delete'] as const)(
      'has no %s route for any officer, and the record stays',
      async (method) => {
        const req = await decided(`No ${method}`);
        const before = await stored(req.id);

        const server = request(app.getHttpServer());
        for (const cookie of [cookies.officer, cookies.secondOfficer]) {
          for (const path of [
            `/api/review/requests/${req.id}/decision`,
            `/api/review/requests/${req.id}`,
          ]) {
            await server[method](path)
              .set('Cookie', cookie)
              .send({ outcome: 'APPROVED', justification: 'Changed my mind.' })
              .expect(404);
          }
        }

        await expect(stored(req.id)).resolves.toEqual(before);
        await expect(statusOf(req.id)).resolves.toBe('REJECTED');
      },
    );

    it('is not replaced by deciding again, even by the same officer', async () => {
      const req = await decided('Decided again');
      const before = await stored(req.id);

      await decide(req.id, 'APPROVED').expect(409);

      await expect(stored(req.id)).resolves.toEqual(before);
      await expect(statusOf(req.id)).resolves.toBe('REJECTED');
    });

    it('is not moved by the provider responding afterwards', async () => {
      const { request: req } = await createTestRequest(prisma, {
        from: a,
        to: b,
        title: 'Decided before a response',
      });
      await prisma.flagReason.create({
        data: { requestId: req.id, source: MADE_UP_SOURCE, text: 'A reason.' },
      });
      await decide(req.id).expect(201);
      const before = await stored(req.id);

      await respond(req.id).expect(409);

      await expect(stored(req.id)).resolves.toEqual(before);
      await expect(statusOf(req.id)).resolves.toBe('REJECTED');
    });
  });

  describe('saving failing partway', () => {
    // Fails one write inside the decision's transaction.
    function failInTransaction(model: 'decision' | 'dataSharingRequest') {
      const prismaService = app.get(PrismaService);
      const transaction = prismaService.$transaction.bind(prismaService);
      const failing = () => Promise.reject(new Error('Simulated failure.'));
      vi.spyOn(prismaService, '$transaction').mockImplementationOnce(((
        fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        transaction((tx) =>
          fn(
            new Proxy(tx, {
              get: (target, key) =>
                key === model
                  ? { create: failing, updateMany: failing }
                  : target[key as keyof typeof target],
            }),
          ),
        )) as never);
    }

    it('leaves no outcome when the record cannot be saved', async () => {
      const req = await flagged('Record fails');
      failInTransaction('decision');

      await decide(req.id).expect(500);

      await expect(statusOf(req.id)).resolves.toBe('PROVIDER_RESPONDED');
      await expect(stored(req.id)).resolves.toBeNull();
    });

    it('leaves no record when the outcome cannot be saved', async () => {
      const req = await flagged('Outcome fails');
      failInTransaction('dataSharingRequest');

      await decide(req.id).expect(500);

      await expect(statusOf(req.id)).resolves.toBe('PROVIDER_RESPONDED');
      await expect(stored(req.id)).resolves.toBeNull();
    });

    it('can still be decided after a failure', async () => {
      const req = await flagged('Retried');
      failInTransaction('decision');
      await decide(req.id).expect(500);

      await decide(req.id).expect(201);

      await expect(statusOf(req.id)).resolves.toBe('REJECTED');
      await expect(stored(req.id)).resolves.not.toBeNull();
    });
  });

  describe('the justification stays with officers', () => {
    it('shows the requester the outcome, and nothing of the decision or objection', async () => {
      const req = await decided('Requester view', 'APPROVED');

      const detail = await get(`/requests/${req.id}`, cookies.a).expect(200);
      expect(detail.body.status).toBe('APPROVED');
      expect(detail.body).not.toHaveProperty('decision');
      expect(detail.text).not.toContain(JUSTIFICATION);
      expect(detail.text).not.toContain(OBJECTION);

      const list = await get('/requests?direction=sent', cookies.a).expect(200);
      const row = (list.body as { id: string; status: string }[]).find(
        (r) => r.id === req.id,
      );
      expect(row).toMatchObject({ status: 'APPROVED' });
      expect(row).not.toHaveProperty('decision');
      expect(list.text).not.toContain(JUSTIFICATION);
      expect(list.text).not.toContain(OBJECTION);
    });

    it('shows the provider the outcome, and nothing of the decision', async () => {
      const req = await decided('Provider view', 'REJECTED');

      const detail = await get(`/requests/${req.id}`, cookies.b).expect(200);
      expect(detail.body.status).toBe('REJECTED');
      expect(detail.body).not.toHaveProperty('decision');
      expect(detail.text).not.toContain(JUSTIFICATION);

      const list = await get('/requests?direction=received', cookies.b).expect(
        200,
      );
      const row = (list.body as { id: string; status: string }[]).find(
        (r) => r.id === req.id,
      );
      expect(row).toMatchObject({ status: 'REJECTED' });
      expect(row).not.toHaveProperty('decision');
      expect(list.text).not.toContain(JUSTIFICATION);
    });

    it('refuses every DPO on the officer route, parties included', async () => {
      const req = await decided('Officer route');

      for (const cookie of [cookies.a, cookies.b, cookies.c, cookies.sdaia]) {
        const res = await get(`/review/requests/${req.id}`, cookie).expect(404);
        expect(res.body).toEqual(ROLE_REFUSAL);
      }
    });

    it('shows another entity nothing about the request', async () => {
      const req = await decided('Other entity');

      await get(`/requests/${req.id}`, cookies.c).expect(404);
      for (const direction of ['sent', 'received']) {
        const list = await get(
          `/requests?direction=${direction}`,
          cookies.c,
        ).expect(200);
        expect(list.text).not.toContain(req.id);
        expect(list.text).not.toContain(JUSTIFICATION);
      }
    });
  });

  describe('re-seeding', () => {
    const counts = async () => ({
      entities: await prisma.entity.count(),
      users: await prisma.user.count(),
      requests: await prisma.dataSharingRequest.count(),
      documents: await prisma.document.count(),
      responses: await prisma.providerResponse.count(),
      reasons: await prisma.flagReason.count(),
      decisions: await prisma.decision.count(),
    });

    afterAll(async () => {
      const seeded = JSON.parse(readFileSync(ENTITIES_JSON, 'utf-8')) as {
        slug: string;
      }[];
      const slugs = seeded.map((e) => e.slug);
      await removeEntities(
        prisma,
        await prisma.entity.findMany({ where: { slug: { in: slugs } } }),
      );
    });

    it('leaves a seeded request and its decision exactly as they were', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const storage = app.get<StorageService>(STORAGE_SERVICE);
      await seedDemoData(prisma, storage);

      const seeded = await prisma.dataSharingRequest.findFirstOrThrow({
        where: { title: SEEDED_FLAGGED_TITLE },
      });
      await decide(seeded.id, 'APPROVED').expect(201);
      const requestBefore = await prisma.dataSharingRequest.findUniqueOrThrow({
        where: { id: seeded.id },
      });
      const decisionBefore = await stored(seeded.id);
      const countsBefore = await counts();

      await seedDemoData(prisma, storage);

      await expect(
        prisma.dataSharingRequest.findUniqueOrThrow({
          where: { id: seeded.id },
        }),
      ).resolves.toEqual(requestBefore);
      await expect(stored(seeded.id)).resolves.toEqual(decisionBefore);
      await expect(counts()).resolves.toEqual(countsBefore);

      const res = await get(
        `/review/requests/${seeded.id}`,
        cookies.secondOfficer,
      ).expect(200);
      expect(res.body.decision).toMatchObject({
        outcome: 'APPROVED',
        justification: JUSTIFICATION,
      });
    });
  });
});
