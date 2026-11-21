import type { DocumentKind, Position } from '@prisma/client';
import { setTimeout as sleep } from 'node:timers/promises';
import { consistencyStep } from './checks/consistency.step.js';
import { fieldCheckStep } from './checks/field-check.step.js';
import type { ModelRequest, ModelResponse } from './model/model-client.js';

// The contract between the run engine and the steps §6–§8 add.
//
// A step runs in its own internal request (AGENTS.md -> Architecture, Sprint 3
// spec §4.3): the engine rebuilds the context from the database, runs the
// step once, saves what it returns, and triggers the next step. So a step:
// - keeps everything it needs later in its `result` (JSON only), which later
//   steps read in `ctx.results[step name]`;
// - returns `more: true` to be run again in a new request (for example, one
//   document per request), and finds its previous `result` in
//   `ctx.results[its own name]`;
// - is safe to cut off at any point: a run whose step stops part-way is
//   ended flagged, never resumed or repeated;
// - reaches a model only through `ctx.callModel`, which uses the model the
//   run recorded for that step.
// The same steps run in the evaluation (npm run eval) with no database, so a
// step should not need anything beyond its context.

export interface PipelineDocument {
  id: string;
  kind: DocumentKind;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  load(): Promise<Buffer>;
}

export interface PipelineContext {
  runId: string;
  request: {
    id: string;
    reference: string;
    position: Position;
    objectionReason: string | null;
    // The registered parties' names. Always set in the app; the evaluation
    // has none, and the checks then rely on what the documents state.
    requestingEntity?: string;
    providingEntity?: string;
  };
  documents: PipelineDocument[];
  // Saved step results so far, keyed by step name.
  results: Readonly<Record<string, unknown>>;
  ruleSetVersion: string;
  callModel(
    request: Omit<ModelRequest, 'step' | 'model'>,
  ): Promise<ModelResponse>;
}

export interface StepOutcome {
  // Saved as ctx.results[step name]; must be JSON-serialisable.
  result: unknown;
  // Run this step again, in a new request, before moving on.
  more?: boolean;
}

export interface PipelineStep {
  // Unique; also names the model setting (PIPELINE_MODEL_<NAME>).
  name: string;
  run(ctx: PipelineContext): Promise<StepOutcome>;
}

// The steps, in order. The outcome (§8) is not a step: it is applied when the
// run completes (pipeline-outcome.ts).
//
// TODO(§6): the extraction step ('extract', saving an ExtractionResult, see
// extraction.ts) goes first. Until it does, the checks find no extraction and
// every run ends flagged with a pipeline error.
// TODO(§7.3): the purpose step ('purpose', saving `{ findings: [PC-01] }`,
// see findings.ts) goes after the consistency check. Until it does, PC-01
// has no finding and no request is auto-cleared.
export const PIPELINE_STEPS: readonly PipelineStep[] = [
  fieldCheckStep,
  consistencyStep,
];

// The probe (Sprint 3 spec §5.6 verification): off unless
// PIPELINE_PROBE_SECONDS is set. It makes one tiny real model call, then keeps
// the run going in 45 s requests until that many seconds have passed. 45 s is
// longer than the Next.js rewrite proxy's 30 s idle timeout, so a probe run
// that completes also proves the heartbeat keeps a long step's request open.
// It saves nothing about the request.
const PROBE_SLICE_MS = 45_000;

interface ProbeResult {
  startedAt: number;
  modelAnswered: boolean;
}

export function probeStep(seconds: number): PipelineStep {
  return {
    name: 'probe',
    async run(ctx) {
      const previous = ctx.results.probe as ProbeResult | undefined;
      if (!previous) {
        await ctx.callModel({
          content: [{ type: 'text', text: 'Reply with the single word OK.' }],
          maxTokens: 16,
        });
        return {
          result: { startedAt: Date.now(), modelAnswered: true },
          more: seconds > 0,
        };
      }
      const remaining = previous.startedAt + seconds * 1000 - Date.now();
      if (remaining > 0) await sleep(Math.min(remaining, PROBE_SLICE_MS));
      return {
        result: previous,
        more: previous.startedAt + seconds * 1000 > Date.now(),
      };
    },
  };
}

// Where the runner gets the step list: pipelineSteps() in the app; tests
// provide their own steps.
export const PIPELINE_STEP_SOURCE = Symbol('PIPELINE_STEP_SOURCE');
export type StepSource = () => PipelineStep[];

// The steps a new run uses: the pipeline, plus the probe when it is on.
export function pipelineSteps(
  read: (name: string) => string | undefined,
): PipelineStep[] {
  const steps = [...PIPELINE_STEPS];
  const probe = Number(read('PIPELINE_PROBE_SECONDS'));
  if (Number.isFinite(probe) && probe > 0) steps.push(probeStep(probe));
  return steps;
}
