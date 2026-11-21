import { draftFinding, type FindingDraft } from './findings.js';
import { PipelineError } from './pipeline-error.js';
import {
  collectFindings,
  passesOutcomeRule,
  reasonText,
} from './pipeline-outcome.js';
import { CHECKS } from './rule-set.js';

// Sprint 3 spec §2.4, §3.2, §8.

const passing = () =>
  CHECKS.map((check) => ({
    checkId: check.id,
    result: check.kind === 'PURPOSE' ? 'COMPATIBLE' : 'PASSED',
  })) as { checkId: string; result: FindingDraft['result'] }[];

describe('The outcome rule (§2.4)', () => {
  it('clears a request only when every check passed and the provider endorsed it', () => {
    expect(passesOutcomeRule(passing(), 'ENDORSED')).toBe(true);
    expect(passesOutcomeRule(passing(), 'OBJECTED')).toBe(false);
    expect(passesOutcomeRule(passing(), undefined)).toBe(false);
  });

  it.each([
    ['FL-05', 'FAILED'],
    ['FL-05', 'NOT_FOUND'],
    ['FL-09', 'AMBIGUOUS'],
    ['CD-03', 'INCONSISTENT'],
    ['PC-01', 'INCOMPATIBLE'],
    ['PC-01', 'INDETERMINATE'],
  ] as const)('flags a request whose %s is %s', (checkId, result) => {
    const findings = passing().map((f) =>
      f.checkId === checkId ? { ...f, result } : f,
    );
    expect(passesOutcomeRule(findings, 'ENDORSED')).toBe(false);
  });

  it('flags a request with a check that has no finding', () => {
    const findings = passing().filter((f) => f.checkId !== 'PC-01');
    expect(passesOutcomeRule(findings, 'ENDORSED')).toBe(false);
  });

  it('flags a request with two findings for one check', () => {
    expect(
      passesOutcomeRule(
        [...passing(), { checkId: 'FL-01', result: 'PASSED' }],
        'ENDORSED',
      ),
    ).toBe(false);
  });
});

describe('Collecting the findings of a run', () => {
  const draft = (checkId: string, result: FindingDraft['result']) =>
    draftFinding(checkId, '1.0', result, 'Why.', []);

  it('collects the findings every check step saved', () => {
    expect(
      collectFindings({
        extract: { documents: [] },
        'field-check': { findings: [draft('FL-01', 'PASSED')] },
        consistency: { findings: [draft('CD-01', 'INCONSISTENT')] },
      }).map((f) => f.checkId),
    ).toEqual(['FL-01', 'CD-01']);
  });

  it.each([
    [
      'an unknown check',
      {
        findings: [draft('FL-01', 'PASSED')].map((f) => ({
          ...f,
          checkId: 'XX-01',
        })),
      },
    ],
    [
      'a result the check cannot give',
      { findings: [draft('CD-01', 'FAILED')] },
    ],
    [
      'a purpose result on a field check',
      { findings: [draft('FL-01', 'COMPATIBLE')] },
    ],
    [
      'two findings for one check',
      { findings: [draft('FL-01', 'PASSED'), draft('FL-01', 'FAILED')] },
    ],
  ])('refuses %s', (_label, result) => {
    expect(() => collectFindings({ step: result })).toThrow(PipelineError);
  });
});

describe('The flag reason a finding raises (§3.2)', () => {
  it('says which check, its result and why, citing the clause', () => {
    expect(
      reasonText(
        draftFinding(
          'FL-05',
          '1.0',
          'NOT_FOUND',
          'The requester retention period is not stated in the request documents.',
          [],
        ),
      ),
    ).toBe(
      'FL-05 Requester retention period: not found. The requester retention period is not stated in the request documents. (Law Art 18)',
    );
  });
});
