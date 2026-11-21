import { readFile } from 'node:fs/promises';
import { PipelineError } from '../pipeline-error.js';
import type { CheckStepResult } from '../findings.js';
import { StandInModelClient } from '../model/stand-in-model-client.js';
import type { FieldId } from '../rule-set.js';
import {
  ambiguous,
  answerWith,
  askedChecks,
  checkContext,
  found,
  notFound,
  promptText,
  TEST_RULE_SET_VERSION,
  type TestDocument,
} from './check-context.helper-spec.js';
import { PURPOSE_STEP, purposeStep } from './purpose.step.js';

// Sprint 3 spec §7.3 (US-10), docs/rule-set.md §4.3.

const REQUEST_PURPOSE = 'To verify reported wages during labour inspections.';
const MEMO_PURPOSE = 'To check wages paid against wages registered.';
const COLLECTION_PURPOSE =
  'Registering private-sector workers and their wages to collect social insurance contributions.';
const LEGAL_BASIS = 'The Social Insurance Law.';

const form = (fields: TestDocument['fields'] = {}): TestDocument => ({
  id: 'form',
  kind: 'REQUEST_FORM',
  name: 'request-form.pdf',
  fields: { 'F-R1': found(REQUEST_PURPOSE), ...fields },
});
const memo = (fields: TestDocument['fields']): TestDocument => ({
  id: 'memo',
  kind: 'SUPPORTING',
  name: 'cover-letter.pdf',
  fields,
});
const ropa = (fields: TestDocument['fields'] = {}): TestDocument => ({
  id: 'ropa',
  kind: 'ROPA',
  name: 'ropa.pdf',
  fields: {
    'F-P2': found(COLLECTION_PURPOSE),
    'F-P3': found(LEGAL_BASIS),
    ...fields,
  },
});

async function run(docs: TestDocument[], verdict?: string) {
  const model = new StandInModelClient();
  if (verdict) model.script(PURPOSE_STEP, answerWith({}, verdict));
  const outcome = await purposeStep.run(
    checkContext(PURPOSE_STEP, docs, model),
  );
  const { findings } = outcome.result as CheckStepResult;
  expect(findings).toHaveLength(1);
  return { finding: findings[0], model, outcome };
}

describe('purpose step (PC-01)', () => {
  it.each([
    ['compatible', 'COMPATIBLE'],
    ['incompatible', 'INCOMPATIBLE'],
    ['indeterminate', 'INDETERMINATE'],
  ])(
    'records the model\'s "%s" as %s, citing the rule set\'s clause and version',
    async (verdict, result) => {
      const { finding, model } = await run([form(), ropa()], verdict);
      expect(finding).toMatchObject({
        checkId: 'PC-01',
        checkName: 'Purpose compatibility',
        result,
        citation: 'Law Art 10; Law Art 11(1); IR Art 18; IR Art 21(1)',
        ruleSetVersion: TEST_RULE_SET_VERSION,
        requesterVisible: false,
      });
      expect(model.calls).toHaveLength(1);
      expect(askedChecks(model.calls[0])).toEqual(['PC-01']);
    },
  );

  it('sends the model the request purposes, the collection purpose and the legal basis, never a document', async () => {
    const { model } = await run(
      [form(), memo({ 'F-R1': found(MEMO_PURPOSE) }), ropa()],
      'compatible',
    );
    const prompt = promptText(model.calls[0]);
    for (const value of [
      REQUEST_PURPOSE,
      MEMO_PURPOSE,
      COLLECTION_PURPOSE,
      LEGAL_BASIS,
    ]) {
      expect(prompt).toContain(value);
    }
    expect(model.calls[0].content.every((b) => b.type === 'text')).toBe(true);
  });

  it('keeps the three values and their quotes as evidence', async () => {
    const { finding } = await run([form(), ropa()], 'compatible');
    expect(finding.evidence.map((e) => [e.field, e.state, e.quote])).toEqual([
      ['F-R1', 'found', REQUEST_PURPOSE],
      ['F-P2', 'found', COLLECTION_PURPOSE],
      ['F-P3', 'found', LEGAL_BASIS],
    ]);
  });

  it.each(['incompatible', 'indeterminate'])(
    'shows both purposes side by side, each with the text it came from, when %s',
    async (verdict) => {
      const { finding } = await run([form(), ropa()], verdict);
      expect(finding.explanation).toContain(`Stand-in verdict for PC-01.`);
      expect(finding.explanation).toContain(
        `Request purpose (request-form.pdf): "${REQUEST_PURPOSE}"`,
      );
      expect(finding.explanation).toContain(
        `Collection purpose (ropa.pdf): "${COLLECTION_PURPOSE}"`,
      );
      expect(finding.explanation).toContain(
        `Collection legal basis (ropa.pdf): "${LEGAL_BASIS}"`,
      );
    },
  );

  it("gives a compatible finding the model's explanation alone", async () => {
    const { finding } = await run([form(), ropa()], 'compatible');
    expect(finding.explanation).toBe('Stand-in verdict for PC-01.');
  });

  const gaps: [string, TestDocument[], string][] = [
    [
      'the request purpose is not stated',
      [form({ 'F-R1': notFound }), ropa()],
      'The request documents do not state the request purpose.',
    ],
    [
      'the request purpose is ambiguous in one document',
      [form(), memo({ 'F-R1': ambiguous }), ropa()],
      'The request purpose in cover-letter.pdf could not be read reliably.',
    ],
    [
      'the collection purpose is not stated',
      [form(), ropa({ 'F-P2': notFound })],
      'The RoPA entry does not state the collection purpose.',
    ],
    [
      'the collection purpose is ambiguous',
      [form(), ropa({ 'F-P2': ambiguous })],
      'The collection purpose in ropa.pdf could not be read reliably.',
    ],
    [
      'the collection legal basis is not stated',
      [form(), ropa({ 'F-P3': notFound })],
      'The RoPA entry does not state the collection legal basis.',
    ],
    [
      'the collection legal basis is ambiguous',
      [form(), ropa({ 'F-P3': ambiguous })],
      'The collection legal basis in ropa.pdf could not be read reliably.',
    ],
  ];

  it.each(gaps)(
    'is indeterminate, never compatible, with no model call, when %s',
    async (_label, docs, reason) => {
      const { finding, model } = await run(docs);
      expect(finding.result).toBe('INDETERMINATE');
      expect(finding.explanation).toContain(reason);
      expect(finding.explanation).toContain(
        'So the purposes cannot be compared.',
      );
      expect(model.calls).toHaveLength(0);
    },
  );

  it('shows what is stated and what is not, side by side, when information is missing', async () => {
    const { finding } = await run([form(), ropa({ 'F-P3': notFound })]);
    expect(finding.explanation).toContain(
      `Request purpose (request-form.pdf): "${REQUEST_PURPOSE}".`,
    );
    expect(finding.explanation).toContain(
      `Collection purpose (ropa.pdf): "${COLLECTION_PURPOSE}".`,
    );
    expect(finding.explanation).toContain(
      'Collection legal basis: not stated.',
    );
  });

  it("gives the dataset's indeterminate case (C05, no collection legal basis) as indeterminate without the model", async () => {
    const expected = JSON.parse(
      await readFile(
        new URL(
          '../../../eval/dataset/C05-indeterminate-purpose/expected.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as {
      documents: {
        file: string;
        kind: TestDocument['kind'];
        fields: Record<string, { state: string; quote?: string }>;
      }[];
    };
    const docs: TestDocument[] = expected.documents.map((doc) => ({
      id: doc.file,
      kind: doc.kind,
      name: doc.file,
      fields: Object.fromEntries(
        Object.entries(doc.fields).map(([field, value]) => [
          field as FieldId,
          value.state === 'found'
            ? found(value.quote!)
            : value.state === 'ambiguous'
              ? ambiguous
              : notFound,
        ]),
      ),
    }));

    const { finding, model } = await run(docs);
    expect(finding.result).toBe('INDETERMINATE');
    expect(model.calls).toHaveLength(0);
  });

  it('ends the run with a pipeline error when the model answer is malformed', async () => {
    const model = new StandInModelClient().script(PURPOSE_STEP, {
      model: 'stand-in',
      text: '',
      json: {
        results: { 'PC-01': { verdict: 'probably fine', explanation: '' } },
      },
    });
    await expect(
      purposeStep.run(checkContext(PURPOSE_STEP, [form(), ropa()], model)),
    ).rejects.toBeInstanceOf(PipelineError);
  });

  it('never reads a document again', async () => {
    // checkContext's documents reject any load; the step completes anyway.
    await expect(run([form(), ropa()], 'compatible')).resolves.toBeDefined();
  });
});
