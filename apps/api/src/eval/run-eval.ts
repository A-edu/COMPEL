import 'reflect-metadata';
import type { ConfigService } from '@nestjs/config';
import type { DocumentKind } from '@prisma/client';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnthropicModelClient } from '../pipeline/model/anthropic-model-client.js';
import { runStepsLocally } from '../pipeline/pipeline-local.js';
import {
  PIPELINE_STEPS,
  type PipelineDocument,
} from '../pipeline/pipeline-steps.js';
import {
  EXTRACTION_INSTRUCTIONS_VERSION,
  RULE_SET_VERSION,
} from '../pipeline/pipeline.constants.js';
import { readPipelineResult } from './pipeline-result.js';
import {
  type ActualCase,
  type CaseScore,
  type ExpectedCase,
  percent,
  scoreCase,
  summarise,
} from './score.js';

// npm run eval (Sprint 3 spec §5.5): runs every case of the labelled dataset
// through the real pipeline steps and the real model, and compares the
// results with each case's expected.json. Not part of npm test: it calls the
// real model, so it needs ANTHROPIC_API_KEY and costs money. Reports go to
// apps/api/eval/reports/ (gitignored).
//
// EVAL_DATASET runs another folder in the same format instead, relative to
// the repository root: EVAL_DATASET=docs/demo/sprint-3 npm run eval scores
// the demo documents (spec §13).

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(__dirname, '..', '..');
const REPO_DIR = join(API_DIR, '..', '..');
const DATASET_DIR = process.env.EVAL_DATASET?.trim()
  ? resolve(REPO_DIR, process.env.EVAL_DATASET.trim())
  : join(API_DIR, 'eval', 'dataset');
const REPORTS_DIR = join(API_DIR, 'eval', 'reports');

interface DatasetIndex {
  rule_set_version: string;
  cases: { case: string; folder: string }[];
}

async function runCase(
  folder: string,
  expected: ExpectedCase,
  model: AnthropicModelClient,
): Promise<ActualCase> {
  const documents: PipelineDocument[] = await Promise.all(
    expected.documents.map(async (doc) => {
      const path = join(DATASET_DIR, folder, doc.file);
      return {
        id: doc.file,
        kind: doc.kind as DocumentKind,
        originalName: doc.file,
        mimeType: 'application/pdf',
        sizeBytes: (await stat(path)).size,
        load: () => readFile(path),
      };
    }),
  );
  try {
    const results = await runStepsLocally(
      PIPELINE_STEPS,
      {
        runId: `eval-${expected.case}`,
        request: {
          id: `eval-${expected.case}`,
          reference: `EVAL-${expected.case}`,
          position: expected.position,
          objectionReason: expected.objection,
        },
        documents,
        ruleSetVersion: RULE_SET_VERSION,
      },
      model,
    );
    return readPipelineResult(results, expected.position);
  } catch (error) {
    // A pipeline error flags the request (spec §2.3).
    return {
      extractions: {},
      checks: {},
      outcome: 'FLAGGED',
      error: error instanceof Error ? error.message : 'unknown error',
    };
  }
}

function summaryText(report: {
  startedAt: string;
  dataset: string;
  models: Record<string, string>;
  extractionInstructionsVersion: string;
  ruleSetVersion: string;
  steps: string[];
  summary: ReturnType<typeof summarise>;
  cases: CaseScore[];
}): string {
  const { summary } = report;
  const lines = [
    `COMPEL evaluation, ${report.startedAt}`,
    `Dataset: ${report.dataset}`,
    `Rule set ${report.ruleSetVersion}; extraction instructions ${report.extractionInstructionsVersion}`,
    `Steps: ${report.steps.length ? report.steps.join(', ') : '(none yet)'}`,
    `Models: ${
      Object.entries(report.models)
        .map(([step, m]) => `${step}=${m}`)
        .join(', ') || '(no steps)'
    }`,
    '',
    `Cases: ${summary.cases}`,
    `Field extraction accuracy: ${percent(summary.fieldAccuracy)} (${summary.fieldAccuracy.correct}/${summary.fieldAccuracy.total})`,
    `Fields wrongly reported as found: ${summary.wronglyFound}`,
    `Found with a quote that does not match: ${summary.quoteMismatches}`,
    `Fields with no result: ${summary.missingFields}`,
    `Check results matching: ${percent(summary.checkAccuracy)} (${summary.checkAccuracy.correct}/${summary.checkAccuracy.total})`,
    `Outcome matches: ${percent(summary.outcomeMatches)} (${summary.outcomeMatches.correct}/${summary.outcomeMatches.total})`,
    '',
    'Per field:',
    ...Object.entries(summary.perField).map(
      ([field, tally]) =>
        `  ${field.padEnd(6)} ${percent(tally).padStart(6)}  (${tally.correct}/${tally.total})`,
    ),
    '',
    'Per case:',
    ...report.cases.map(
      (c) =>
        `  ${c.case}  outcome ${c.outcome.actual ?? '-'} (expected ${c.outcome.expected})${c.error ? `  error: ${c.error}` : ''}`,
    ),
  ];
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error(
      'Refusing to run the evaluation: ANTHROPIC_API_KEY is not set. It calls the real model.',
    );
    process.exit(1);
  }
  const model = new AnthropicModelClient({
    get: (name: string) => process.env[name],
  } as unknown as ConfigService);

  const index = JSON.parse(
    await readFile(join(DATASET_DIR, 'index.json'), 'utf-8'),
  ) as DatasetIndex;
  if (index.rule_set_version !== RULE_SET_VERSION) {
    console.warn(
      `The dataset expects rule set ${index.rule_set_version}; the pipeline uses ${RULE_SET_VERSION}.`,
    );
  }

  const startedAt = new Date();
  const steps = PIPELINE_STEPS.map((step) => step.name);
  const models = Object.fromEntries(
    steps.map((step) => [step, model.modelFor(step)]),
  );
  console.log(
    `Evaluating ${index.cases.length} cases with ${steps.length ? steps.join(', ') : 'no pipeline steps yet'}.`,
  );

  const cases: CaseScore[] = [];
  for (const { case: id, folder } of index.cases) {
    const expected = JSON.parse(
      await readFile(join(DATASET_DIR, folder, 'expected.json'), 'utf-8'),
    ) as ExpectedCase;
    const started = Date.now();
    const actual = await runCase(folder, expected, model);
    const score = scoreCase(expected, actual);
    cases.push(score);
    console.log(
      `  ${id}: outcome ${score.outcome.actual ?? '-'} (expected ${score.outcome.expected}), ${((Date.now() - started) / 1000).toFixed(1)} s`,
    );
  }

  const report = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    dataset: relative(REPO_DIR, DATASET_DIR),
    ruleSetVersion: RULE_SET_VERSION,
    datasetRuleSetVersion: index.rule_set_version,
    extractionInstructionsVersion: EXTRACTION_INSTRUCTIONS_VERSION,
    steps,
    models,
    summary: summarise(cases),
    cases,
  };

  await mkdir(REPORTS_DIR, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const base = join(REPORTS_DIR, `eval-${stamp}`);
  const text = summaryText(report);
  await writeFile(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(`${base}.txt`, text);
  console.log(`\n${text}`);
  console.log(`Report: ${base}.json`);
}

await main();
