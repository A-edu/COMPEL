// Scores one evaluation run against the labelled dataset (Sprint 3 spec
// §5.4, §5.5), following the conventions in apps/api/eval/dataset/README.md.
// Pure functions: run-eval.ts feeds them, and score.spec.ts tests them.

export type FieldState = 'found' | 'not_found' | 'ambiguous';

export interface ExpectedField {
  state: FieldState;
  quote?: string;
  items?: string[];
}

export interface ExpectedDocument {
  file: string;
  kind: string;
  language: string;
  fields: Record<string, ExpectedField>;
}

export interface ExpectedCase {
  case: string;
  rule_set_version: string;
  position: 'ENDORSED' | 'OBJECTED';
  objection: string | null;
  documents: ExpectedDocument[];
  checks: Record<string, string>;
  outcome: 'APPROVED' | 'FLAGGED';
}

// What the pipeline reported for one field of one document.
export interface ActualField {
  state: FieldState;
  value?: string;
  quote?: string;
  items?: string[];
}

// The pipeline's results for one case, in the dataset's terms. Documents are
// keyed by file name (the eval uses it as the document ID).
export interface ActualCase {
  extractions: Record<string, Record<string, ActualField>>;
  checks: Record<string, string>;
  outcome?: 'APPROVED' | 'FLAGGED';
  error?: string;
}

// The README's norm(): NFKC, no bidi controls or tatweel, a hyphen at a line
// break joined, whitespace collapsed. Mirrors build_dataset.py.
const BIDI_AND_TATWEEL = /[‎‏‪-‮⁦-⁩ـ]/g;

export function norm(text: string): string {
  return text
    .normalize('NFKC')
    .replace(BIDI_AND_TATWEEL, '')
    .replace(/-\n\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// A quote shorter than this supports nothing.
const MIN_QUOTE_LENGTH = 4;

// Quotes are compared strictly, both ways after norm(): the extractor's quote
// may be part of the expected sentence, or the sentence plus its label.
export function quoteMatches(
  actual: string | undefined,
  expected: string,
): boolean {
  if (!actual) return false;
  const a = norm(actual);
  const e = norm(expected);
  return a.length >= MIN_QUOTE_LENGTH && (e.includes(a) || a.includes(e));
}

// Data categories are compared by their item lists, ignoring case and a
// trailing full stop.
export function itemsMatch(
  actual: string[] | undefined,
  expected: string[],
): boolean {
  if (!actual) return false;
  const key = (item: string) =>
    norm(item)
      .replace(/[.。]$/, '')
      .toLocaleLowerCase();
  const a = new Set(actual.map(key));
  const e = new Set(expected.map(key));
  return a.size === e.size && [...e].every((item) => a.has(item));
}

export type FieldVerdict =
  | 'correct'
  | 'missing' // the pipeline said nothing about this field
  | 'wrong_state'
  | 'wrongly_found' // found, but the dataset says not found or ambiguous
  | 'quote_mismatch'
  | 'items_mismatch';

export function judgeField(
  actual: ActualField | undefined,
  expected: ExpectedField,
): FieldVerdict {
  if (!actual) return 'missing';
  if (actual.state !== expected.state) {
    return actual.state === 'found' ? 'wrongly_found' : 'wrong_state';
  }
  if (expected.state !== 'found') return 'correct';
  if (!quoteMatches(actual.quote, expected.quote ?? ''))
    return 'quote_mismatch';
  if (expected.items && !itemsMatch(actual.items, expected.items)) {
    return 'items_mismatch';
  }
  return 'correct';
}

export interface Tally {
  correct: number;
  total: number;
}

export interface CaseScore {
  case: string;
  fields: { document: string; field: string; verdict: FieldVerdict }[];
  checks: { check: string; expected: string; actual?: string }[];
  outcome: { expected: string; actual?: string; matches: boolean };
  error?: string;
}

export interface EvalSummary {
  cases: number;
  fieldAccuracy: Tally;
  perField: Record<string, Tally>;
  wronglyFound: number;
  quoteMismatches: number;
  missingFields: number;
  checkAccuracy: Tally;
  outcomeMatches: Tally;
}

export function scoreCase(
  expected: ExpectedCase,
  actual: ActualCase,
): CaseScore {
  const fields = expected.documents.flatMap((doc) =>
    Object.entries(doc.fields).map(([field, want]) => ({
      document: doc.file,
      field,
      verdict: judgeField(actual.extractions[doc.file]?.[field], want),
    })),
  );
  const checks = Object.entries(expected.checks).map(([check, want]) => ({
    check,
    expected: want,
    actual: actual.checks[check],
  }));
  return {
    case: expected.case,
    fields,
    checks,
    outcome: {
      expected: expected.outcome,
      actual: actual.outcome,
      matches: actual.outcome === expected.outcome,
    },
    ...(actual.error ? { error: actual.error } : {}),
  };
}

export function summarise(scores: CaseScore[]): EvalSummary {
  const tally = (): Tally => ({ correct: 0, total: 0 });
  const summary: EvalSummary = {
    cases: scores.length,
    fieldAccuracy: tally(),
    perField: {},
    wronglyFound: 0,
    quoteMismatches: 0,
    missingFields: 0,
    checkAccuracy: tally(),
    outcomeMatches: tally(),
  };
  for (const score of scores) {
    for (const { field, verdict } of score.fields) {
      const per = (summary.perField[field] ??= tally());
      const ok = verdict === 'correct';
      per.total++;
      summary.fieldAccuracy.total++;
      if (ok) {
        per.correct++;
        summary.fieldAccuracy.correct++;
      }
      if (verdict === 'wrongly_found') summary.wronglyFound++;
      if (verdict === 'quote_mismatch') summary.quoteMismatches++;
      if (verdict === 'missing') summary.missingFields++;
    }
    for (const check of score.checks) {
      summary.checkAccuracy.total++;
      if (check.actual === check.expected) summary.checkAccuracy.correct++;
    }
    summary.outcomeMatches.total++;
    if (score.outcome.matches) summary.outcomeMatches.correct++;
  }
  summary.perField = Object.fromEntries(
    Object.entries(summary.perField).sort(([a], [b]) => a.localeCompare(b)),
  );
  return summary;
}

export function percent({ correct, total }: Tally): string {
  return total === 0 ? 'n/a' : `${((100 * correct) / total).toFixed(1)}%`;
}
