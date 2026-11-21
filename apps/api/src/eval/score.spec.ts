import {
  type ExpectedCase,
  itemsMatch,
  judgeField,
  norm,
  quoteMatches,
  scoreCase,
  summarise,
} from './score.js';

describe('norm (dataset README -> How quotes are compared)', () => {
  it('collapses whitespace and joins a hyphen at a line break', () => {
    expect(norm('  Retention   period:\n 12 months ')).toBe(
      'Retention period: 12 months',
    );
    expect(norm('data-\n  sharing')).toBe('data-sharing');
  });

  it('folds ligatures and presentation forms, and drops bidi controls and tatweel', () => {
    expect(norm('eﬃcient')).toBe('efficient');
    expect(norm('ﻻ')).toBe('لا'); // lam-alef ligature
    expect(norm('‫البيانات‬')).toBe('البيانات');
    expect(norm('البيـــانات')).toBe('البيانات');
  });
});

describe('quoteMatches', () => {
  const sentence = 'Retention period: 12 months from the date of sharing.';

  it('accepts the sentence, part of it, or the sentence with its label', () => {
    expect(quoteMatches(sentence, sentence)).toBe(true);
    expect(quoteMatches('12 months from the date', sentence)).toBe(true);
    expect(quoteMatches(`Section 5. ${sentence}`, sentence)).toBe(true);
    expect(quoteMatches('Retention  period:\n12 months', sentence)).toBe(true);
  });

  it('rejects a made-up, empty or trivially short quote', () => {
    expect(quoteMatches('24 months from the date', sentence)).toBe(false);
    expect(quoteMatches('', sentence)).toBe(false);
    expect(quoteMatches(undefined, sentence)).toBe(false);
    expect(quoteMatches('12', sentence)).toBe(false);
  });
});

describe('itemsMatch', () => {
  it('compares category lists as sets, ignoring case and a final full stop', () => {
    expect(
      itemsMatch(['Tax returns', 'payments.'], ['payments', 'tax returns']),
    ).toBe(true);
    expect(itemsMatch(['tax returns'], ['payments', 'tax returns'])).toBe(
      false,
    );
    expect(itemsMatch(undefined, ['payments'])).toBe(false);
  });
});

describe('judgeField', () => {
  const found = {
    state: 'found' as const,
    quote: 'Retention period: 12 months.',
  };

  it('needs the state, and for a found field the quote and items', () => {
    expect(judgeField(undefined, found)).toBe('missing');
    expect(judgeField({ state: 'not_found' }, found)).toBe('wrong_state');
    expect(
      judgeField(
        { state: 'found', quote: 'Retention period: 6 months.' },
        found,
      ),
    ).toBe('quote_mismatch');
    expect(judgeField({ state: 'found', quote: '12 months' }, found)).toBe(
      'correct',
    );
    expect(
      judgeField(
        { state: 'found', quote: 'a, b', items: ['a'] },
        { state: 'found', quote: 'a, b', items: ['a', 'b'] },
      ),
    ).toBe('items_mismatch');
  });

  it('counts a found field the dataset says is missing or ambiguous as wrongly found', () => {
    expect(
      judgeField({ state: 'found', quote: 'x y z w' }, { state: 'not_found' }),
    ).toBe('wrongly_found');
    expect(
      judgeField({ state: 'found', quote: 'x y z w' }, { state: 'ambiguous' }),
    ).toBe('wrongly_found');
    expect(judgeField({ state: 'ambiguous' }, { state: 'ambiguous' })).toBe(
      'correct',
    );
  });
});

describe('scoreCase and summarise', () => {
  const expected: ExpectedCase = {
    case: 'C99',
    rule_set_version: '1.0',
    position: 'ENDORSED',
    objection: null,
    documents: [
      {
        file: 'request-form.pdf',
        kind: 'REQUEST_FORM',
        language: 'en',
        fields: {
          'F-R1': {
            state: 'found',
            quote: 'Purpose: auditing supplier tax compliance.',
          },
          'F-R5': { state: 'not_found' },
        },
      },
    ],
    checks: { 'FL-01': 'passed', 'FL-05': 'not_found' },
    outcome: 'FLAGGED',
  };

  it('reports per-field accuracy, wrongly found fields and the outcome', () => {
    const score = scoreCase(expected, {
      extractions: {
        'request-form.pdf': {
          'F-R1': { state: 'found', quote: 'auditing supplier tax compliance' },
          'F-R5': { state: 'found', quote: 'Retention: forever' },
        },
      },
      checks: { 'FL-01': 'passed', 'FL-05': 'passed' },
      outcome: 'APPROVED',
    });
    const summary = summarise([score]);

    expect(summary.fieldAccuracy).toEqual({ correct: 1, total: 2 });
    expect(summary.perField).toEqual({
      'F-R1': { correct: 1, total: 1 },
      'F-R5': { correct: 0, total: 1 },
    });
    expect(summary.wronglyFound).toBe(1);
    expect(summary.checkAccuracy).toEqual({ correct: 1, total: 2 });
    expect(summary.outcomeMatches).toEqual({ correct: 0, total: 1 });
  });

  it('reports every field missing when the pipeline saved nothing', () => {
    const summary = summarise([
      scoreCase(expected, { extractions: {}, checks: {} }),
    ]);
    expect(summary.missingFields).toBe(2);
    expect(summary.fieldAccuracy).toEqual({ correct: 0, total: 2 });
    expect(summary.outcomeMatches).toEqual({ correct: 0, total: 1 });
  });
});
