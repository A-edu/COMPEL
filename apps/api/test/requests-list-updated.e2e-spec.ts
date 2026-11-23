import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, type Position, type User } from '@prisma/client';
import request from 'supertest';
import type { PipelineRunner } from '../src/pipeline/pipeline-runner.service.js';
import type { PipelineStep } from '../src/pipeline/pipeline-steps.js';
import { RULE_SET_VERSION } from '../src/pipeline/rule-set.js';
import { FLAG_SOURCE_PROVIDER_OBJECTION } from '../src/requests/flag-reasons.js';
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

// GET /requests -> statusChangedAt: when the status each party sees last
// changed (docs/design/sprint-2.md -> DPO requests list). It must follow the
// visible status and nothing else.

const ROPA_PDF = buildPlaceholderPdf(['SYNTHETIC — DEMO DATA', 'RoPA entry']);
const OBJECTION = 'The stated purpose does not match our collection purpose.';
const JUSTIFICATION = 'The purpose is incompatible with the original one.';

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

// A step that waits until the test opens it, so a run can be watched.
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

describe('GET /requests -> statusChangedAt (e2e)', () => {
  const prisma = new PrismaClient();
  const steps: PipelineStep[] = standInChecks();
  let app: NestExpressApplication;
  let mail: MockMailTransport;
  let throttler: ResettableThrottlerStorage;
  let pipeline: PipelineRunner;
  let fixtures: Awaited<ReturnType<typeof createEntityFixtures>>;
  let a: EntityFixture;
  let b: EntityFixture;
  let officer: User;
  const cookies = { a: '', b: '', officer: '' };

  const server = () => app.getHttpServer();
  const get = (path: string, cookie: string) =>
    request(server()).get(`/api${path}`).set('Cookie', cookie);

  // A request from A to B, created `age` minutes ago.
  async function newRequest(title: string, age = 60) {
    const { request: req } = await createTestRequest(prisma, {
      from: a,
      to: b,
      title,
    });
    await prisma.dataSharingRequest.update({
      where: { id: req.id },
      data: { createdAt: minutesAgo(age) },
    });
    return req;
  }

  const respond = (id: string, position: Position) => {
    const req = request(server())
      .post(`/api/requests/${id}/response`)
      .set('Cookie', cookies.b)
      .field('position', position);
    if (position === 'OBJECTED') req.field('objectionReason', OBJECTION);
    return req.attach('ropaDocument', ROPA_PDF, {
      filename: 'ropa-entry.pdf',
      contentType: 'application/pdf',
    });
  };

  // What each party's list says, as ISO strings.
  async function changedAt(id: string) {
    const row = async (direction: string, cookie: string) => {
      const res = await get(`/requests?direction=${direction}`, cookie).expect(
        200,
      );
      const found = (
        res.body as { id: string; statusChangedAt: string }[]
      ).find((r) => r.id === id);
      expect(found).toBeDefined();
      return found!.statusChangedAt;
    };
    return {
      requester: await row('sent', cookies.a),
      provider: await row('received', cookies.b),
    };
  }

  const latestRun = (requestId: string) =>
    prisma.pipelineRun.findFirstOrThrow({
      where: { requestId },
      orderBy: { createdAt: 'desc' },
    });

  // A provider response as stored before Sprint 3: no pipeline run, and an
  // objection's reason beside it.
  async function sprint2Response(
    title: string,
    position: Position,
    respondedAt: Date,
  ) {
    const req = await newRequest(title);
    const ropa = await prisma.document.create({
      data: {
        requestId: req.id,
        kind: 'ROPA',
        storageKey: `seed/e2e-${req.id}/ropa.pdf`,
        originalName: 'ropa.pdf',
        mimeType: 'application/pdf',
        sizeBytes: ROPA_PDF.length,
        uploadedById: b.dpo.id,
      },
    });
    await prisma.providerResponse.create({
      data: {
        requestId: req.id,
        ropaDocumentId: ropa.id,
        position,
        objectionReason: position === 'OBJECTED' ? OBJECTION : null,
        respondedById: b.dpo.id,
        createdAt: respondedAt,
      },
    });
    if (position === 'OBJECTED') {
      await prisma.flagReason.create({
        data: {
          requestId: req.id,
          source: FLAG_SOURCE_PROVIDER_OBJECTION,
          text: OBJECTION,
          createdAt: respondedAt,
        },
      });
    }
    await prisma.dataSharingRequest.update({
      where: { id: req.id },
      data: { status: 'PROVIDER_RESPONDED' },
    });
    return req;
  }

  beforeAll(async () => {
    ({ app, mail, throttler, pipeline } = await createTestApp({ steps }));
    fixtures = await createEntityFixtures(prisma, 3);
    const [sdaia] = fixtures.entities.slice(2);
    [a, b] = fixtures.entities;
    officer = await createOfficer(prisma, sdaia);
    for (const [key, email] of [
      ['a', a.dpo.email],
      ['b', b.dpo.email],
      ['officer', officer.email],
    ] as const) {
      throttler.reset();
      cookies[key] = await loginAs(app, mail, email);
    }
  });

  beforeEach(() => {
    throttler.reset();
    useSteps(steps, standInChecks());
  });

  afterAll(async () => {
    await fixtures?.cleanup();
    await app?.close();
    await prisma.$disconnect();
  });

  describe('each visible stage', () => {
    it('is the creation time while awaiting a response', async () => {
      const req = await newRequest('Awaiting');
      const stored = await prisma.dataSharingRequest.findUniqueOrThrow({
        where: { id: req.id },
      });

      const iso = stored.createdAt.toISOString();
      expect(await changedAt(req.id)).toEqual({
        requester: iso,
        provider: iso,
      });
    });

    it("is the run's creation under automated review, then its end once flagged", async () => {
      const gate = gatedStep();
      useSteps(steps, [gate.step, ...standInChecks()]);
      const req = await newRequest('Automated review');
      await respond(req.id, 'OBJECTED').expect(201);
      await gate.started;

      // Backdated, so neither the response nor the run's start can stand in.
      const run = await latestRun(req.id);
      const created = minutesAgo(30);
      await prisma.pipelineRun.update({
        where: { id: run.id },
        data: { createdAt: created },
      });
      expect(await changedAt(req.id)).toEqual({
        requester: created.toISOString(),
        provider: created.toISOString(),
      });

      gate.open();
      await pipeline.drain();

      const ended = (await latestRun(req.id)).endedAt!;
      expect(ended).not.toBeNull();
      // Under review for both: the requester through the pipeline, the
      // provider through the flag.
      expect(await changedAt(req.id)).toEqual({
        requester: ended.toISOString(),
        provider: ended.toISOString(),
      });
    });

    it('is the system decision time once auto-cleared', async () => {
      const req = await newRequest('Auto-cleared');
      await respond(req.id, 'ENDORSED').expect(201);
      await pipeline.drain();

      const decision = await prisma.decision.findUniqueOrThrow({
        where: { requestId: req.id },
      });
      expect(decision.madeBy).toBe('SYSTEM');
      const iso = decision.createdAt.toISOString();
      expect(await changedAt(req.id)).toEqual({
        requester: iso,
        provider: iso,
      });
    });

    it("is the officer's decision time once decided", async () => {
      const req = await newRequest('Officer decision');
      await respond(req.id, 'OBJECTED').expect(201);
      await pipeline.drain();
      await request(server())
        .post(`/api/review/requests/${req.id}/decision`)
        .set('Cookie', cookies.officer)
        .send({ outcome: 'REJECTED', justification: JUSTIFICATION })
        .expect(201);

      const decision = await prisma.decision.findUniqueOrThrow({
        where: { requestId: req.id },
      });
      const iso = decision.createdAt.toISOString();
      expect(await changedAt(req.id)).toEqual({
        requester: iso,
        provider: iso,
      });
    });

    it("moves to the end of a later run, as a correction's would", async () => {
      const req = await newRequest('Corrected');
      await respond(req.id, 'OBJECTED').expect(201);
      await pipeline.drain();
      // The first run, moved back so the correction comes after it.
      const first = await prisma.pipelineRun.update({
        where: { id: (await latestRun(req.id)).id },
        data: { createdAt: minutesAgo(10), endedAt: minutesAgo(9) },
      });

      // A finished correction run (Sprint 3 spec §10), written directly.
      const ended = minutesAgo(1);
      await prisma.pipelineRun.create({
        data: {
          requestId: req.id,
          trigger: 'CORRECTION',
          state: 'COMPLETED',
          models: [],
          ruleSetVersion: RULE_SET_VERSION,
          createdAt: minutesAgo(2),
          startedAt: minutesAgo(2),
          endedAt: ended,
        },
      });

      const iso = ended.toISOString();
      expect(iso).not.toBe(first.endedAt!.toISOString());
      expect(await changedAt(req.id)).toEqual({
        requester: iso,
        provider: iso,
      });
    });
  });

  describe('a response from before Sprint 3', () => {
    it('gives the requester the response time for an endorsement and an objection alike', async () => {
      const respondedAt = minutesAgo(45);
      const endorsed = await sprint2Response(
        'Before: endorsed',
        'ENDORSED',
        respondedAt,
      );
      const objected = await sprint2Response(
        'Before: objected',
        'OBJECTED',
        respondedAt,
      );

      const iso = respondedAt.toISOString();
      const fromEndorsed = await changedAt(endorsed.id);
      const fromObjected = await changedAt(objected.id);
      expect(fromEndorsed.requester).toBe(iso);
      expect(fromObjected.requester).toBe(iso);
      // The provider sees Responded and Under review, both since its response.
      expect(fromEndorsed.provider).toBe(iso);
      expect(fromObjected.provider).toBe(iso);
    });
  });

  describe('changes the status does not show', () => {
    it('ignores a flag reason added after a decision', async () => {
      const req = await newRequest('Reason after decision');
      await respond(req.id, 'ENDORSED').expect(201);
      await pipeline.drain();
      const before = await changedAt(req.id);

      await prisma.flagReason.create({
        data: { requestId: req.id, source: 'PIPELINE', text: 'Late reason.' },
      });

      expect(await changedAt(req.id)).toEqual(before);
    });

    it('ignores flag reasons added or superseded while flagged', async () => {
      const req = await newRequest('Reasons while flagged');
      await respond(req.id, 'OBJECTED').expect(201);
      await pipeline.drain();
      const before = await changedAt(req.id);

      const extra = await prisma.flagReason.create({
        data: { requestId: req.id, source: 'PIPELINE', text: 'Extra reason.' },
      });
      expect(await changedAt(req.id)).toEqual(before);

      await prisma.flagReason.update({
        where: { id: extra.id },
        data: { supersededAt: new Date() },
      });
      expect(await changedAt(req.id)).toEqual(before);
    });

    it('ignores internal writes to the request', async () => {
      const req = await newRequest('Internal write');
      await respond(req.id, 'OBJECTED').expect(201);
      await pipeline.drain();
      const before = await changedAt(req.id);

      // Moves updatedAt only.
      await prisma.dataSharingRequest.update({
        where: { id: req.id },
        data: { title: 'Internal write' },
      });

      expect(await changedAt(req.id)).toEqual(before);
    });
  });
});
