import type Anthropic from '@anthropic-ai/sdk';

// The one way a pipeline step reaches a model (Sprint 3 spec §2.2, §5.6).
// AnthropicModelClient calls the real model; StandInModelClient answers in
// tests and never leaves the process.
export const MODEL_CLIENT = Symbol('MODEL_CLIENT');

export interface ModelRequest {
  // The step making the call; it chooses the model (PIPELINE_MODEL_<STEP>).
  step: string;
  // The model the run snapshotted for this step. Defaults to the current
  // setting.
  model?: string;
  system?: string;
  // One user turn: text and, for extraction, one document per call (§2.2).
  content: Anthropic.ContentBlockParam[];
  // When set, the answer must be JSON matching this schema (structured
  // outputs) and is returned parsed in `json`.
  schema?: Record<string, unknown>;
  maxTokens?: number;
}

export interface ModelResponse {
  model: string;
  text: string;
  json?: unknown;
}

export interface ModelClient {
  // The model a step uses now: PIPELINE_MODEL_<STEP>, then PIPELINE_MODEL,
  // then claude-haiku-5-5.
  modelFor(step: string): string;
  generate(request: ModelRequest): Promise<ModelResponse>;
}

// Every failure to get an answer. The message is safe to log: it names the
// kind of failure and an HTTP status, never the prompt, the answer or the key.
export class ModelCallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelCallError';
  }
}

// PIPELINE_MODEL_EXTRACT for step "extract", PIPELINE_MODEL_FIELD_CHECK for
// "field-check", and so on.
export function modelSettingFor(step: string): string {
  return `PIPELINE_MODEL_${step.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
}

export function resolveModel(
  step: string,
  read: (name: string) => string | undefined,
  fallback: string,
): string {
  const nonBlank = (value: string | undefined) =>
    value !== undefined && value.trim() !== '' ? value.trim() : undefined;
  return (
    nonBlank(read(modelSettingFor(step))) ??
    nonBlank(read('PIPELINE_MODEL')) ??
    fallback
  );
}
