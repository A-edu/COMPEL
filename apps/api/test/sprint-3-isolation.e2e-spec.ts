import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, type User } from '@prisma/client';
import request from 'supertest';
import type { PipelineRunner } from '../src/pipeline/pipeline-runner.service.js';
import type { PipelineStep } from '../src/pipeline/pipeline-steps.js';
import { REQUEST_NOT_FOUND } from '../src/requests/request-scope.js';
import { NOT_FLAGGED } from '../src/requests/review-decision.service.js';
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
import { standInChecks, useSteps } from './pipeline-helpers.js';

// Sprint 3 spec §12: access and isolation, with entities A, B and C, a
// request from A to B, and a compliance officer. Stand-in checks stand where
// extraction (§6) and the purpose check (§7.3) will be.
//
// Rows of §12 that need §9.1 (the reports' screens), §9.2 (the extracted
// fields) or §10 (corrections) are listed as todo until those are built.

const ROPA_PDF = buildPlaceholderPdf(['SYNTHETIC — DEMO DATA', 'RoPA entry']);
const OBJECTION = 'Objection text only the provider and officers may read.';
const JUSTIFICATION = 'The retention period is missing from the request.';
const UNKNOWN_ID = 'c000000000000000000000000';

// Nothing of these may reach the requester before or after an outcome: the
// findings and their clauses (one on its own documents, one on the RoPA),
// the flag sources and texts, the RoPA document, the position, the report.
const NEVER_FOR_THE_REQUESTER = [
  'FL-05',
  'CD-04',
  'Law Art',
  'IR Art',
  'stand-in',
  'PIPELINE',
  'PROVIDER_OBJECTION',
  OBJECTION,
  JUSTIFICATION,
  'ropa-entry.pdf',
  'ENDORSED',
  'OBJECTED',
  'flagReasons',
  'flagged',
  'finding',
  'report',
  'madeBy',
  'Not auto-cleared',
];

// The keys of the requester's detail, all of them (Sprint 2 spec §4,
// Sprint 3 spec §2.7).
const REQUESTER_DETAIL_KEYS = [
  'createdAt',
  'documents',
  'id',
  'myRole',
  'providingEntity',
  'reference',
  'requestingEntity',
  'status',
  'title',
];

// A step that waits until the test opens it, so the run can be watched.
function gatedStep() {
  let open!: () => void;
  let entered!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  const started = new Promise<void>((resolve) => (entered = resolve));
  const step: PipelineStep = {
    name: 'gate',
    async run() {
      entered();
      await opened;
      return { result: {} };
    },
  };
  return { step, open, started };
}

describe('Sprint 3 access and isolation (e2e, §12)', () => {
  const prisma = new PrismaClient();
  const steps: PipelineStep[] = standInChecks();
  let app: NestExpressApplication;
  let mail: MockMailTransport;
  let throttler: ResettableThrottlerStorage;
  let pipeline: PipelineRunner;
  let fixtures: Awaited<ReturnType<typeof createEntityFixtures>>;
  let a: EntityFixture;
  let b: EntityFixture;
  let c: EntityFixture;
  let officer: User;
  const cookies = { a: '', b: '', c: '', officer: '' };
  let mailAfterLogin: number;

  const server = () => app.getHttpServer();
  const get = (path: string, cookie: string) =>
    request(server()).get(`/api${path}`).set('Cookie', cookie);

  const newRequest = async (title = 'Isolation request') =>
    (await createTestRequest(prisma, { from: a, to: b, title })).request;

  function respond(
    id: string,
    { position = 'ENDORSED', cookie = cookies.b, extra = {} } = {} as {
      position?: string;
      cookie?: string;
      extra?: Record<string, string>;
    },
  ) {
    const req = request(server())
      .post(`/api/requests/${id}/response`)
      .set('Cookie', cookie)
      .field('position', position);
    if (position === 'OBJECTED') req.field('objectionReason', OBJECTION);
    for (const [key, value] of Object.entries(extra)) req.field(key, value);
    return req.attach('ropaDocument', ROPA_PDF, {
      filename: 'ropa-entry.pdf',
      contentType: 'application/pdf',
    });
  }

  const decide = (id: string, cookie: string, body: object = {}) =>
    request(server())
      .post(`/api/review/requests/${id}/decision`)
      .set('Cookie', cookie)
      .send({ outcome: 'REJECTED', justification: JUSTIFICATION, ...body });

  async function rowOf(direction: string, cookie: string, id: string) {
    const res = await get(`/requests?direction=${direction}`, cookie).expect(
      200,
    );
    return (res.body as Record<string, unknown>[]).find((r) => r.id === id);
  }

  async function queueIds(view: string) {
    const res = await get(
      `/review/requests?view=${view}`,
      cookies.officer,
    ).expect(200);
    return (res.body.items as { id: string }[]).map((r) => r.id);
  }

  // Everything the requester can fetch about a request: its detail, its row
  // in the sent list, and its RoPA document if it tries.
  async function requesterView(id: string) {
    const detail = await get(`/requests/${id}`, cookies.a).expect(200);
    const row = await rowOf('sent', cookies.a, id);
    const ropa = await prisma.document.findFirst({
      where: { requestId: id, kind: 'ROPA' },
    });
    const download = ropa
      ? await get(`/requests/${id}/documents/${ropa.id}`, cookies.a).expect(404)
      : undefined;
    return { detail, row, download };
  }

  function expectNothingForTheRequester(...texts: string[]) {
    for (const text of texts) {
      for (const secret of NEVER_FOR_THE_REQUESTER) {
        expect(text).not.toContain(secret);
      }
    }
  }

  // A request from A to B, the provider's response and its run, ended with
  // what the stand-in checks found.
  async function reviewed(
    findings: Parameters<typeof standInChecks>[0] = {},
    position = 'ENDORSED',
  ) {
    useSteps(steps, standInChecks(findings));
    const req = await newRequest();
    await respond(req.id, { position }).expect(201);
    await pipeline.drain();
    return req;
  }

  beforeAll(async () => {
    ({ app, mail, throttler, pipeline } = await createTestApp({ steps }));
    fixtures = await createEntityFixtures(prisma, 4);
    const [sdaia] = fixtures.entities.slice(3);
    [a, b, c] = fixtures.entities;
    officer = await createOfficer(prisma, sdaia);
    for (const [key, email] of [
      ['a', a.dpo.email],
      ['b', b.dpo.email],
      ['c', c.dpo.email],
      ['officer', officer.email],
    ] as const) {
      throttler.reset();
      cookies[key] = await loginAs(app, mail, email);
    }
    mailAfterLogin = mail.sent.length;
  });

  beforeEach(() => throttler.reset());

  afterAll(async () => {
    // Sprint 3 sends no request emails (§2.15): nobody, C included, got one.
    expect(mail.sent.length).toBe(mailAfterLogin);
    await fixtures?.cleanup();
    await app?.close();
    await prisma.$disconnect();
  });

  describe('before an outcome', () => {
    it('A sees "Under automated review" then "Under review", and nothing of the findings, the reasons or the RoPA', async () => {
      const gate = gatedStep();
      useSteps(steps, [
        gate.step,
        ...standInChecks({ 'FL-05': 'NOT_FOUND', 'CD-04': 'INCONSISTENT' }),
      ]);
      const req = await newRequest();
      await respond(req.id).expect(201);
      await gate.started;

      // Under automated review: every party and the officer see it.
      const during = await requesterView(req.id);
      expect(during.detail.body.status).toBe('UNDER_AUTOMATED_REVIEW');
      expect(Object.keys(during.detail.body).sort()).toEqual(
        REQUESTER_DETAIL_KEYS,
      );
      expect(during.row).toMatchObject({ status: 'UNDER_AUTOMATED_REVIEW' });
      expect(during.row).not.toHaveProperty('underReview');
      const provider = await get(`/requests/${req.id}`, cookies.b).expect(200);
      expect(provider.body.status).toBe('UNDER_AUTOMATED_REVIEW');
      expect(provider.body).not.toHaveProperty('flagged');

      gate.open();
      await pipeline.drain();

      // Flagged: A sees only "Under review".
      const after = await requesterView(req.id);
      expect(after.detail.body).toMatchObject({
        status: 'PROVIDER_RESPONDED',
        underReview: true,
      });
      expect(Object.keys(after.detail.body).sort()).toEqual(
        [...REQUESTER_DETAIL_KEYS, 'underReview'].sort(),
      );
      expect(after.row).toMatchObject({
        status: 'PROVIDER_RESPONDED',
        underReview: true,
      });
      expectNothingForTheRequester(
        during.detail.text,
        JSON.stringify(during.row),
        after.detail.text,
        JSON.stringify(after.row),
        JSON.stringify(after.download?.body),
      );
    });

    it('A cannot tell a request a check flagged from one the provider objected to', async () => {
      const byCheck = await reviewed({ 'FL-05': 'NOT_FOUND' });
      const byObjection = await reviewed({}, 'OBJECTED');

      const strip = (body: Record<string, unknown>) => {
        const { id, reference, createdAt, documents, ...rest } = body;
        void [id, reference, createdAt, documents];
        return rest;
      };
      const [x, y] = await Promise.all(
        [byCheck, byObjection].map((r) =>
          get(`/requests/${r.id}`, cookies.a).expect(200),
        ),
      );
      expect(strip(x.body)).toEqual(strip(y.body));
      expectNothingForTheRequester(x.text, y.text);
    });

    it('A keeps seeing "Responded" for a request flagged before Sprint 3', async () => {
      const req = await newRequest('Before Sprint 3');
      await prisma.flagReason.create({
        data: {
          requestId: req.id,
          source: 'PROVIDER_OBJECTION',
          text: OBJECTION,
        },
      });
      await prisma.dataSharingRequest.update({
        where: { id: req.id },
        data: { status: 'PROVIDER_RESPONDED' },
      });

      const { detail, row } = await requesterView(req.id);
      expect(detail.body.status).toBe('PROVIDER_RESPONDED');
      expect(detail.body).not.toHaveProperty('underReview');
      expect(row).not.toHaveProperty('underReview');
    });
  });

  describe('after an outcome', () => {
    it('A sees the system’s approval, and nothing from the RoPA, the position or the report', async () => {
      const req = await reviewed();

      const { detail, row, download } = await requesterView(req.id);
      expect(detail.body.status).toBe('APPROVED');
      expect(Object.keys(detail.body).sort()).toEqual(REQUESTER_DETAIL_KEYS);
      expect(row).toMatchObject({ status: 'APPROVED' });
      expectNothingForTheRequester(
        detail.text,
        JSON.stringify(row),
        JSON.stringify(download?.body),
      );
    });

    it('A sees an officer’s decision on a flagged request, and never the justification or the reasons', async () => {
      const req = await reviewed({
        'FL-05': 'NOT_FOUND',
        'CD-04': 'INCONSISTENT',
      });
      await decide(req.id, cookies.officer).expect(201);

      const { detail, row } = await requesterView(req.id);
      expect(detail.body.status).toBe('REJECTED');
      expect(Object.keys(detail.body).sort()).toEqual(REQUESTER_DETAIL_KEYS);
      expectNothingForTheRequester(detail.text, JSON.stringify(row));
    });

    it.todo(
      'A sees the reduced report: only checks on its own documents, their results and clauses, and the outcome (§9.1)',
    );
  });

  describe('B, the provider', () => {
    it('sees its request flagged, and opens its own RoPA entry', async () => {
      const req = await reviewed({ 'CD-04': 'INCONSISTENT' });

      const detail = await get(`/requests/${req.id}`, cookies.b).expect(200);
      expect(detail.body).toMatchObject({
        status: 'PROVIDER_RESPONDED',
        flagged: true,
        providerResponse: { position: 'ENDORSED' },
      });
      expect(detail.body).not.toHaveProperty('underReview');
      expect(await rowOf('received', cookies.b, req.id)).toMatchObject({
        flagged: true,
      });
      const ropaId = detail.body.providerResponse.ropaDocument.id as string;
      await get(`/requests/${req.id}/documents/${ropaId}`, cookies.b).expect(
        200,
      );
    });

    it.todo('sees its full report, extracted fields and findings (§9.1, §9.2)');
    it.todo('sees its own corrections (§10)');
  });

  describe('C, another entity', () => {
    it('sees nothing about the request in any list or view, before or after the outcome', async () => {
      const gate = gatedStep();
      useSteps(steps, [gate.step, ...standInChecks({ 'FL-05': 'NOT_FOUND' })]);
      const req = await newRequest();
      await respond(req.id).expect(201);
      await gate.started;

      const expectHidden = async () => {
        const detail = await get(`/requests/${req.id}`, cookies.c).expect(404);
        const unknown = await get(`/requests/${UNKNOWN_ID}`, cookies.c).expect(
          404,
        );
        expect(detail.body).toEqual({ message: REQUEST_NOT_FOUND });
        expect(unknown.body).toEqual(detail.body);
        const docs = await prisma.document.findMany({
          where: { requestId: req.id },
        });
        for (const doc of docs) {
          await get(
            `/requests/${req.id}/documents/${doc.id}`,
            cookies.c,
          ).expect(404);
        }
        for (const direction of ['sent', 'received']) {
          await expect(
            rowOf(direction, cookies.c, req.id),
          ).resolves.toBeUndefined();
        }
      };

      await expectHidden();
      gate.open();
      await pipeline.drain();
      await expectHidden();
      await decide(req.id, cookies.officer).expect(201);
      await expectHidden();
    });
  });

  describe('the officer', () => {
    it('sees the request in the queue while it is under automated review, and cannot decide it', async () => {
      const gate = gatedStep();
      useSteps(steps, [gate.step, ...standInChecks({ 'FL-05': 'NOT_FOUND' })]);
      const req = await newRequest();
      await respond(req.id, { position: 'OBJECTED' }).expect(201);
      await gate.started;

      await expect(queueIds('queue')).resolves.toContain(req.id);
      await expect(queueIds('pending')).resolves.toContain(req.id);
      await expect(queueIds('flagged')).resolves.not.toContain(req.id);
      const body = (
        await get(`/review/requests/${req.id}`, cookies.officer).expect(200)
      ).body;
      expect(body).toMatchObject({
        status: 'UNDER_AUTOMATED_REVIEW',
        flagged: false,
        decision: null,
      });
      const refused = await decide(req.id, cookies.officer).expect(409);
      expect(refused.body).toEqual({ message: NOT_FLAGGED });

      gate.open();
      await pipeline.drain();
      await expect(queueIds('flagged')).resolves.toContain(req.id);
    });
  });

  describe('values sent by the client', () => {
    it('cannot let any DPO record a decision, whatever the body says', async () => {
      const req = await reviewed({ 'FL-05': 'NOT_FOUND' });

      for (const cookie of [cookies.a, cookies.b, cookies.c]) {
        await decide(req.id, cookie, {
          outcome: 'APPROVED',
          madeBy: 'SYSTEM',
          role: 'COMPLIANCE_OFFICER',
        }).expect(404);
      }
      await expect(
        prisma.decision.findUnique({ where: { requestId: req.id } }),
      ).resolves.toBeNull();
    });

    it('cannot make the system approve: a status, decision or entity sent with a response is ignored', async () => {
      useSteps(steps, standInChecks({ 'FL-05': 'NOT_FOUND' }));
      const req = await newRequest();

      await respond(req.id, {
        extra: {
          status: 'APPROVED',
          outcome: 'APPROVED',
          madeBy: 'SYSTEM',
          entityId: a.entity.id,
          providingEntityId: a.entity.id,
        },
      }).expect(201);
      await pipeline.drain();

      const stored = await prisma.dataSharingRequest.findUniqueOrThrow({
        where: { id: req.id },
        include: { decision: true },
      });
      expect(stored).toMatchObject({
        status: 'PROVIDER_RESPONDED',
        providingEntityId: b.entity.id,
        decision: null,
      });
    });

    it('cannot let anyone but the provider respond: A is refused, C and the officer get "not found"', async () => {
      const req = await newRequest();

      await respond(req.id, { cookie: cookies.a }).expect(403);
      await respond(req.id, { cookie: cookies.c }).expect(404);
      await respond(req.id, { cookie: cookies.officer }).expect(404);
      await expect(
        prisma.pipelineRun.count({ where: { requestId: req.id } }),
      ).resolves.toBe(0);
    });

    it('cannot advance a pipeline run from outside: the internal route is not found for every user and token', async () => {
      useSteps(steps, standInChecks());
      const req = await newRequest();
      const held: string[] = [];
      vi.spyOn(pipeline, 'dispatch').mockImplementation((runId: string) => {
        held.push(runId);
        return Promise.resolve();
      });
      await respond(req.id).expect(201);
      vi.restoreAllMocks();

      for (const cookie of [cookies.a, cookies.b, cookies.c, cookies.officer]) {
        for (const token of [undefined, 'guess']) {
          const call = request(server())
            .post(`/api/internal/pipeline-runs/${held[0]}/advance`)
            .set('Cookie', cookie);
          if (token) call.set('x-pipeline-token', token);
          await call.expect(404);
        }
      }
      await expect(
        prisma.pipelineRun.findUniqueOrThrow({ where: { id: held[0] } }),
      ).resolves.toMatchObject({ state: 'QUEUED' });
      await expect(
        prisma.dataSharingRequest.findUniqueOrThrow({ where: { id: req.id } }),
      ).resolves.toMatchObject({ status: 'UNDER_AUTOMATED_REVIEW' });

      // Ends the held run the way the app would.
      await pipeline.advance(held[0]);
      await pipeline.drain();
    });

    it.todo(
      'A cannot submit a correction; C and the officer get "not found" (§10)',
    );
  });

  it('never records a rejection by the system', async () => {
    await reviewed();
    await reviewed({ 'PC-01': 'INCOMPATIBLE' });

    await expect(
      prisma.decision.count({
        where: { madeBy: 'SYSTEM', outcome: { not: 'APPROVED' } },
      }),
    ).resolves.toBe(0);
  });
});
