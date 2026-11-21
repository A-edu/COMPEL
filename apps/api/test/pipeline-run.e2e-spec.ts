import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import request from 'supertest';
import { StandInModelClient } from '../src/pipeline/model/stand-in-model-client.js';
import type { PipelineRunner } from '../src/pipeline/pipeline-runner.service.js';
import type { PipelineStep } from '../src/pipeline/pipeline-steps.js';
import { PipelineSweeper } from '../src/pipeline/pipeline-sweeper.service.js';
import {
  PIPELINE_ERROR_TEXT,
  RULE_SET_VERSION,
} from '../src/pipeline/pipeline.constants.js';
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

// Sprint 3 spec §2.3, §3.1, §4.3 and §5.6: the run engine, with steps of the
// test's own (the pipeline's real steps are §6–§8).

const ROPA_PDF = buildPlaceholderPdf(['SYNTHETIC — DEMO DATA', 'RoPA entry']);
const OBJECTION = 'The request does not state a legal basis.';

// A step that waits until the test opens it.
function gatedStep(name: string) {
  let open!: () => void;
  let entered!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  const started = new Promise<void>((resolve) => (entered = resolve));
  const step: PipelineStep = {
    name,
    async run() {
      entered();
      await opened;
      return { result: { gated: true } };
    },
  };
  return { step, open, started };
}

describe('Pipeline runs (e2e)', () => {
  const prisma = new PrismaClient();
  const steps: PipelineStep[] = [];
  const model = new StandInModelClient();
  let app: NestExpressApplication;
  let mail: MockMailTransport;
  let throttler: ResettableThrottlerStorage;
  let pipeline: PipelineRunner;
  let fixtures: Awaited<ReturnType<typeof createEntityFixtures>>;
  let a: EntityFixture;
  let b: EntityFixture;
  const cookies: Record<string, string> = {};

  const newRequest = async (title = 'Pipeline test request') =>
    (await createTestRequest(prisma, { from: a, to: b, title })).request;

  const respond = (id: string, position = 'ENDORSED') => {
    const req = request(app.getHttpServer())
      .post(`/api/requests/${id}/response`)
      .set('Cookie', cookies.b)
      .field('position', position);
    if (position === 'OBJECTED') req.field('objectionReason', OBJECTION);
    return req
      .attach('ropaDocument', ROPA_PDF, {
        filename: 'ropa-entry.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
  };

  const runOf = (requestId: string) =>
    prisma.pipelineRun.findFirstOrThrow({ where: { requestId } });
  const statusOf = async (id: string) =>
    (await prisma.dataSharingRequest.findUniqueOrThrow({ where: { id } }))
      .status;
  const reasonsOf = (requestId: string) =>
    prisma.flagReason.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
      select: { source: true, text: true },
    });
  const queue = async (view: string) =>
    (
      await request(app.getHttpServer())
        .get(`/api/review/requests?view=${view}`)
        .set('Cookie', cookies.officer)
        .expect(200)
    ).body.items as { id: string; flagged: boolean; status: string }[];
  const decide = (id: string) =>
    request(app.getHttpServer())
      .post(`/api/review/requests/${id}/decision`)
      .set('Cookie', cookies.officer)
      .send({
        outcome: 'APPROVED',
        justification: 'Reviewed against the PDPL.',
      });

  beforeAll(async () => {
    ({ app, mail, throttler, pipeline } = await createTestApp({
      steps,
      model,
    }));
    fixtures = await createEntityFixtures(prisma, 3);
    let sdaia: EntityFixture;
    [sdaia, a, b] = fixtures.entities;
    const officer = await createOfficer(prisma, sdaia);
    cookies.officer = await loginAs(app, mail, officer.email);
    cookies.a = await loginAs(app, mail, a.dpo.email);
    cookies.b = await loginAs(app, mail, b.dpo.email);
  });

  beforeEach(() => {
    throttler.reset();
    steps.length = 0;
    model.calls.length = 0;
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await pipeline?.drain();
    await fixtures?.cleanup();
    await app?.close();
    await prisma.$disconnect();
  });

  it('runs each step once, in order, with its context, then leaves automated review', async () => {
    model.script('extract', { model: 'stand-in', text: 'read' });
    steps.push(
      {
        name: 'extract',
        async run(ctx) {
          const answer = await ctx.callModel({
            content: [{ type: 'text', text: 'Read the documents.' }],
          });
          const loaded = await Promise.all(
            ctx.documents.map(async (doc) => ({
              kind: doc.kind,
              bytes: (await doc.load()).length,
            })),
          );
          return {
            result: {
              answer: answer.text,
              position: ctx.request.position,
              ruleSet: ctx.ruleSetVersion,
              documents: loaded.sort((x, y) => x.kind.localeCompare(y.kind)),
            },
          };
        },
      },
      {
        name: 'check',
        async run(ctx) {
          return {
            result: { saw: (ctx.results.extract as { answer: string }).answer },
          };
        },
      },
    );
    const req = await newRequest();

    await respond(req.id);
    await pipeline.drain();

    const run = await runOf(req.id);
    expect(run).toMatchObject({
      trigger: 'RESPONSE',
      state: 'COMPLETED',
      ruleSetVersion: RULE_SET_VERSION,
      leaseUntil: null,
      models: [
        { step: 'extract', model: 'claude-haiku-5-5' },
        { step: 'check', model: 'claude-haiku-5-5' },
      ],
    });
    expect(run.startedAt).toBeInstanceOf(Date);
    expect(run.endedAt).toBeInstanceOf(Date);
    const results = run.stepResults as Record<string, any>;
    expect(results.check).toEqual({ saw: 'read' });
    expect(results.extract).toMatchObject({
      answer: 'read',
      position: 'ENDORSED',
      ruleSet: RULE_SET_VERSION,
    });
    expect(
      results.extract.documents.map((d: { kind: string }) => d.kind),
    ).toEqual(['REQUEST_FORM', 'ROPA']);
    for (const doc of results.extract.documents)
      expect(doc.bytes).toBeGreaterThan(0);
    // The call used the step's name and the model the run recorded for it.
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0]).toMatchObject({
      step: 'extract',
      model: 'claude-haiku-5-5',
    });

    // These steps check nothing, so no check of the rule set has a finding
    // and the outcome rule (§8) cannot clear the request: it leaves
    // automated review flagged with the pipeline-error reason.
    await expect(statusOf(req.id)).resolves.toBe('PROVIDER_RESPONDED');
    await expect(reasonsOf(req.id)).resolves.toEqual([
      { source: 'PIPELINE', text: PIPELINE_ERROR_TEXT },
    ]);
  });

  it('runs a step that asks for more again, each time in a new advance', async () => {
    let runs = 0;
    steps.push({
      name: 'paged',
      async run(ctx) {
        runs++;
        const seen =
          ((ctx.results.paged as { pages?: number })?.pages ?? 0) + 1;
        return { result: { pages: seen }, more: seen < 3 };
      },
    });
    const advance = vi.spyOn(pipeline, 'advance');
    const req = await newRequest();

    await respond(req.id);
    await pipeline.drain();

    expect(runs).toBe(3);
    expect(advance).toHaveBeenCalledTimes(3);
    const run = await runOf(req.id);
    expect(run.state).toBe('COMPLETED');
    expect(run.stepResults).toEqual({ paged: { pages: 3 } });
  });

  it('keeps the request under automated review, unflagged and undecidable, until its run ends', async () => {
    const gate = gatedStep('gate');
    steps.push(gate.step);
    const req = await newRequest('Objected, under automated review');

    const res = await respond(req.id, 'OBJECTED');
    expect(res.body).toEqual({ status: 'UNDER_AUTOMATED_REVIEW' });
    await gate.started;

    await expect(statusOf(req.id)).resolves.toBe('UNDER_AUTOMATED_REVIEW');
    expect((await runOf(req.id)).state).toBe('RUNNING');

    // Both parties see the stage; nobody sees a flag.
    for (const cookie of [cookies.a, cookies.b]) {
      const detail = await request(app.getHttpServer())
        .get(`/api/requests/${req.id}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(detail.body.status).toBe('UNDER_AUTOMATED_REVIEW');
      expect(detail.body.flagged).not.toBe(true);
    }
    const requester = await request(app.getHttpServer())
      .get(`/api/requests/${req.id}`)
      .set('Cookie', cookies.a)
      .expect(200);
    expect(requester.text).not.toContain(OBJECTION);

    // The officer can reach and open it, with the pending requests, but not
    // decide it, although it already carries an objection.
    expect((await queue('pending')).find((r) => r.id === req.id)).toMatchObject(
      {
        status: 'UNDER_AUTOMATED_REVIEW',
        flagged: false,
      },
    );
    expect((await queue('flagged')).map((r) => r.id)).not.toContain(req.id);
    await request(app.getHttpServer())
      .get(`/api/review/requests/${req.id}`)
      .set('Cookie', cookies.officer)
      .expect(200);
    await decide(req.id).expect(409);
    await expect(
      prisma.decision.count({ where: { requestId: req.id } }),
    ).resolves.toBe(0);

    // The run ends: the objection now flags it, and it can be decided.
    gate.open();
    await pipeline.drain();
    await expect(statusOf(req.id)).resolves.toBe('PROVIDER_RESPONDED');
    expect((await queue('flagged')).map((r) => r.id)).toContain(req.id);
    await decide(req.id).expect(201);
  });

  it('ends a failed run flagged with the pipeline-error reason, and nothing else', async () => {
    // No stand-in answer for this step: the call fails like a missing key.
    steps.push({
      name: 'unscripted',
      async run(ctx) {
        await ctx.callModel({ content: [{ type: 'text', text: 'Hello' }] });
        return { result: null };
      },
    });
    const req = await newRequest('Pipeline failure');

    await respond(req.id);
    await pipeline.drain();

    const run = await runOf(req.id);
    expect(run.state).toBe('FAILED');
    expect(run.endedAt).toBeInstanceOf(Date);
    const reasons = await reasonsOf(req.id);
    expect(reasons).toEqual([
      { source: 'PIPELINE', text: PIPELINE_ERROR_TEXT },
    ]);
    expect(reasons[0].text).not.toMatch(/key|anthropic|stand-in|unscripted/i);
    await expect(statusOf(req.id)).resolves.toBe('PROVIDER_RESPONDED');
    expect((await queue('flagged')).map((r) => r.id)).toContain(req.id);
  });

  it('does nothing when a run is advanced again, while running or after it ended', async () => {
    let calls = 0;
    const gate = gatedStep('gate');
    steps.push({
      name: 'gate',
      async run(ctx) {
        calls++;
        return gate.step.run(ctx);
      },
    });
    const req = await newRequest('Advanced twice');

    await respond(req.id);
    await gate.started;
    const { id } = await runOf(req.id);
    await expect(pipeline.advance(id)).resolves.toBe('skipped');

    gate.open();
    await pipeline.drain();
    expect((await runOf(req.id)).state).toBe('COMPLETED');
    await expect(pipeline.advance(id)).resolves.toBe('skipped');
    await expect(pipeline.advance('no-such-run')).resolves.toBe('skipped');

    expect(calls).toBe(1);
    await expect(
      prisma.pipelineRun.count({ where: { requestId: req.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.decision.count({ where: { requestId: req.id } }),
    ).resolves.toBe(0);
  });

  it('ends stale runs flagged without running a step, and leaves live ones alone', async () => {
    const stepRan = vi.fn();
    steps.push({
      name: 'never',
      async run() {
        stepRan();
        return { result: null };
      },
    });
    const make = async (
      title: string,
      state: 'RUNNING' | 'QUEUED',
      leaseMs: number,
    ) => {
      const req = await newRequest(title);
      await prisma.dataSharingRequest.update({
        where: { id: req.id },
        data: { status: 'UNDER_AUTOMATED_REVIEW' },
      });
      const run = await prisma.pipelineRun.create({
        data: {
          requestId: req.id,
          trigger: 'RESPONSE',
          state,
          models: [{ step: 'never', model: 'claude-haiku-5-5' }],
          ruleSetVersion: RULE_SET_VERSION,
          leaseUntil:
            state === 'RUNNING' ? new Date(Date.now() + leaseMs) : null,
        },
      });
      return { req, run };
    };
    const lapsed = await make('Lease lapsed', 'RUNNING', -1000);
    const live = await make('Lease live', 'RUNNING', 60_000);
    const orphan = await make('Never picked up', 'QUEUED', 0);
    await prisma.$executeRaw`UPDATE "PipelineRun" SET "updatedAt" = now() - interval '10 minutes' WHERE id = ${orphan.run.id}`;

    await expect(app.get(PipelineSweeper).sweep()).resolves.toBe(2);

    for (const { req } of [lapsed, orphan]) {
      expect((await runOf(req.id)).state).toBe('FAILED');
      await expect(reasonsOf(req.id)).resolves.toEqual([
        { source: 'PIPELINE', text: PIPELINE_ERROR_TEXT },
      ]);
      await expect(statusOf(req.id)).resolves.toBe('PROVIDER_RESPONDED');
    }
    expect((await runOf(live.req.id)).state).toBe('RUNNING');
    await expect(statusOf(live.req.id)).resolves.toBe('UNDER_AUTOMATED_REVIEW');
    expect(stepRan).not.toHaveBeenCalled();
    expect(model.calls).toHaveLength(0);

    // A second sweep finds nothing more to end.
    await expect(app.get(PipelineSweeper).sweep()).resolves.toBe(0);
    await prisma.pipelineRun.update({
      where: { id: live.run.id },
      data: { state: 'FAILED' },
    });
  });
});

// The production path: each step is an internal request to the app's own URL
// (Sprint 3 spec §4.3), here the test server on a local port.
describe('Internal advance requests (e2e)', () => {
  const prisma = new PrismaClient();
  const token = `e2e-${randomBytes(16).toString('hex')}`;
  const steps: PipelineStep[] = [];
  let app: NestExpressApplication;
  let mail: MockMailTransport;
  let pipeline: PipelineRunner;
  let fixtures: Awaited<ReturnType<typeof createEntityFixtures>>;
  let a: EntityFixture;
  let b: EntityFixture;
  let cookie: string;
  let base: string;
  const stepCalls: string[] = [];

  const advanceRequest = (id: string, headerToken?: string) => {
    const req = request(base).post(`/api/internal/pipeline-runs/${id}/advance`);
    if (headerToken !== undefined) req.set('x-pipeline-token', headerToken);
    return req;
  };

  async function freePort(): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as { port: number };
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return port;
  }

  // Waits until the run has ended; the steps run in other requests.
  async function settled(requestId: string) {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const run = await prisma.pipelineRun.findFirstOrThrow({
        where: { requestId },
      });
      if (run.state === 'COMPLETED' || run.state === 'FAILED') return run;
      if (Date.now() > deadline) throw new Error('The run did not end.');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  beforeAll(async () => {
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    process.env.PIPELINE_INTERNAL_TOKEN = token;
    process.env.PIPELINE_SELF_URL = base;
    ({ app, mail, pipeline } = await createTestApp({ steps }));
    await app.listen(port, '127.0.0.1');
    fixtures = await createEntityFixtures(prisma, 2);
    [a, b] = fixtures.entities;
    cookie = await loginAs(app, mail, b.dpo.email);
  });

  beforeEach(() => {
    steps.length = 0;
    stepCalls.length = 0;
    steps.push(
      {
        name: 'one',
        async run() {
          stepCalls.push('one');
          return { result: 1 };
        },
      },
      {
        name: 'two',
        async run() {
          stepCalls.push('two');
          return { result: 2 };
        },
      },
    );
  });

  afterAll(async () => {
    delete process.env.PIPELINE_INTERNAL_TOKEN;
    delete process.env.PIPELINE_SELF_URL;
    await fixtures?.cleanup();
    await app?.close();
    await prisma.$disconnect();
  });

  // A responded request with a queued run, written straight to the database.
  async function queuedRun(title: string) {
    const { request: req, requestForm } = await createTestRequest(prisma, {
      from: a,
      to: b,
      title,
    });
    await prisma.dataSharingRequest.update({
      where: { id: req.id },
      data: {
        status: 'UNDER_AUTOMATED_REVIEW',
        providerResponse: {
          create: {
            position: 'ENDORSED',
            respondedById: b.dpo.id,
            // The request form stands in for the RoPA document: these steps
            // never read it.
            ropaDocumentId: requestForm.id,
          },
        },
      },
    });
    const { id } = await prisma.pipelineRun.create({
      data: {
        requestId: req.id,
        trigger: 'RESPONSE',
        models: [
          { step: 'one', model: 'claude-haiku-5-5' },
          { step: 'two', model: 'claude-haiku-5-5' },
        ],
        ruleSetVersion: RULE_SET_VERSION,
      },
    });
    return { req, id };
  }

  it('runs a response through every step, each in its own internal request', async () => {
    const { request: req } = await createTestRequest(prisma, {
      from: a,
      to: b,
      title: 'Through the internal endpoint',
    });

    await request(base)
      .post(`/api/requests/${req.id}/response`)
      .set('Cookie', cookie)
      .field('position', 'ENDORSED')
      .attach('ropaDocument', ROPA_PDF, {
        filename: 'ropa-entry.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const run = await settled(req.id);
    expect(run.state).toBe('COMPLETED');
    expect(run.stepResults).toEqual({ one: 1, two: 2 });
    expect(stepCalls).toEqual(['one', 'two']);
    expect(
      (
        await prisma.dataSharingRequest.findUniqueOrThrow({
          where: { id: req.id },
        })
      ).status,
    ).toBe('PROVIDER_RESPONDED');
  });

  it.each([
    ['no token', undefined],
    ['an empty token', ''],
    ['a wrong token', 'not-the-token'],
    ['a token of another length', `${token}x`],
  ])(
    'is a 404 with %s, and the run is untouched',
    async (_label, headerToken) => {
      const { id } = await queuedRun('Wrong token');

      const res = await advanceRequest(id, headerToken).expect(404);
      expect(res.body).toEqual({ message: 'Not found.' });

      const run = await prisma.pipelineRun.findUniqueOrThrow({ where: { id } });
      expect(run).toMatchObject({
        state: 'QUEUED',
        nextStep: 0,
        startedAt: null,
      });
      expect(stepCalls).toEqual([]);
    },
  );

  it('advances only an existing queued run, once, and creates nothing', async () => {
    const { req, id } = await queuedRun('Advanced by hand');
    const runsBefore = await prisma.pipelineRun.count();
    const decisionsBefore = await prisma.decision.count();

    await advanceRequest(id, token).expect(202);
    const run = await settled(req.id);
    expect(run.state).toBe('COMPLETED');
    expect(stepCalls).toEqual(['one', 'two']);

    // Again, for a finished run and for an unknown one: accepted, no effect.
    await advanceRequest(id, token).expect(202);
    await advanceRequest('no-such-run', token).expect(202);
    expect(stepCalls).toEqual(['one', 'two']);
    await expect(prisma.pipelineRun.count()).resolves.toBe(runsBefore);
    await expect(prisma.decision.count()).resolves.toBe(decisionsBefore);
  });

  it('runs a step once when two advance requests for it arrive together', async () => {
    const { req, id } = await queuedRun('Advanced twice at once');

    await Promise.all([
      advanceRequest(id, token).expect(202),
      advanceRequest(id, token).expect(202),
    ]);
    await settled(req.id);

    expect(stepCalls).toEqual(['one', 'two']);
  });

  it('ends the run flagged when the next step cannot be triggered', async () => {
    const { req, id } = await queuedRun('Cannot trigger');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unreachable'));

    await pipeline.dispatch(id);
    vi.restoreAllMocks();

    const run = await prisma.pipelineRun.findUniqueOrThrow({ where: { id } });
    expect(run.state).toBe('FAILED');
    await expect(
      prisma.flagReason.findMany({
        where: { requestId: req.id },
        select: { source: true, text: true },
      }),
    ).resolves.toEqual([{ source: 'PIPELINE', text: PIPELINE_ERROR_TEXT }]);
    expect(stepCalls).toEqual([]);
  });
});
