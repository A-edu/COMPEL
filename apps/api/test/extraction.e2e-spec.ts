import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { answerWith } from '../src/pipeline/checks/check-context.helper-spec.js';
import { CONSISTENCY_STEP } from '../src/pipeline/checks/consistency.step.js';
import { FIELD_CHECK_STEP } from '../src/pipeline/checks/field-check.step.js';
import { PURPOSE_STEP } from '../src/pipeline/checks/purpose.step.js';
import {
  answer,
  datasetCase,
  datasetFile,
  faithfulAnswer,
  promptOf,
} from '../src/pipeline/extract.helper-spec.js';
import {
  EXTRACT_STEP,
  type ExtractionResult,
} from '../src/pipeline/extraction.js';
import { StandInModelClient } from '../src/pipeline/model/stand-in-model-client.js';
import type { PipelineRunner } from '../src/pipeline/pipeline-runner.service.js';
import {
  PIPELINE_STEPS,
  type PipelineStep,
} from '../src/pipeline/pipeline-steps.js';
import { EXTRACTION_INSTRUCTIONS_VERSION } from '../src/pipeline/pipeline.constants.js';
import { CHECKS } from '../src/pipeline/rule-set.js';
import { createTestApp, loginAs } from './auth-helpers.js';
import { createEntityFixtures, type EntityFixture } from './fixtures.js';

// Sprint 3 spec §6 (US-07) and §7.3 (US-10) through the app: a provider
// response starts a run whose first step reads every document of the request
// once, the checks work from that reading, and the outcome (§8) follows. The
// documents are the dataset's clean English case (C01); the model is a
// stand-in.

const CASE = 'C01-clean-english';

describe('Automated field extraction (e2e)', () => {
  const prisma = new PrismaClient();
  const steps: PipelineStep[] = [...PIPELINE_STEPS];
  const model = new StandInModelClient();
  let app: NestExpressApplication;
  let pipeline: PipelineRunner;
  let fixtures: Awaited<ReturnType<typeof createEntityFixtures>>;
  let a: EntityFixture;
  let b: EntityFixture;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    let mail;
    ({ app, mail, pipeline } = await createTestApp({ steps, model }));
    fixtures = await createEntityFixtures(prisma, 2);
    [a, b] = fixtures.entities;
    cookies.a = await loginAs(app, mail, a.dpo.email);
    cookies.b = await loginAs(app, mail, b.dpo.email);
  });

  afterAll(async () => {
    await pipeline?.drain();
    await fixtures?.cleanup();
    await app?.close();
    await prisma.$disconnect();
  });

  // Submits C01's documents as a request from A to B, has B endorse it with
  // C01's RoPA entry, and waits for the run. `purpose` is the stand-in's
  // PC-01 verdict.
  async function submitAndRespond(purpose: string): Promise<{
    id: string;
    dataset: Awaited<ReturnType<typeof datasetCase>>;
  }> {
    const dataset = await datasetCase(CASE);
    const role = (prompt: string) =>
      prompt.includes('request form')
        ? 'REQUEST_FORM'
        : prompt.includes('supporting document')
          ? 'SUPPORTING'
          : 'ROPA';
    model.calls.length = 0;
    model
      .script(EXTRACT_STEP, (call) =>
        answer(
          faithfulAnswer(
            dataset.documents.find((d) => d.kind === role(promptOf(call)))!,
          ),
        ),
      )
      .script(FIELD_CHECK_STEP, answerWith({}, 'passed'))
      .script(CONSISTENCY_STEP, answerWith({}, 'consistent'))
      .script(PURPOSE_STEP, answerWith({}, purpose));

    const file = (kind: string) =>
      dataset.documents.find((d) => d.kind === kind)!.file;
    const submitted = await request(app.getHttpServer())
      .post('/api/requests')
      .set('Cookie', cookies.a)
      .field('providingEntityId', b.entity.id)
      .field('title', `Extraction e2e (${purpose})`)
      .attach('requestForm', await datasetFile(CASE, file('REQUEST_FORM')), {
        filename: 'request-form.pdf',
        contentType: 'application/pdf',
      })
      .attach(
        'supportingDocuments',
        await datasetFile(CASE, file('SUPPORTING')),
        { filename: 'cover-letter.pdf', contentType: 'application/pdf' },
      )
      .expect(201);
    const id = submitted.body.id as string;

    await request(app.getHttpServer())
      .post(`/api/requests/${id}/response`)
      .set('Cookie', cookies.b)
      .field('position', 'ENDORSED')
      .attach('ropaDocument', await datasetFile(CASE, file('ROPA')), {
        filename: 'ropa-entry.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    await pipeline.drain();
    return { id, dataset };
  }

  it('reads every document of the request once, records each field with its source text, and the checks use that reading', async () => {
    const { id, dataset } = await submitAndRespond('compatible');

    const documents = await prisma.document.findMany({
      where: { requestId: id },
    });
    expect(documents).toHaveLength(3);
    const run = await prisma.pipelineRun.findFirstOrThrow({
      where: { requestId: id },
    });
    expect(run.state).toBe('COMPLETED');

    // One model call per document, and the stored extraction covers each.
    const extractCalls = model.calls.filter((c) => c.step === EXTRACT_STEP);
    expect(extractCalls).toHaveLength(3);
    const extraction = (run.stepResults as Record<string, unknown>)[
      EXTRACT_STEP
    ] as ExtractionResult;
    expect(extraction.model).toBe('stand-in-model');
    expect(extraction.instructionsVersion).toBe(
      EXTRACTION_INSTRUCTIONS_VERSION,
    );
    expect(extraction.documents.map((d) => d.documentId).sort()).toEqual(
      documents.map((d) => d.id).sort(),
    );
    for (const doc of extraction.documents) {
      const expected = dataset.documents.find((d) => d.kind === doc.kind)!;
      expect(doc.extractedAt).toEqual(expect.any(String));
      for (const [field, want] of Object.entries(expected.fields)) {
        const got = doc.fields[field as keyof typeof doc.fields]!;
        expect({ field, state: got.state }).toEqual({
          field,
          state: want.state,
        });
        if (want.state === 'found') {
          expect(got).toMatchObject({ quote: want.quote });
        }
      }
    }

    // Every rule-set check ran on that reading and has a finding.
    const findings = await prisma.finding.findMany({
      where: { requestId: id },
    });
    expect(findings.map((f) => f.checkId).sort()).toEqual(
      CHECKS.map((c) => c.id).sort(),
    );
  });

  it('auto-clears a clean, endorsed request once purpose compatibility passes (§7.3, §8)', async () => {
    const { id } = await submitAndRespond('compatible');

    const pc01 = await prisma.finding.findFirstOrThrow({
      where: { requestId: id, checkId: 'PC-01' },
    });
    expect(pc01.result).toBe('COMPATIBLE');
    const status = (
      await prisma.dataSharingRequest.findUniqueOrThrow({ where: { id } })
    ).status;
    expect(status).toBe('APPROVED');
    expect(
      await prisma.decision.findUnique({ where: { requestId: id } }),
    ).toMatchObject({ outcome: 'APPROVED', madeBy: 'SYSTEM' });
    expect(await prisma.flagReason.count({ where: { requestId: id } })).toBe(
      0,
    );
  });

  it('flags an incompatible purpose with a PC-01 reason that sets both purposes side by side', async () => {
    const { id, dataset } = await submitAndRespond('incompatible');

    const status = (
      await prisma.dataSharingRequest.findUniqueOrThrow({ where: { id } })
    ).status;
    expect(status).toBe('PROVIDER_RESPONDED');
    expect(await prisma.decision.findUnique({ where: { requestId: id } })).toBeNull();

    const reasons = await prisma.flagReason.findMany({
      where: { requestId: id },
      include: { finding: true },
    });
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatchObject({
      source: 'PIPELINE',
      finding: { checkId: 'PC-01', result: 'INCOMPATIBLE' },
    });
    const quoteOf = (kind: string, field: string) =>
      dataset.documents.find((d) => d.kind === kind)!.fields[
        field as keyof (typeof dataset.documents)[number]['fields']
      ]!.quote!;
    for (const quote of [
      quoteOf('REQUEST_FORM', 'F-R1'),
      quoteOf('ROPA', 'F-P2'),
      quoteOf('ROPA', 'F-P3'),
    ]) {
      expect(reasons[0].text).toContain(quote);
    }
  });
});
