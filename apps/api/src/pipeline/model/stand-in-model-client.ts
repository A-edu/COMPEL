import { DEFAULT_PIPELINE_MODEL } from '../pipeline.constants.js';
import {
  ModelCallError,
  type ModelClient,
  type ModelRequest,
  type ModelResponse,
} from './model-client.js';

export type StandInAnswer =
  | ModelResponse
  | ((request: ModelRequest) => ModelResponse | Promise<ModelResponse>);

// Answers in place of the model, so the test suite runs with no API key and
// never sends anything out (Sprint 3 spec §5.6). A test scripts an answer per
// step; a step with no script fails like an unreachable model, which ends the
// run flagged. Every call is recorded.
//
//   const model = new StandInModelClient();
//   model.script('extract', { model: 'stand-in', text: '', json: { ... } });
//   ... override MODEL_CLIENT with `model` ...
//   expect(model.calls).toHaveLength(1);
export class StandInModelClient implements ModelClient {
  readonly calls: ModelRequest[] = [];
  private readonly answers = new Map<string, StandInAnswer>();

  script(step: string, answer: StandInAnswer): this {
    this.answers.set(step, answer);
    return this;
  }

  modelFor(): string {
    return DEFAULT_PIPELINE_MODEL;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    this.calls.push(request);
    const answer = this.answers.get(request.step);
    if (!answer) {
      throw new ModelCallError(
        `No stand-in answer for step "${request.step}".`,
      );
    }
    return typeof answer === 'function' ? answer(request) : answer;
  }
}
