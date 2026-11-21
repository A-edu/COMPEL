import { StandInModelClient } from './model/stand-in-model-client.js';
import { runStepsLocally } from './pipeline-local.js';
import type { PipelineStep } from './pipeline-steps.js';

const base = {
  runId: 'local',
  request: {
    id: 'r',
    reference: 'EVAL-C00',
    position: 'ENDORSED' as const,
    objectionReason: null,
  },
  documents: [],
  ruleSetVersion: '1.0',
};

describe('runStepsLocally', () => {
  it('runs steps in order, repeats a step that asks for more, and passes results on', async () => {
    const model = new StandInModelClient().script('first', {
      model: 'stand-in',
      text: 'answer',
    });
    const steps: PipelineStep[] = [
      {
        name: 'first',
        async run(ctx) {
          const pages = ((ctx.results.first as number | undefined) ?? 0) + 1;
          if (pages === 1) await ctx.callModel({ content: [] });
          return { result: pages, more: pages < 3 };
        },
      },
      {
        name: 'second',
        async run(ctx) {
          return { result: { saw: ctx.results.first } };
        },
      },
    ];

    await expect(runStepsLocally(steps, base, model)).resolves.toEqual({
      first: 3,
      second: { saw: 3 },
    });
    expect(model.calls).toEqual([
      { content: [], step: 'first', model: 'claude-haiku-5-5' },
    ]);
  });

  it('returns nothing for no steps', async () => {
    await expect(
      runStepsLocally([], base, new StandInModelClient()),
    ).resolves.toEqual({});
  });
});
