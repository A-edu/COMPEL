import type { Position } from '@prisma/client';
import { EXTRACT_STEP, type ExtractionResult } from '../pipeline/extraction.js';
import {
  collectFindings,
  passesOutcomeRule,
} from '../pipeline/pipeline-outcome.js';
import type { ActualCase, ActualField } from './score.js';

// Reads the pipeline's saved step results (ctx.results, keyed by step name)
// in the dataset's terms: per document file, per rule-set field, the state,
// value, quote and items; per check, its result; and the outcome, by the same
// outcome rule the app applies (§2.4). In the eval each document's ID is its
// file name (for example "ropa.pdf").
export function readPipelineResult(
  results: Record<string, unknown>,
  position: Position,
): ActualCase {
  const extractions: ActualCase['extractions'] = {};
  const extraction = results[EXTRACT_STEP] as ExtractionResult | undefined;
  for (const doc of extraction?.documents ?? []) {
    extractions[doc.documentId] = Object.fromEntries(
      Object.entries(doc.fields ?? {}).map(([field, value]) => [
        field,
        value as ActualField,
      ]),
    );
  }

  const findings = collectFindings(results);
  const checks = Object.fromEntries(
    findings.map((f) => [f.checkId, f.result.toLowerCase()]),
  );
  return {
    extractions,
    checks,
    outcome: passesOutcomeRule(findings, position) ? 'APPROVED' : 'FLAGGED',
  };
}
