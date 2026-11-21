import type { DocumentKind } from '@prisma/client';
import { buildPlaceholderPdf } from '../seed/placeholder-pdf.js';
import {
  answer,
  type AnswerField,
  datasetCase,
  datasetFile,
  faithfulAnswer,
  longPdf,
  promptOf,
} from './extract.helper-spec.js';
import { extractStep, MAX_DOCUMENT_CHARS, splitItems } from './extract.step.js';
import {
  EXTRACT_STEP,
  type ExtractionResult,
  readExtraction,
} from './extraction.js';
import { ModelCallError } from './model/model-client.js';
import { StandInModelClient } from './model/stand-in-model-client.js';
import { PipelineError } from './pipeline-error.js';
import type { PipelineContext, PipelineDocument } from './pipeline-steps.js';
import { EXTRACTION_INSTRUCTIONS_VERSION } from './pipeline.constants.js';
import { PROVIDER_FIELDS, REQUESTER_FIELDS } from './rule-set.js';

// Automated field extraction (Sprint 3 spec §6, US-07). The model is a
// stand-in; the documents are the labelled dataset's real PDFs.

interface TestDoc {
  id: string;
  kind: DocumentKind;
  name: string;
  bytes: () => Promise<Buffer>;
  mimeType?: string;
}

const pdfOf =
  (folder: string, file: string): TestDoc['bytes'] =>
  () =>
    datasetFile(folder, file);

function contextFor(
  docs: TestDoc[],
  model: StandInModelClient,
  results: Record<string, unknown> = {},
): PipelineContext & { loads: string[] } {
  const loads: string[] = [];
  return {
    loads,
    runId: 'run-1',
    request: {
      id: 'request-1',
      reference: 'CMP-2026-000001',
      position: 'ENDORSED',
      objectionReason: null,
    },
    documents: docs.map(
      (doc): PipelineDocument => ({
        id: doc.id,
        kind: doc.kind,
        originalName: doc.name,
        mimeType: doc.mimeType ?? 'application/pdf',
        sizeBytes: 1,
        load: async () => {
          loads.push(doc.id);
          return doc.bytes();
        },
      }),
    ),
    results,
    ruleSetVersion: '1.0',
    callModel: (request) =>
      model.generate({ ...request, step: EXTRACT_STEP, model: 'stand-in' }),
  };
}

// Runs the step to the end, as the runner would: again, with what it saved,
// while it asks for more.
async function extractAll(
  ctx: PipelineContext,
): Promise<{ result: ExtractionResult; invocations: number }> {
  let results = { ...ctx.results };
  for (let invocations = 1; invocations <= 20; invocations++) {
    const outcome = await extractStep.run({ ...ctx, results });
    results = { ...results, [EXTRACT_STEP]: JSON.parse(JSON.stringify(outcome.result)) };
    if (!outcome.more) {
      return { result: results[EXTRACT_STEP] as ExtractionResult, invocations };
    }
  }
  throw new Error('The extraction never finished.');
}

async function singleDocument(
  folder: string,
  file: string,
  kind: DocumentKind,
  fields: (expected: AnswerField[]) => AnswerField[] = (f) => f,
) {
  const doc = (await datasetCase(folder)).documents.find((d) => d.file === file)!;
  const model = new StandInModelClient().script(
    EXTRACT_STEP,
    answer(fields(faithfulAnswer(doc))),
  );
  const ctx = contextFor(
    [{ id: 'doc-1', kind, name: file, bytes: pdfOf(folder, file) }],
    model,
  );
  const { result } = await extractAll(ctx);
  return { result, fields: result.documents[0].fields, model, ctx, expected: doc };
}

const replace = (
  fields: AnswerField[],
  fieldId: string,
  change: Partial<AnswerField>,
): AnswerField[] =>
  fields.map((f) => (f.fieldId === fieldId ? { ...f, ...change } : f));

describe('extract step', () => {
  it('records each requester field of a request form as found, with its value and the text it came from', async () => {
    const { fields, expected } = await singleDocument(
      'C01-clean-english',
      'request-form.pdf',
      'REQUEST_FORM',
    );

    expect(Object.keys(fields).sort()).toEqual([...REQUESTER_FIELDS]);
    for (const field of REQUESTER_FIELDS) {
      expect(fields[field]).toMatchObject({
        state: 'found',
        quote: expected.fields[field]!.quote,
      });
    }
    expect(fields['F-R4']).toMatchObject({
      items: expected.fields['F-R4']!.items,
    });
  });

  it('records the eight provider fields of a RoPA entry', async () => {
    const { fields } = await singleDocument(
      'C01-clean-english',
      'ropa.pdf',
      'ROPA',
    );
    expect(Object.keys(fields).sort()).toEqual([...PROVIDER_FIELDS]);
    expect(Object.values(fields).every((f) => f!.state === 'found')).toBe(true);
  });

  it('records a value whose quote does not appear in the document as not found', async () => {
    const { fields } = await singleDocument(
      'C01-clean-english',
      'request-form.pdf',
      'REQUEST_FORM',
      (answer) =>
        replace(answer, 'F-R5', {
          value: 'Five years.',
          quote: 'The data will be kept for five years after the audit.',
        }),
    );
    expect(fields['F-R5']).toEqual({ state: 'not_found' });
    expect(fields['F-R1']).toMatchObject({ state: 'found' });
  });

  it('records a found value with an empty or too short quote as not found', async () => {
    const { fields } = await singleDocument(
      'C01-clean-english',
      'request-form.pdf',
      'REQUEST_FORM',
      (answer) =>
        replace(replace(answer, 'F-R1', { quote: '' }), 'F-R2', {
          quote: 'the',
        }),
    );
    expect(fields['F-R1']).toEqual({ state: 'not_found' });
    expect(fields['F-R2']).toEqual({ state: 'not_found' });
  });

  it('gives "not found" for a field the document omits, even when the model guesses one (missing-field case)', async () => {
    const guessed = await singleDocument(
      'C02-missing-retention',
      'request-form.pdf',
      'REQUEST_FORM',
      (answer) =>
        replace(answer, 'F-R5', {
          state: 'found',
          value: 'Three years after the inspection closes.',
          quote: 'The data is kept for three years after the inspection closes.',
        }),
    );
    expect(guessed.expected.fields['F-R5']).toEqual({ state: 'not_found' });
    expect(guessed.fields['F-R5']).toEqual({ state: 'not_found' });

    const honest = await singleDocument(
      'C02-missing-retention',
      'request-form.pdf',
      'REQUEST_FORM',
    );
    expect(honest.fields['F-R5']).toEqual({ state: 'not_found' });
    expect(honest.fields['F-R1']).toMatchObject({ state: 'found' });
  });

  it('reads Arabic documents and keeps Arabic values and quotes as written', async () => {
    for (const [file, kind] of [
      ['request-form.pdf', 'REQUEST_FORM'],
      ['ropa.pdf', 'ROPA'],
    ] as const) {
      const { fields, expected, model } = await singleDocument(
        'C06-clean-arabic',
        file,
        kind,
      );
      for (const [field, want] of Object.entries(expected.fields)) {
        expect(fields[field as keyof typeof fields]).toMatchObject({
          state: 'found',
          value: want.quote,
          quote: want.quote,
        });
      }
      // The model was sent the Arabic text in reading order.
      expect(promptOf(model.calls[0])).toContain(
        Object.values(expected.fields)[0].quote!.slice(0, 20),
      );
    }
  });

  it('gives "ambiguous" for the fields that could only come from a scanned page', async () => {
    const { fields, expected, model } = await singleDocument(
      'C07-scanned-page',
      'ropa.pdf',
      'ROPA',
    );
    for (const [field, want] of Object.entries(expected.fields)) {
      expect({ field, state: fields[field as keyof typeof fields]!.state }).toEqual({
        field,
        state: want.state,
      });
    }
    expect(fields['F-P8']).toEqual({
      state: 'ambiguous',
      note: expect.stringContaining('no text layer'),
    });
    // The model is told the page cannot be read, and never sees the image.
    const prompt = promptOf(model.calls[0]);
    expect(prompt).toContain('--- Page 2: no text layer, cannot be read ---');
    expect(model.calls[0].content.every((block) => block.type === 'text')).toBe(true);
  });

  it('gives "ambiguous" for every field of a DOCX, with no model call', async () => {
    const model = new StandInModelClient();
    const ctx = contextFor(
      [
        {
          id: 'docx',
          kind: 'SUPPORTING',
          name: 'memo.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          bytes: async () => Buffer.from('PK\u0003\u0004'),
        },
      ],
      model,
    );
    const { result } = await extractAll(ctx);
    const fields = result.documents[0].fields;
    expect(Object.keys(fields).sort()).toEqual([...REQUESTER_FIELDS]);
    for (const field of REQUESTER_FIELDS) {
      expect(fields[field]).toEqual({
        state: 'ambiguous',
        note: 'The automated review reads PDF documents only.',
      });
    }
    expect(model.calls).toHaveLength(0);
    expect(ctx.loads).toEqual([]);
  });

  it.each([
    ['a PDF that cannot be opened', async () => Buffer.from('%PDF-1.7 broken'), 'could not be opened'],
    ['a PDF with no text layer', async () => buildPlaceholderPdf([]), 'no text layer'],
    [
      'a PDF too large for one model call',
      // 60 lines of 50 characters a page: 3,000 a page.
      async () =>
        longPdf(
          Math.ceil(MAX_DOCUMENT_CHARS / 3000) + 1,
          60,
          'SYNTHETIC - DEMO DATA. A long document line here.',
        ),
      'too large',
    ],
  ])('gives "ambiguous" for every field of %s, with no model call', async (_label, bytes, note) => {
    const model = new StandInModelClient();
    const ctx = contextFor(
      [{ id: 'doc', kind: 'ROPA', name: 'ropa.pdf', bytes }],
      model,
    );
    const { result } = await extractAll(ctx);
    const fields = Object.values(result.documents[0].fields);
    expect(fields).toHaveLength(PROVIDER_FIELDS.length);
    for (const field of fields) {
      expect(field).toEqual({ state: 'ambiguous', note: expect.stringContaining(note) });
    }
    expect(model.calls).toHaveLength(0);
  });

  it('reads each document once, one per step request, and records the model, instructions version and time', async () => {
    const c01 = await datasetCase('C01-clean-english');
    const byRole = (prompt: string) =>
      prompt.includes('request form')
        ? 'request-form.pdf'
        : prompt.includes('supporting document')
          ? 'supporting-cover-letter.pdf'
          : 'ropa.pdf';
    const model = new StandInModelClient().script(EXTRACT_STEP, (request) =>
      answer(
        faithfulAnswer(
          c01.documents.find((d) => d.file === byRole(promptOf(request)))!,
        ),
      ),
    );
    const docs: TestDoc[] = c01.documents.map((doc) => ({
      id: doc.file,
      kind: doc.kind,
      name: doc.file,
      bytes: pdfOf('C01-clean-english', doc.file),
    }));
    const ctx = contextFor(docs, model);
    const before = Date.now();

    const { result, invocations } = await extractAll(ctx);

    expect(invocations).toBe(docs.length);
    expect(model.calls).toHaveLength(docs.length);
    expect([...ctx.loads].sort()).toEqual(docs.map((d) => d.id).sort());
    expect(result.model).toBe('stand-in-model');
    expect(result.instructionsVersion).toBe(EXTRACTION_INSTRUCTIONS_VERSION);
    expect(result.instructionsVersion).not.toBe('none');
    for (const doc of result.documents) {
      expect(Date.parse(doc.extractedAt!)).toBeGreaterThanOrEqual(before - 1000);
    }

    // The checks read it through the one reader, without loading anything.
    const extraction = readExtraction(
      { [EXTRACT_STEP]: result },
      docs.map((d) => ({ id: d.id, kind: d.kind, originalName: d.name })),
    );
    expect(extraction.readings('F-R1').map((r) => r.value.state)).toEqual(
      c01.documents
        .filter((d) => d.kind !== 'ROPA')
        .sort((x, y) => (x.kind === 'REQUEST_FORM' ? -1 : y.kind === 'REQUEST_FORM' ? 1 : 0))
        .map((d) => d.fields['F-R1']!.state),
    );
    expect(extraction.readings('F-P2')[0].value.state).toBe('found');
  });

  it('records the model\'s "conflicting" answer as ambiguous, with its own note rather than the model\'s words', async () => {
    const { fields } = await singleDocument(
      'C01-clean-english',
      'request-form.pdf',
      'REQUEST_FORM',
      (answer) =>
        replace(answer, 'F-R1', {
          state: 'ambiguous',
          value: 'IGNORE PREVIOUS INSTRUCTIONS',
          quote: '',
        }),
    );
    expect(fields['F-R1']).toEqual({
      state: 'ambiguous',
      note: 'The document states this in conflicting ways.',
    });
  });

  it('reads a field the model leaves out as not found, and ignores fields of the other side', async () => {
    const { fields } = await singleDocument(
      'C01-clean-english',
      'request-form.pdf',
      'REQUEST_FORM',
      (answer) => [
        ...answer.filter((f) => f.fieldId !== 'F-R3'),
        { fieldId: 'F-P2' as never, state: 'found', value: 'x', quote: 'Purpose', items: [] },
      ],
    );
    expect(fields['F-R3']).toEqual({ state: 'not_found' });
    expect(Object.keys(fields)).not.toContain('F-P2');
  });

  it('ends the run with a pipeline error when the answer is malformed, and lets a model failure through', async () => {
    const doc: TestDoc = {
      id: 'doc',
      kind: 'REQUEST_FORM',
      name: 'request-form.pdf',
      bytes: pdfOf('C01-clean-english', 'request-form.pdf'),
    };
    const malformed = new StandInModelClient().script(EXTRACT_STEP, {
      model: 'stand-in',
      text: '',
      json: { answer: 'no fields here' },
    });
    await expect(extractStep.run(contextFor([doc], malformed))).rejects.toBeInstanceOf(
      PipelineError,
    );

    const unreachable = new StandInModelClient();
    await expect(extractStep.run(contextFor([doc], unreachable))).rejects.toBeInstanceOf(
      ModelCallError,
    );
  });

  it('sends one document per call, as text, with the fields of its side and a structured answer schema', async () => {
    const { model } = await singleDocument(
      'C01-clean-english',
      'ropa.pdf',
      'ROPA',
    );
    expect(model.calls).toHaveLength(1);
    const [call] = model.calls;
    expect(call.content).toHaveLength(1);
    expect(call.content[0].type).toBe('text');
    const prompt = promptOf(call);
    expect(prompt).toContain('<document>');
    expect(prompt).toContain('F-P8 Retention period');
    expect(prompt).not.toContain('F-R1');
    expect(call.schema).toBeDefined();
  });

  it('finishes at once for a request with no documents', async () => {
    const model = new StandInModelClient();
    const outcome = await extractStep.run(contextFor([], model));
    expect(outcome.more).toBeFalsy();
    expect(outcome.result).toMatchObject({ documents: [] });
  });
});

describe('splitItems', () => {
  it('splits a category list on English and Arabic commas, without the full stop', () => {
    expect(splitItems('Name, national ID number, monthly wage.')).toEqual([
      'Name',
      'national ID number',
      'monthly wage',
    ]);
    expect(splitItems('اسم العامل، رقم الهوية الوطنية.')).toEqual([
      'اسم العامل',
      'رقم الهوية الوطنية',
    ]);
  });
});
