import type { ActualCase } from './score.js';

// Reads the pipeline's saved step results (ctx.results, keyed by step name)
// in the dataset's terms: per document file, per rule-set field, the state,
// value, quote and items; per check, its result; and the outcome.
//
// TODO(§6–§8): this is where the pipeline's entry point plugs into the
// evaluation. Map the results the extraction step (§6), the check steps
// (§7.1–§7.3) and the outcome step (§8) save onto ActualCase. In the eval,
// each document's ID is its file name (for example "ropa.pdf"). Until those
// steps exist the pipeline saves nothing, so every field, check and outcome
// is reported missing.
export function readPipelineResult(
  _results: Record<string, unknown>,
): ActualCase {
  return { extractions: {}, checks: {} };
}
