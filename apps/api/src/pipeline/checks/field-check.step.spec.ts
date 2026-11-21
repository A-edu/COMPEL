import { StandInModelClient } from '../model/stand-in-model-client.js';
import type { CheckStepResult } from '../findings.js';
import { PipelineError } from '../pipeline-error.js';
import { checksOfKind } from '../rule-set.js';
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
import { FIELD_CHECK_STEP, fieldCheckStep } from './field-check.step.js';

// Sprint 3 spec §7.1 (US-08), docs/rule-set.md §4.1.

const ROPA_MARK = 'ROPA-ONLY-VALUE';

function documents(
  overrides: {
    form?: TestDocument['fields'];
    supporting?: TestDocument['fields'];
    ropa?: TestDocument['fields'];
  } = {},
): TestDocument[] {
  const docs: TestDocument[] = [
    {
      id: 'form',
      kind: 'REQUEST_FORM',
      name: 'request-form.pdf',
      fields: {
        'F-R1': found('To verify reported wages during labour inspections.'),
        'F-R2': found('PDPL Article 15(3): to implement the Labour Law.'),
        'F-R3': found('Enforcing wage payment, given by the Labour Law.'),
        'F-R4': found('Employee name, national ID number.', [
          'Employee name',
          'national ID number',
        ]),
        'F-R5': found('Three years after the inspection closes.'),
        'F-R6': found('Ministry of Testing from Authority of Samples.'),
        ...overrides.form,
      },
    },
  ];
  if (overrides.supporting) {
    docs.push({
      id: 'supporting',
      kind: 'SUPPORTING',
      name: 'cover-letter.pdf',
      fields: overrides.supporting,
    });
  }
  docs.push({
    id: 'ropa',
    kind: 'ROPA',
    name: 'ropa.pdf',
    fields: {
      'F-P1': found(`Authority of Samples, dpo@samples.example ${ROPA_MARK}`),
      'F-P2': found(`Paying insurance benefits ${ROPA_MARK}`),
      'F-P3': found(`Social Insurance Law ${ROPA_MARK}`),
      'F-P4': found(`Employee name, national ID number ${ROPA_MARK}`),
      'F-P5': found(`Insured employees ${ROPA_MARK}`),
      'F-P6': found(`Government entities ${ROPA_MARK}`),
      'F-P7': found(`No transfer outside the Kingdom ${ROPA_MARK}`),
      'F-P8': found(`Ten years ${ROPA_MARK}`),
      ...overrides.ropa,
    },
  });
  return docs;
}

async function run(
  docs: TestDocument[],
  verdicts: Record<string, string> = {},
  model = new StandInModelClient(),
) {
  model.script(FIELD_CHECK_STEP, answerWith(verdicts, 'passed'));
  const outcome = await fieldCheckStep.run(
    checkContext(FIELD_CHECK_STEP, docs, model),
  );
  const { findings } = outcome.result as CheckStepResult;
  return {
    model,
    findings,
    finding: (id: string) => findings.find((f) => f.checkId === id)!,
  };
}

describe('Field-level compliance check (§7.1)', () => {
  it('checks every field the rule set names against its clause, with the run’s rule-set version', async () => {
    const { findings } = await run(documents());

    const fieldChecks = checksOfKind('FIELD');
    expect(findings.map((f) => f.checkId)).toEqual(
      fieldChecks.map((c) => c.id),
    );
    for (const finding of findings) {
      const check = fieldChecks.find((c) => c.id === finding.checkId)!;
      expect(finding).toMatchObject({
        result: 'PASSED',
        citation: check.citation,
        checkName: check.name,
        ruleSetVersion: TEST_RULE_SET_VERSION,
        requesterVisible: check.requesterVisible,
      });
    }
  });

  it('gives the extract-only collection legal basis (F-P3) no field-level check', async () => {
    const { findings } = await run(documents());

    expect(findings).toHaveLength(12);
    for (const finding of findings) {
      expect(finding.evidence.map((e) => e.field)).not.toContain('F-P3');
    }
  });

  it('gives not found, without asking the model, when no document states the field', async () => {
    const { finding, model } = await run(
      documents({ form: { 'F-R5': notFound } }),
    );

    expect(finding('FL-05')).toMatchObject({
      result: 'NOT_FOUND',
      citation: 'Law Art 18',
    });
    expect(finding('FL-05').explanation).toContain('not stated');
    expect(model.calls.flatMap(askedChecks)).not.toContain('FL-05');
  });

  it('never passes a field extracted as ambiguous, whatever the model would say', async () => {
    const { finding, model } = await run(
      documents({ ropa: { 'F-P6': ambiguous, 'F-P8': ambiguous } }),
      {},
    );

    expect(finding('FL-10').result).toBe('AMBIGUOUS');
    expect(finding('FL-12').result).toBe('AMBIGUOUS');
    expect(finding('FL-10').explanation).toContain('ropa.pdf');
    expect(model.calls.flatMap(askedChecks)).not.toContain('FL-10');
  });

  it('gives ambiguous when one document is ambiguous, even if another states the field', async () => {
    const { finding } = await run(
      documents({ supporting: { 'F-R1': ambiguous } }),
    );

    expect(finding('FL-01').result).toBe('AMBIGUOUS');
    expect(finding('FL-01').evidence.map((e) => e.documentName)).toEqual([
      'request-form.pdf',
      'cover-letter.pdf',
    ]);
  });

  it('passes held data and data subject categories whenever they are stated, without the model', async () => {
    const { finding, model } = await run(documents());

    expect(finding('FL-08').result).toBe('PASSED');
    expect(finding('FL-09').result).toBe('PASSED');
    const asked = model.calls.flatMap(askedChecks);
    expect(asked).not.toContain('FL-08');
    expect(asked).not.toContain('FL-09');
  });

  it('fails a check the model finds failing, with its explanation and the values it rests on', async () => {
    const { finding } = await run(
      documents({ form: { 'F-R1': found('Any lawful government purpose.') } }),
      { 'FL-01': 'failed' },
    );

    expect(finding('FL-01')).toMatchObject({
      result: 'FAILED',
      citation: 'IR Art 21(1)',
      explanation: 'Stand-in verdict for FL-01.',
      evidence: [
        {
          documentId: 'form',
          documentName: 'request-form.pdf',
          documentKind: 'REQUEST_FORM',
          field: 'F-R1',
          state: 'found',
          value: 'Any lawful government purpose.',
          quote: 'Any lawful government purpose.',
        },
      ],
    });
  });

  it('asks about the requester’s checks and the RoPA’s in separate calls, so no RoPA value reaches a requester check', async () => {
    const { model } = await run(documents());

    expect(model.calls).toHaveLength(2);
    const [requester, ropa] = model.calls;
    expect(askedChecks(requester)).toEqual([
      'FL-01',
      'FL-02',
      'FL-03',
      'FL-04',
      'FL-05',
    ]);
    expect(promptText(requester)).not.toContain(ROPA_MARK);
    expect(askedChecks(ropa)).toEqual([
      'FL-06',
      'FL-07',
      'FL-10',
      'FL-11',
      'FL-12',
    ]);
    // The model works on extracted values only, never a document (§2.2).
    for (const call of model.calls) {
      expect(call.content.every((block) => block.type === 'text')).toBe(true);
    }
  });

  it('tells the model who the requesting entity is for the recipients check', async () => {
    const { model } = await run(documents());

    expect(promptText(model.calls[1])).toContain('Ministry of Testing');
  });

  it('tells the model the recipients check is about who, not the conditions attached to a category', async () => {
    const { model } = await run(documents());

    expect(promptText(model.calls[1])).toContain('not when or why');
  });

  it('asks for one answer under each check’s ID, all required, so a structured answer cannot leave one out', async () => {
    const { model } = await run(documents());

    for (const call of model.calls) {
      const results = (
        call.schema as {
          properties: {
            results: { properties: object; required: string[] };
          };
        }
      ).properties.results;
      expect(results.required).toEqual(askedChecks(call));
      expect(Object.keys(results.properties)).toEqual(askedChecks(call));
    }
  });

  it('ends the run with a pipeline error when the model leaves a check out', async () => {
    const model = new StandInModelClient().script(FIELD_CHECK_STEP, () => ({
      model: 'stand-in',
      text: '',
      json: { results: {} },
    }));

    await expect(
      fieldCheckStep.run(checkContext(FIELD_CHECK_STEP, documents(), model)),
    ).rejects.toBeInstanceOf(PipelineError);
  });

  it('ends the run with a pipeline error when the model answers with a verdict a field check cannot give', async () => {
    await expect(
      run(documents(), { 'FL-01': 'consistent' }),
    ).rejects.toBeInstanceOf(PipelineError);
  });

  it('ends the run with a pipeline error when there is no extraction', async () => {
    const model = new StandInModelClient();
    const ctx = checkContext(FIELD_CHECK_STEP, documents(), model);

    await expect(
      fieldCheckStep.run({ ...ctx, results: {} }),
    ).rejects.toBeInstanceOf(PipelineError);
  });

  it('reads a field missing from a document’s extraction as not found, never as a value', async () => {
    const docs = documents();
    delete docs[0].fields['F-R3'];

    const { finding } = await run(docs);

    expect(finding('FL-02').result).toBe('NOT_FOUND');
  });

  it('reads a found value with no quote as not found', async () => {
    const { finding } = await run(
      documents({
        form: {
          'F-R5': { state: 'found', value: 'Three years.', quote: '  ' },
        },
      }),
    );

    expect(finding('FL-05').result).toBe('NOT_FOUND');
  });
});
