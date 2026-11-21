import type { DocumentKind } from '@prisma/client';
import type { ExtractedField } from '../extraction.js';
import type { ModelRequest, ModelResponse } from '../model/model-client.js';
import { StandInModelClient } from '../model/stand-in-model-client.js';
import type { PipelineContext } from '../pipeline-steps.js';
import type { FieldId } from '../rule-set.js';

// A step context for the check steps' unit tests: an extraction saved as §6
// would save it, a stand-in model, and documents that refuse to be read, so
// a check that reads a document again fails (§3.3, US-07).

export interface TestDocument {
  id: string;
  kind: DocumentKind;
  name: string;
  fields: Partial<Record<FieldId, ExtractedField>>;
}

export const found = (value: string, items?: string[]): ExtractedField => ({
  state: 'found',
  value,
  quote: value,
  ...(items ? { items } : {}),
});
export const notFound: ExtractedField = { state: 'not_found' };
export const ambiguous: ExtractedField = { state: 'ambiguous' };

export const TEST_RULE_SET_VERSION = '9.9';

export function checkContext(
  step: string,
  documents: TestDocument[],
  model: StandInModelClient,
  parties: { requestingEntity?: string; providingEntity?: string } = {
    requestingEntity: 'Ministry of Testing',
    providingEntity: 'Authority of Samples',
  },
): PipelineContext {
  return {
    runId: 'run-1',
    request: {
      id: 'request-1',
      reference: 'CMP-2026-000001',
      position: 'ENDORSED',
      objectionReason: null,
      ...parties,
    },
    documents: documents.map((doc) => ({
      id: doc.id,
      kind: doc.kind,
      originalName: doc.name,
      mimeType: 'application/pdf',
      sizeBytes: 1,
      load: () => Promise.reject(new Error('A check read a document.')),
    })),
    results: {
      extract: {
        model: 'stand-in',
        instructionsVersion: 'test',
        documents: documents.map((doc) => ({
          documentId: doc.id,
          kind: doc.kind,
          fields: doc.fields,
        })),
      },
    },
    ruleSetVersion: TEST_RULE_SET_VERSION,
    callModel: (request) =>
      model.generate({ ...request, step, model: 'stand-in' }),
  };
}

// The checks one model call was asked about.
export function askedChecks(request: ModelRequest): string[] {
  const text = (request.content[0] as { text: string }).text;
  return (JSON.parse(text) as { checks: { checkId: string }[] }).checks.map(
    (c) => c.checkId,
  );
}

// A stand-in answer giving each check asked about the verdict in
// `verdicts`, or `otherwise`.
export function answerWith(
  verdicts: Record<string, string>,
  otherwise: string,
): (request: ModelRequest) => ModelResponse {
  return (request) => ({
    model: 'stand-in',
    text: '',
    json: {
      results: askedChecks(request).map((checkId) => ({
        checkId,
        verdict: verdicts[checkId] ?? otherwise,
        explanation: `Stand-in verdict for ${checkId}.`,
      })),
    },
  });
}

export function promptText(request: ModelRequest): string {
  return JSON.stringify(request.content);
}
