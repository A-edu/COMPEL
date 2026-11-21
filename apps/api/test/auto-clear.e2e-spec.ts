import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  type FindingResult,
  Prisma,
  PrismaClient,
  type User,
} from '@prisma/client';
import request from 'supertest';
import type { CheckReport } from '../src/pipeline/check-report.js';
import type { PipelineRunner } from '../src/pipeline/pipeline-runner.service.js';
import type { PipelineStep } from '../src/pipeline/pipeline-steps.js';
import {
  PIPELINE_ERROR_TEXT,
  RULE_SET_VERSION,
} from '../src/pipeline/pipeline.constants.js';
import { CHECKS, checkById } from '../src/pipeline/rule-set.js';
import {
  ALREADY_DECIDED,
  NOT_FLAGGED,
} from '../src/requests/review-decision.service.js';
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
import { passingResult, standInChecks, useSteps } from './pipeline-helpers.js';

// Sprint 3 spec §8 (US-11) and §9.3 (US-13): how a run ends, the system
// decision and the report stored with every decision. Stand-in checks choose
// what the pipeline found; the outcome, the decision and the report are the
// app's own.

const ROPA_PDF = buildPlaceholderPdf(['SYNTHETIC — DEMO DATA', 'RoPA entry']);
const OBJECTION = 'The request does not state a legal basis.';
const JUSTIFICATION = 'The stated purpose meets the PDPL conditions.';

const NOT_PASSING: [string, FindingResult][] = [
  ['FL-01', 'FAILED'],
  ['FL-05', 'NOT_FOUND'],
  ['FL-09', 'AMBIGUOUS'],
  ['CD-03', 'INCONSISTENT'],
  ['PC-01', 'INCOMPATIBLE'],
  ['PC-01', 'INDETERMINATE'],
];

const LABEL: Record<string, string> = {
  FAILED: 'failed',
  NOT_FOUND: 'not found',
  AMBIGUOUS: 'ambiguous',
  INCONSISTENT: 'inconsistent',
  INCOMPATIBLE: 'incompatible',
  INDETERMINATE: 'indeterminate',
};

describe('Auto-clear or flag (e2e)', () => {
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
  const cookies = { a: '', b: '', officer: '', secondOfficer: '' };

  const server = () => app.getHttpServer();
  const get = (path: string, cookie: string) =>
    request(server()).get(`/api${path}`).set('Cookie', cookie);

  const newRequest = async (title = 'Auto-clear test request') =>
    (await createTestRequest(prisma, { from: a, to: b, title })).request;

  function respond(id: string, position = 'ENDORSED') {
    const req = request(server())
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
  }

  // A request the provider responded to, once its run has ended.
  async function reviewed(position = 'ENDORSED', title?: string) {
    const req = await newRequest(title);
    await respond(req.id, position);
    await pipeline.drain();
    return req;
  }

  const decide = (id: string, body: object, cookie = cookies.officer) =>
    request(server())
      .post(`/api/review/requests/${id}/decision`)
      .set('Cookie', cookie)
      .send(body);

  const statusOf = async (id: string) =>
    (await prisma.dataSharingRequest.findUniqueOrThrow({ where: { id } }))
      .status;
  const activeReasonsOf = (requestId: string) =>
    prisma.flagReason.findMany({
      where: { requestId, supersededAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  const findingsOf = (requestId: string) =>
    prisma.finding.findMany({ where: { requestId } });
  const decisionOf = (requestId: string) =>
    prisma.decision.findUnique({ where: { requestId } });
  const caseOf = async (id: string) =>
    (await get(`/review/requests/${id}`, cookies.officer).expect(200))
      .body as Record<string, any>;

  beforeAll(async () => {
    ({ app, mail, throttler, pipeline } = await createTestApp({ steps }));
    fixtures = await createEntityFixtures(prisma, 3);
    const [sdaia] = fixtures.entities.slice(2);
    [a, b] = fixtures.entities;
    officer = await createOfficer(prisma, sdaia);
    const second = await prisma.user.create({
      data: {
        email: `officer-2@${sdaia.entity.slug}.example`,
        entityId: sdaia.entity.id,
        role: 'COMPLIANCE_OFFICER',
      },
    });
    for (const [key, email] of [
      ['a', a.dpo.email],
      ['b', b.dpo.email],
      ['officer', officer.email],
      ['secondOfficer', second.email],
    ] as const) {
      throttler.reset();
      cookies[key] = await loginAs(app, mail, email);
    }
  });

  beforeEach(() => {
    throttler.reset();
    useSteps(steps, standInChecks());
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await fixtures?.cleanup();
    await app?.close();
    await prisma.$disconnect();
  });

  describe('a request whose every check passed', () => {
    it('is approved by the system, with nobody acting, recorded as a decision with the full report', async () => {
      const req = await reviewed();

      await expect(statusOf(req.id)).resolves.toBe('APPROVED');
      await expect(activeReasonsOf(req.id)).resolves.toEqual([]);
      const decision = await decisionOf(req.id);
      expect(decision).toMatchObject({
        outcome: 'APPROVED',
        madeBy: 'SYSTEM',
        decidedById: null,
        justification: null,
      });

      const report = decision!.report as unknown as CheckReport;
      expect(report).toMatchObject({
        outcome: 'APPROVED',
        summary: null,
        run: { trigger: 'RESPONSE', ruleSetVersion: RULE_SET_VERSION },
      });
      expect(report.findings.map((f) => f.checkId)).toEqual(
        CHECKS.map((c) => c.id),
      );
      for (const finding of report.findings) {
        expect(finding).toMatchObject({
          result: passingResult(finding.checkId),
          citation: checkById(finding.checkId).citation,
          ruleSetVersion: RULE_SET_VERSION,
          superseded: false,
        });
      }
      await expect(findingsOf(req.id)).resolves.toHaveLength(CHECKS.length);
    });

    it('shows the officer a decision made by the system, with its report and no justification', async () => {
      const req = await reviewed();

      const body = await caseOf(req.id);
      expect(body).toMatchObject({ status: 'APPROVED', flagged: false });
      expect(body.decision).toMatchObject({
        outcome: 'APPROVED',
        madeBy: 'SYSTEM',
        justification: null,
        decidedBy: null,
        report: { outcome: 'APPROVED', summary: null },
      });

      const decided = await get(
        '/review/requests?view=decided',
        cookies.officer,
      ).expect(200);
      expect(
        (decided.body.items as { id: string; outcome?: string }[]).find(
          (r) => r.id === req.id,
        ),
      ).toMatchObject({ outcome: 'APPROVED' });
    });

    it('cannot be decided again, and has no route to change or remove the decision', async () => {
      const req = await reviewed();
      const before = await decisionOf(req.id);

      const res = await decide(req.id, {
        outcome: 'REJECTED',
        justification: JUSTIFICATION,
      }).expect(409);
      expect(res.body).toEqual({ message: ALREADY_DECIDED });
      for (const method of ['patch', 'put', 'delete'] as const) {
        await request(server())
          [method](`/api/review/requests/${req.id}/decision`)
          .set('Cookie', cookies.officer)
          .send({ report: null, outcome: 'REJECTED' })
          .expect(404);
      }

      await expect(decisionOf(req.id)).resolves.toEqual(before);
      await expect(statusOf(req.id)).resolves.toBe('APPROVED');
    });

    it('is not reopened by a flag reason that arrives later', async () => {
      const req = await reviewed();
      await prisma.flagReason.create({
        data: { requestId: req.id, source: 'MADE_UP_CHECK', text: 'Later.' },
      });

      const body = await caseOf(req.id);
      expect(body).toMatchObject({ status: 'APPROVED', flagged: false });
    });
  });

  describe('a request a check did not pass', () => {
    it.each(NOT_PASSING)(
      'is flagged when %s is %s, with a reason that names the check and cites its clause',
      async (checkId, result) => {
        useSteps(steps, standInChecks({ [checkId]: result }));
        const req = await reviewed();

        await expect(statusOf(req.id)).resolves.toBe('PROVIDER_RESPONDED');
        await expect(decisionOf(req.id)).resolves.toBeNull();
        const reasons = await activeReasonsOf(req.id);
        expect(reasons).toHaveLength(1);
        const finding = await prisma.finding.findUniqueOrThrow({
          where: { id: reasons[0].findingId! },
        });
        expect(finding).toMatchObject({ checkId, result });
        const check = checkById(checkId);
        expect(reasons[0]).toMatchObject({ source: 'PIPELINE' });
        expect(reasons[0].text).toContain(
          `${checkId} ${check.name}: ${LABEL[result]}.`,
        );
        expect(reasons[0].text).toContain(`(${check.citation})`);

        // The reason shows in the review queue and the case view.
        const flagged = await get(
          '/review/requests?view=flagged',
          cookies.officer,
        ).expect(200);
        expect(
          (flagged.body.items as { id: string }[]).find((r) => r.id === req.id),
        ).toMatchObject({ flagged: true, flagSources: ['PIPELINE'] });
        const body = await caseOf(req.id);
        expect(body.flagged).toBe(true);
        expect(body.flagReasons).toEqual([
          expect.objectContaining({
            source: 'PIPELINE',
            text: reasons[0].text,
          }),
        ]);
      },
    );

    it('keeps the findings that passed, without a reason', async () => {
      useSteps(steps, standInChecks({ 'FL-05': 'NOT_FOUND' }));
      const req = await reviewed();

      const findings = await findingsOf(req.id);
      expect(findings).toHaveLength(CHECKS.length);
      expect(findings.filter((f) => f.result === 'PASSED').length).toBe(
        CHECKS.length - 2,
      );
    });
  });

  describe('an objected request', () => {
    it('runs through every check, so the officer sees the findings beside the objection', async () => {
      const req = await reviewed('OBJECTED');

      await expect(statusOf(req.id)).resolves.toBe('PROVIDER_RESPONDED');
      const reasons = await activeReasonsOf(req.id);
      expect(reasons.map((r) => r.source)).toEqual(['PROVIDER_OBJECTION']);
      await expect(findingsOf(req.id)).resolves.toHaveLength(CHECKS.length);
      await expect(decisionOf(req.id)).resolves.toBeNull();
    });

    it('carries both the objection and a failed check', async () => {
      useSteps(steps, standInChecks({ 'CD-04': 'INCONSISTENT' }));
      const req = await reviewed('OBJECTED');

      const reasons = await activeReasonsOf(req.id);
      expect(reasons.map((r) => r.source).sort()).toEqual([
        'PIPELINE',
        'PROVIDER_OBJECTION',
      ]);
    });
  });

  describe('a run that could not check everything', () => {
    it('never clears a request with a check the pipeline did not run', async () => {
      useSteps(steps, standInChecks({}, ['PC-01']));
      const req = await reviewed();

      await expect(statusOf(req.id)).resolves.toBe('PROVIDER_RESPONDED');
      await expect(decisionOf(req.id)).resolves.toBeNull();
      const reasons = await activeReasonsOf(req.id);
      expect(reasons.map((r) => [r.source, r.text])).toEqual([
        ['PIPELINE', PIPELINE_ERROR_TEXT],
      ]);
    });

    it('ends a failed run flagged with a pipeline error, never approved', async () => {
      useSteps(steps, [
        {
          name: 'broken',
          run: () => Promise.reject(new Error('Simulated step failure.')),
        },
      ]);
      const req = await reviewed();

      await expect(statusOf(req.id)).resolves.toBe('PROVIDER_RESPONDED');
      await expect(decisionOf(req.id)).resolves.toBeNull();
      await expect(findingsOf(req.id)).resolves.toEqual([]);
      const reasons = await activeReasonsOf(req.id);
      expect(reasons.map((r) => r.text)).toEqual([PIPELINE_ERROR_TEXT]);
    });

    it('never leaves a system decision without its report, even if saving fails partway', async () => {
      const req = await newRequest('Saving fails');
      const held: string[] = [];
      vi.spyOn(pipeline, 'dispatch').mockImplementation((runId: string) => {
        held.push(runId);
        return Promise.resolve();
      });
      await respond(req.id);
      vi.restoreAllMocks();
      // A decision already in place makes saving the system's decision fail
      // after the approval and the findings were written.
      const planted = await prisma.decision.create({
        data: {
          requestId: req.id,
          outcome: 'APPROVED',
          madeBy: 'OFFICER',
          justification: JUSTIFICATION,
          decidedById: officer.id,
        },
      });

      await pipeline.advance(held[0]);
      await pipeline.drain();

      // Nothing of the failed completion remains: no approval, no findings,
      // no system decision. The run ended flagged with a pipeline error.
      await expect(
        prisma.pipelineRun.findUniqueOrThrow({ where: { id: held[0] } }),
      ).resolves.toMatchObject({ state: 'FAILED' });
      await expect(statusOf(req.id)).resolves.not.toBe('APPROVED');
      await expect(findingsOf(req.id)).resolves.toEqual([]);
      await expect(
        prisma.decision.findMany({ where: { requestId: req.id } }),
      ).resolves.toEqual([planted]);
      const reasons = await activeReasonsOf(req.id);
      expect(reasons.map((r) => r.text)).toEqual([PIPELINE_ERROR_TEXT]);
    });
  });

  describe('the system never rejects', () => {
    it('records only approvals as system decisions', async () => {
      await reviewed();
      await expect(
        prisma.decision.count({
          where: { madeBy: 'SYSTEM', outcome: { not: 'APPROVED' } },
        }),
      ).resolves.toBe(0);
    });

    it.each([
      [
        'a system rejection',
        { outcome: 'REJECTED', madeBy: 'SYSTEM', report: { findings: [] } },
      ],
      [
        'a system approval with no report',
        { outcome: 'APPROVED', madeBy: 'SYSTEM' },
      ],
      [
        'a system decision naming an officer',
        { outcome: 'APPROVED', madeBy: 'SYSTEM', report: {}, officer: true },
      ],
      [
        'an officer decision with no justification',
        { outcome: 'APPROVED', madeBy: 'OFFICER', officer: true },
      ],
      [
        'an officer decision with no officer',
        {
          outcome: 'APPROVED',
          madeBy: 'OFFICER',
          justification: JUSTIFICATION,
        },
      ],
    ] as const)('is refused by the database: %s', async (_label, shape) => {
      useSteps(steps, standInChecks({ 'FL-01': 'FAILED' }));
      const req = await reviewed();
      const s = shape as {
        outcome: 'APPROVED' | 'REJECTED';
        madeBy: 'SYSTEM' | 'OFFICER';
        report?: object;
        officer?: boolean;
        justification?: string;
      };

      await expect(
        prisma.decision.create({
          data: {
            requestId: req.id,
            outcome: s.outcome,
            madeBy: s.madeBy,
            report: (s.report ?? Prisma.DbNull) as Prisma.InputJsonValue,
            justification: s.justification ?? null,
            decidedById: s.officer ? officer.id : null,
          },
        }),
      ).rejects.toThrow(/Decision_maker_shape/);
      await expect(decisionOf(req.id)).resolves.toBeNull();
    });
  });

  describe('an officer deciding a request the pipeline flagged (Sprint 2 §8.1 flow)', () => {
    const flaggedByPipeline = async (title?: string) => {
      useSteps(steps, standInChecks({ 'FL-05': 'NOT_FOUND' }));
      return reviewed('ENDORSED', title);
    };

    it.each(['APPROVED', 'REJECTED'] as const)(
      'records %s with the justification, the officer and the report as it stood',
      async (outcome) => {
        const req = await flaggedByPipeline();

        await decide(req.id, { outcome, justification: JUSTIFICATION }).expect(
          201,
        );

        await expect(statusOf(req.id)).resolves.toBe(outcome);
        const decision = await decisionOf(req.id);
        expect(decision).toMatchObject({
          outcome,
          madeBy: 'OFFICER',
          justification: JUSTIFICATION,
          decidedById: officer.id,
        });
        const report = decision!.report as unknown as CheckReport;
        expect(report.outcome).toBe(outcome);
        expect(report.summary).toBe(
          'Not auto-cleared. 1 check did not pass: FL-05 Requester retention period (not found).',
        );
        expect(
          report.findings.find((f) => f.checkId === 'FL-05'),
        ).toMatchObject({ result: 'NOT_FOUND', citation: 'Law Art 18' });

        const body = await caseOf(req.id);
        expect(body.decision).toMatchObject({
          madeBy: 'OFFICER',
          decidedBy: { email: officer.email },
          report: { outcome, summary: report.summary },
        });
      },
    );

    it('refuses a justification that is too short, and records nothing', async () => {
      const req = await flaggedByPipeline();

      await decide(req.id, {
        outcome: 'APPROVED',
        justification: 'Short.',
      }).expect(400);
      await expect(decisionOf(req.id)).resolves.toBeNull();
    });

    it('records exactly one of two officers deciding at once', async () => {
      const req = await flaggedByPipeline();

      const results = await Promise.all([
        decide(req.id, { outcome: 'APPROVED', justification: JUSTIFICATION }),
        decide(
          req.id,
          { outcome: 'REJECTED', justification: JUSTIFICATION },
          cookies.secondOfficer,
        ),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      await expect(
        prisma.decision.count({ where: { requestId: req.id } }),
      ).resolves.toBe(1);
    });

    it('ignores a decision maker or report sent by the client', async () => {
      const req = await flaggedByPipeline();

      await decide(req.id, {
        outcome: 'APPROVED',
        justification: JUSTIFICATION,
        madeBy: 'SYSTEM',
        report: { findings: [], summary: null, outcome: 'APPROVED' },
      }).expect(201);

      const decision = await decisionOf(req.id);
      expect(decision).toMatchObject({
        madeBy: 'OFFICER',
        decidedById: officer.id,
      });
      expect(
        (decision!.report as unknown as CheckReport).findings,
      ).toHaveLength(CHECKS.length);
    });
  });

  describe('stored reports (§9.3)', () => {
    it('keep what the pipeline found at the time, whatever changes later', async () => {
      useSteps(steps, standInChecks({ 'FL-12': 'FAILED' }));
      const req = await reviewed();
      await decide(req.id, {
        outcome: 'REJECTED',
        justification: JUSTIFICATION,
      }).expect(201);
      const stored = (await decisionOf(req.id))!.report;

      // A later rule set, model setting and wording of the same findings.
      await prisma.finding.updateMany({
        where: { requestId: req.id },
        data: {
          citation: 'Changed later',
          ruleSetVersion: '2.0',
          explanation: 'Rewritten later.',
        },
      });
      await prisma.pipelineRun.updateMany({
        where: { requestId: req.id },
        data: { ruleSetVersion: '2.0', models: [] },
      });

      await expect(decisionOf(req.id)).resolves.toMatchObject({
        report: stored,
      });
      const body = await caseOf(req.id);
      expect(body.decision.report).toEqual(stored);
      expect(
        (stored as unknown as CheckReport).findings.find(
          (f) => f.checkId === 'FL-12',
        ),
      ).toMatchObject({
        citation: 'Law Art 31(6); IR Art 33(5)(e)',
        ruleSetVersion: RULE_SET_VERSION,
      });
    });

    it('record the rule-set version each finding used, unchanged by a later version', async () => {
      const earlier = await reviewed('ENDORSED', 'Earlier version');

      const later = await newRequest('Later version');
      const held: string[] = [];
      vi.spyOn(pipeline, 'dispatch').mockImplementation((runId: string) => {
        held.push(runId);
        return Promise.resolve();
      });
      await respond(later.id);
      vi.restoreAllMocks();
      // The run was created under a later rule-set version.
      await prisma.pipelineRun.update({
        where: { id: held[0] },
        data: { ruleSetVersion: '2.0' },
      });
      await pipeline.advance(held[0]);
      await pipeline.drain();

      const versions = async (requestId: string) => [
        ...new Set((await findingsOf(requestId)).map((f) => f.ruleSetVersion)),
      ];
      await expect(versions(earlier.id)).resolves.toEqual([RULE_SET_VERSION]);
      await expect(versions(later.id)).resolves.toEqual(['2.0']);
      const earlierReport = (await decisionOf(earlier.id))!
        .report as unknown as CheckReport;
      expect(earlierReport.run.ruleSetVersion).toBe(RULE_SET_VERSION);
    });

    it('do not exist for an officer decision on a request with no pipeline run', async () => {
      const req = await newRequest('No run');
      await prisma.flagReason.create({
        data: { requestId: req.id, source: 'MADE_UP_CHECK', text: 'Flagged.' },
      });

      await decide(req.id, {
        outcome: 'REJECTED',
        justification: JUSTIFICATION,
      }).expect(201);

      await expect(decisionOf(req.id)).resolves.toMatchObject({
        madeBy: 'OFFICER',
        report: null,
      });
    });
  });

  it('lets no officer decide a request mid-run, even one that already carries an objection', async () => {
    const req = await newRequest('Mid-run');
    const held: string[] = [];
    vi.spyOn(pipeline, 'dispatch').mockImplementation((runId: string) => {
      held.push(runId);
      return Promise.resolve();
    });
    await respond(req.id, 'OBJECTED');
    vi.restoreAllMocks();

    const res = await decide(req.id, {
      outcome: 'REJECTED',
      justification: JUSTIFICATION,
    }).expect(409);
    expect(res.body).toEqual({ message: NOT_FLAGGED });
    await expect(statusOf(req.id)).resolves.toBe('UNDER_AUTOMATED_REVIEW');

    await pipeline.advance(held[0]);
    await pipeline.drain();
    await decide(req.id, {
      outcome: 'REJECTED',
      justification: JUSTIFICATION,
    }).expect(201);
  });
});
