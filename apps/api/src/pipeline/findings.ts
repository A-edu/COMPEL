import type { DocumentKind, FindingResult } from '@prisma/client';
import type { FieldReading } from './extraction.js';
import { checkById, type FieldId } from './rule-set.js';

// What a check step saves for each check (Sprint 3 spec §3.2): the check,
// its result, the clause and rule-set version it used, and the documents and
// extracted values it rests on. A check step saves `{ findings: [...] }` as
// its result; the outcome (§8) collects them from every step and stores them
// as Finding records when the run completes.

export interface FindingEvidence {
  documentId: string;
  documentName: string;
  documentKind: DocumentKind;
  field: FieldId;
  state: 'found' | 'not_found' | 'ambiguous';
  value?: string;
  quote?: string;
}

export interface FindingDraft {
  checkId: string;
  checkName: string;
  result: FindingResult;
  citation: string;
  ruleSetVersion: string;
  requesterVisible: boolean;
  // Why, in one or two sentences. Shown in the flag reason and the report.
  explanation: string;
  evidence: FindingEvidence[];
}

export interface CheckStepResult {
  findings: FindingDraft[];
}

// The results that count as passing under the outcome rule (§2.4).
export const PASSING: readonly FindingResult[] = ['PASSED', 'COMPATIBLE'];

export function evidenceOf(reading: FieldReading): FindingEvidence {
  const { value } = reading;
  return {
    documentId: reading.documentId,
    documentName: reading.documentName,
    documentKind: reading.kind,
    field: reading.field,
    state: value.state,
    ...(value.state === 'found'
      ? { value: value.value, quote: value.quote }
      : {}),
  };
}

// A finding for `checkId`, with its name, clause and visibility from the rule
// set and the version the run recorded.
export function draftFinding(
  checkId: string,
  ruleSetVersion: string,
  result: FindingResult,
  explanation: string,
  evidence: FindingEvidence[],
): FindingDraft {
  const check = checkById(checkId);
  return {
    checkId,
    checkName: check.name,
    result,
    citation: check.citation,
    ruleSetVersion,
    requesterVisible: check.requesterVisible,
    explanation,
    evidence,
  };
}
