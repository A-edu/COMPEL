import { StandInModelClient } from '../model/stand-in-model-client.js';
import type { CheckStepResult } from '../findings.js';
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
import { CONSISTENCY_STEP, consistencyStep } from './consistency.step.js';

// Sprint 3 spec §7.2 (US-09), docs/rule-set.md §4.2.

const ROPA_MARK = 'ROPA-ONLY-VALUE';
const FORM_CATEGORIES = 'Employee name, national ID number, monthly wage.';
const MEMO_CATEGORIES =
  'Employee name, national ID number, monthly wage, bank account number.';

const form = (fields: TestDocument['fields'] = {}): TestDocument => ({
  id: 'form',
  kind: 'REQUEST_FORM',
  name: 'request-form.pdf',
  fields: {
    'F-R1': found('To verify reported wages during labour inspections.'),
    'F-R4': found(FORM_CATEGORIES),
    'F-R5': found('Three years after the inspection closes.'),
    'F-R6': found('Ministry of Testing from Authority of Samples.'),
    ...fields,
  },
});
const supporting = (fields: TestDocument['fields']): TestDocument => ({
  id: 'memo',
  kind: 'SUPPORTING',
  name: 'audit-memo.pdf',
  fields,
});
const ropa = (fields: TestDocument['fields'] = {}): TestDocument => ({
  id: 'ropa',
  kind: 'ROPA',
  name: 'ropa.pdf',
  fields: {
    'F-P1': found(`Authority of Samples, dpo@samples.example ${ROPA_MARK}`),
    'F-P4': found(
      `Employee name, national ID number, monthly wage ${ROPA_MARK}`,
    ),
    ...fields,
  },
});

async function run(
  docs: TestDocument[],
  verdicts: Record<string, string> = {},
) {
  const model = new StandInModelClient().script(
    CONSISTENCY_STEP,
    answerWith(verdicts, 'consistent'),
  );
  const outcome = await consistencyStep.run(
    checkContext(CONSISTENCY_STEP, docs, model),
  );
  const { findings } = outcome.result as CheckStepResult;
  return {
    model,
    findings,
    finding: (id: string) => findings.find((f) => f.checkId === id)!,
    asked: () => model.calls.flatMap(askedChecks),
  };
}

describe('Cross-document consistency check (§7.2)', () => {
  it('gives one finding per consistency check, citing its clause and the run’s rule-set version', async () => {
    const { findings } = await run([form(), ropa()]);

    const checks = checksOfKind('CONSISTENCY');
    expect(findings.map((f) => f.checkId)).toEqual(checks.map((c) => c.id));
    for (const finding of findings) {
      const check = checks.find((c) => c.id === finding.checkId)!;
      expect(finding).toMatchObject({
        citation: check.citation,
        ruleSetVersion: TEST_RULE_SET_VERSION,
        requesterVisible: check.requesterVisible,
      });
    }
  });

  it('passes documents that agree', async () => {
    const { finding } = await run([
      form(),
      supporting({ 'F-R4': found(FORM_CATEGORIES) }),
      ropa(),
    ]);

    expect(finding('CD-03').result).toBe('PASSED');
    expect(finding('CD-03').evidence.map((e) => e.documentName)).toEqual([
      'request-form.pdf',
      'audit-memo.pdf',
    ]);
  });

  it('flags a contradiction between documents, naming both and quoting each value (the dataset’s contradiction case)', async () => {
    const { finding } = await run(
      [form(), supporting({ 'F-R4': found(MEMO_CATEGORIES) }), ropa()],
      { 'CD-03': 'inconsistent' },
    );

    const cd03 = finding('CD-03');
    expect(cd03.result).toBe('INCONSISTENT');
    expect(cd03.citation).toBe('IR Art 20(3)(b)');
    expect(cd03.explanation).toContain(
      `request-form.pdf: "${FORM_CATEGORIES}"`,
    );
    expect(cd03.explanation).toContain(`audit-memo.pdf: "${MEMO_CATEGORIES}"`);
    expect(cd03.evidence).toEqual([
      expect.objectContaining({ documentName: 'request-form.pdf' }),
      expect.objectContaining({ documentName: 'audit-memo.pdf' }),
    ]);
  });

  it('flags a field a supporting document states but the request form does not, without asking the model (D4)', async () => {
    const { finding, asked } = await run([
      form({ 'F-R5': notFound }),
      supporting({ 'F-R5': found('Five years.') }),
      ropa(),
    ]);

    expect(finding('CD-05').result).toBe('INCONSISTENT');
    expect(finding('CD-05').explanation).toContain(
      'stated in audit-memo.pdf but missing from the request form',
    );
    expect(finding('CD-05').explanation).toContain('"Five years."');
    expect(asked()).not.toContain('CD-05');
  });

  it('passes a field the request form states and a supporting document leaves out (D4)', async () => {
    const { finding, asked } = await run([
      form(),
      supporting({ 'F-R5': notFound }),
      ropa(),
    ]);

    expect(finding('CD-05').result).toBe('PASSED');
    expect(asked()).not.toContain('CD-05');
  });

  it('passes a field no requester document states, leaving it to the field-level check', async () => {
    const { finding, asked } = await run([form({ 'F-R5': notFound }), ropa()]);

    expect(finding('CD-05').result).toBe('PASSED');
    expect(finding('CD-05').explanation).toContain('nothing to compare');
    expect(asked()).not.toContain('CD-05');
  });

  it('gives inconsistent for an ambiguous value that takes part in a comparison', async () => {
    const { finding, asked } = await run([
      form(),
      supporting({ 'F-R1': ambiguous }),
      ropa({ 'F-P4': ambiguous }),
    ]);

    expect(finding('CD-02').result).toBe('INCONSISTENT');
    expect(finding('CD-02').explanation).toContain(
      'audit-memo.pdf could not be read reliably',
    );
    expect(finding('CD-04').result).toBe('INCONSISTENT');
    expect(asked()).not.toContain('CD-02');
    expect(asked()).not.toContain('CD-04');
  });

  it('flags a requested data category the RoPA entry does not record', async () => {
    const { finding } = await run(
      [form({ 'F-R4': found(MEMO_CATEGORIES) }), ropa()],
      { 'CD-04': 'inconsistent' },
    );

    expect(finding('CD-04')).toMatchObject({
      result: 'INCONSISTENT',
      requesterVisible: false,
      citation: 'IR Art 33(3); IR Art 33(5)(d)',
    });
    expect(finding('CD-04').evidence.map((e) => e.documentName)).toEqual([
      'request-form.pdf',
      'ropa.pdf',
    ]);
  });

  it('leaves a category missing from the request form to CD-03, not CD-04', async () => {
    const { finding } = await run([
      form({ 'F-R4': notFound }),
      supporting({ 'F-R4': found(FORM_CATEGORIES) }),
      ropa(),
    ]);

    expect(finding('CD-03').result).toBe('INCONSISTENT');
    expect(finding('CD-04').result).toBe('PASSED');
  });

  it('compares the parties with the registered entities and the RoPA controller', async () => {
    const { finding, model } = await run([form(), ropa()], {
      'CD-01': 'inconsistent',
    });

    expect(finding('CD-01').result).toBe('INCONSISTENT');
    const cross = model.calls.find((c) => askedChecks(c).includes('CD-01'))!;
    expect(promptText(cross)).toContain('Ministry of Testing');
    expect(promptText(cross)).toContain('Authority of Samples');
  });

  it('asks about requester-only checks and RoPA checks in separate calls, so no RoPA value reaches a requester check', async () => {
    const { model } = await run([
      form(),
      supporting({
        'F-R1': found('To verify wages.'),
        'F-R4': found(FORM_CATEGORIES),
        'F-R5': found('Three years.'),
      }),
      ropa(),
    ]);

    expect(model.calls).toHaveLength(2);
    const [requester, cross] = model.calls;
    expect(askedChecks(requester)).toEqual(['CD-02', 'CD-03', 'CD-05']);
    expect(promptText(requester)).not.toContain(ROPA_MARK);
    expect(askedChecks(cross)).toEqual(['CD-01', 'CD-04']);
  });

  it('makes no model call when there is nothing to compare', async () => {
    const { model, findings } = await run(
      [
        form({ 'F-R6': notFound, 'F-R4': notFound }),
        ropa({ 'F-P1': notFound }),
      ],
      {},
    );

    expect(model.calls).toHaveLength(0);
    expect(findings.every((f) => f.result === 'PASSED')).toBe(true);
  });
});
