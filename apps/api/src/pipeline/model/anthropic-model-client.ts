import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_PIPELINE_MODEL } from '../pipeline.constants.js';
import {
  ModelCallError,
  type ModelClient,
  type ModelRequest,
  type ModelResponse,
  resolveModel,
} from './model-client.js';

// Non-streaming calls stay well under the SDK's HTTP timeout at this size.
const DEFAULT_MAX_TOKENS = 16_000;
const CALL_TIMEOUT_MS = 120_000;

// The real model, through the Anthropic API (Sprint 3 spec §2.2). The key
// comes only from ANTHROPIC_API_KEY and is never logged; neither are prompts,
// documents or answers. A missing key does not stop the app (§15.6): every
// call fails instead, and the run ends flagged with a pipeline error.
@Injectable()
export class AnthropicModelClient implements ModelClient, OnModuleInit {
  private readonly logger = new Logger(AnthropicModelClient.name);
  private client: Anthropic | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (!this.apiKey()) {
      this.logger.warn(
        'ANTHROPIC_API_KEY is not set: automated reviews will end flagged with a pipeline error.',
      );
    }
  }

  modelFor(step: string): string {
    return resolveModel(
      step,
      (name) => this.config.get<string>(name),
      DEFAULT_PIPELINE_MODEL,
    );
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    // Automated tests never call the real model (spec §4.3, §5.6).
    if (process.env.VITEST) {
      throw new ModelCallError('The real model is never called from tests.');
    }
    const client = this.getClient();
    const model = request.model ?? this.modelFor(request.step);

    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(request.system ? { system: request.system } : {}),
        messages: [{ role: 'user', content: request.content }],
        ...(request.schema
          ? {
              output_config: {
                format: { type: 'json_schema', schema: request.schema },
              },
            }
          : {}),
      });
    } catch (error) {
      throw new ModelCallError(describeApiError(error));
    }

    if (message.stop_reason === 'refusal') {
      throw new ModelCallError('The model declined the request.');
    }
    if (message.stop_reason === 'max_tokens') {
      throw new ModelCallError('The model answer was cut off.');
    }

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    if (!request.schema) return { model: message.model, text };

    try {
      return { model: message.model, text, json: JSON.parse(text) };
    } catch {
      throw new ModelCallError('The model answer was not valid JSON.');
    }
  }

  private apiKey(): string | undefined {
    const key = this.config.get<string>('ANTHROPIC_API_KEY');
    return key && key.trim() !== '' ? key.trim() : undefined;
  }

  private getClient(): Anthropic {
    if (this.client) return this.client;
    const apiKey = this.apiKey();
    if (!apiKey) throw new ModelCallError('No model API key is configured.');
    this.client = new Anthropic({
      apiKey,
      timeout: CALL_TIMEOUT_MS,
      maxRetries: 2,
    });
    return this.client;
  }
}

// Type and HTTP status only: an API error's message can quote the request.
function describeApiError(error: unknown): string {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return 'The model call timed out.';
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'The model API could not be reached.';
  }
  if (error instanceof Anthropic.APIError) {
    return `The model API returned ${error.status ?? 'an error'} (${error.constructor.name}).`;
  }
  return 'The model call failed.';
}
