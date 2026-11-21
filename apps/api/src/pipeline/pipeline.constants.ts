// Shared settings of the automated review (Sprint 3 spec §2, §3.1, §4.3).

// The approved rule set every run records (docs/rule-set.md, spec §3.4).
export { RULE_SET_VERSION } from './rule-set.js';

// The pipeline's flag source (spec §3.2).
export const FLAG_SOURCE_PIPELINE = 'PIPELINE';

// The one text a pipeline error ever shows (spec §3.2, §15.6). It never
// carries model output, stack traces, configuration or secrets.
export const PIPELINE_ERROR_TEXT =
  'The automated review could not be completed.';

// The default model for every step (AGENTS.md -> Environment variables).
export const DEFAULT_PIPELINE_MODEL = 'claude-haiku-5-5';

// A claimed step holds the run for this long; the runner renews it every
// LEASE_RENEW_MS while the step is working. A lease that lapses means the
// instance stopped, and the sweeper ends the run flagged.
export const LEASE_MS = 3 * 60_000;
export const LEASE_RENEW_MS = 15_000;

// No run takes longer than this from its first step; a step started after it
// ends the run flagged instead.
export const RUN_CAP_MS = 30 * 60_000;

// How often the sweeper looks for runs whose instance stopped.
export const SWEEP_INTERVAL_MS = 60_000;

// The internal advance request: the header carrying the token, how long a
// caller waits for the 202, and how often the endpoint writes a byte so the
// Next.js rewrite proxy (30 s idle timeout) never drops it.
export const INTERNAL_TOKEN_HEADER = 'x-pipeline-token';
export const ADVANCE_ACCEPT_TIMEOUT_MS = 15_000;
export const ADVANCE_HEARTBEAT_MS = 10_000;

// The version of the extraction instructions (prompt and schema). Every
// stored extraction and every evaluation report records it (spec §2.9,
// §3.3, §5.5). Raise it whenever the instructions in extract.step.ts (the
// prompt, the answer schema or how answers are confirmed) change.
export const EXTRACTION_INSTRUCTIONS_VERSION = 'extract-2';
