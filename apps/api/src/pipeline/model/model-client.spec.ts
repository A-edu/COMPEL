import type { ConfigService } from '@nestjs/config';
import { AnthropicModelClient } from './anthropic-model-client.js';
import {
  ModelCallError,
  modelSettingFor,
  resolveModel,
} from './model-client.js';
import { StandInModelClient } from './stand-in-model-client.js';

const configOf = (values: Record<string, string | undefined>) =>
  ({ get: (name: string) => values[name] }) as unknown as ConfigService;

describe('model settings (Sprint 3 spec §2.2)', () => {
  it('names one setting per step', () => {
    expect(modelSettingFor('extract')).toBe('PIPELINE_MODEL_EXTRACT');
    expect(modelSettingFor('field-check')).toBe('PIPELINE_MODEL_FIELD_CHECK');
    expect(modelSettingFor('consistency')).toBe('PIPELINE_MODEL_CONSISTENCY');
  });

  it('uses the step setting, then PIPELINE_MODEL, then the default', () => {
    const read = (values: Record<string, string>) => (name: string) =>
      values[name];
    expect(resolveModel('extract', read({}), 'fallback')).toBe('fallback');
    expect(
      resolveModel('extract', read({ PIPELINE_MODEL: 'general' }), 'fallback'),
    ).toBe('general');
    expect(
      resolveModel(
        'extract',
        read({ PIPELINE_MODEL: 'general', PIPELINE_MODEL_EXTRACT: 'specific' }),
        'fallback',
      ),
    ).toBe('specific');
    expect(
      resolveModel(
        'purpose',
        read({ PIPELINE_MODEL_EXTRACT: 'specific' }),
        'fallback',
      ),
    ).toBe('fallback');
  });

  it('ignores blank settings', () => {
    expect(resolveModel('extract', () => '  ', 'fallback')).toBe('fallback');
  });

  it('defaults to claude-haiku-5-5 in the real client', () => {
    const client = new AnthropicModelClient(configOf({}));
    expect(client.modelFor('extract')).toBe('claude-haiku-5-5');
    const configured = new AnthropicModelClient(
      configOf({ PIPELINE_MODEL_EXTRACT: 'claude-sonnet-5-5' }),
    );
    expect(configured.modelFor('extract')).toBe('claude-sonnet-5-5');
    expect(configured.modelFor('purpose')).toBe('claude-haiku-5-5');
  });
});

describe('AnthropicModelClient', () => {
  it('never calls the real model from tests, even with a key', async () => {
    const client = new AnthropicModelClient(
      configOf({ ANTHROPIC_API_KEY: 'sk-ant-not-a-real-key' }),
    );
    await expect(
      client.generate({
        step: 'extract',
        content: [{ type: 'text', text: 'Hi' }],
      }),
    ).rejects.toBeInstanceOf(ModelCallError);
  });
});

describe('StandInModelClient', () => {
  it('answers from its script and records every call', async () => {
    const model = new StandInModelClient()
      .script('extract', { model: 'stand-in', text: 'fixed' })
      .script('check', (request) => ({
        model: 'stand-in',
        text: '',
        json: { echoed: request.step },
      }));

    await expect(
      model.generate({ step: 'extract', content: [] }),
    ).resolves.toMatchObject({ text: 'fixed' });
    await expect(
      model.generate({ step: 'check', content: [] }),
    ).resolves.toMatchObject({ json: { echoed: 'check' } });
    expect(model.calls.map((call) => call.step)).toEqual(['extract', 'check']);
  });

  it('fails like an unreachable model for a step with no script', async () => {
    const model = new StandInModelClient();
    await expect(
      model.generate({ step: 'unscripted', content: [] }),
    ).rejects.toBeInstanceOf(ModelCallError);
    expect(model.calls).toHaveLength(1);
  });
});
