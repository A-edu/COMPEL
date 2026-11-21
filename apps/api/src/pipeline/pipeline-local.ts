import type { ModelClient } from './model/model-client.js';
import type { PipelineContext, PipelineStep } from './pipeline-steps.js';

// Runs steps in memory, one after another, with the same contract as the run
// engine (a step that asks for more runs again; results are saved as JSON and
// passed on). No database, no internal requests: the evaluation (npm run
// eval) uses it to run the pipeline's steps on the dataset's files.
const MAX_REPEATS = 1000;

export async function runStepsLocally(
  steps: readonly PipelineStep[],
  base: Omit<PipelineContext, 'results' | 'callModel'>,
  model: ModelClient,
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  for (const step of steps) {
    const modelName = model.modelFor(step.name);
    for (let repeat = 0; ; repeat++) {
      if (repeat >= MAX_REPEATS) {
        throw new Error(`Step "${step.name}" never finished.`);
      }
      const outcome = await step.run({
        ...base,
        results: { ...results },
        callModel: (request) =>
          model.generate({ ...request, step: step.name, model: modelName }),
      });
      results[step.name] = JSON.parse(JSON.stringify(outcome.result ?? null));
      if (!outcome.more) break;
    }
  }
  return results;
}
