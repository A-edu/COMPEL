import type { FindingResult } from '@prisma/client';
import { type FieldReading, readExtraction } from '../extraction.js';
import {
  type CheckStepResult,
  draftFinding,
  evidenceOf,
  type FindingDraft,
} from '../findings.js';
import type { PipelineContext, PipelineStep } from '../pipeline-steps.js';
import {
  type CheckDefinition,
  checksOfKind,
  FIELD_NAMES,
  isRequesterField,
} from '../rule-set.js';
import { judge, type JudgeItem } from './judge.js';

// Field-level compliance check (Sprint 3 spec §7.1, US-08; docs/rule-set.md
// §4.1). One finding per check per request:
// - no document states the field: not found;
// - any document gives it as ambiguous: ambiguous, never passed;
// - FL-08 and FL-09 pass whenever the field is stated;
// - otherwise the model judges every stated value against the check's
//   "passes when" and "fails when", and the check fails if any value fails
//   (a requester field may be stated in several documents).
// F-P3 is extract-only and has no field-level check (D3).
//
// The requester's checks and the RoPA's checks go to the model in separate
// calls, so nothing from the RoPA entry can reach an explanation the
// requester will see in its reduced report (§3.6).
export const FIELD_CHECK_STEP = 'field-check';

const INSTRUCTIONS = `You check fields of a data-sharing request between Saudi government entities against the Saudi Personal Data Protection Law (PDPL) and its Implementing Regulation. For each check you get the field, what it means to pass and to fail, and the value stated in each document. Answer "passed" only if every stated value meets the pass condition; answer "failed" if any value meets the fail condition or does not meet the pass condition. Values may be in English or Arabic.`;

export const fieldCheckStep: PipelineStep = {
  name: FIELD_CHECK_STEP,
  async run(ctx) {
    const extraction = readExtraction(ctx.results, ctx.documents);
    const checks = checksOfKind('FIELD');

    const findings = new Map<string, FindingDraft>();
    const toJudge: { check: CheckDefinition; readings: FieldReading[] }[] = [];

    for (const check of checks) {
      const field = check.fields[0];
      const readings = extraction.readings(field);
      const found = readings.filter((r) => r.value.state === 'found');
      const ambiguous = readings.filter((r) => r.value.state === 'ambiguous');
      const evidence = readings.map(evidenceOf);
      const where = isRequesterField(field)
        ? 'the request documents'
        : 'the RoPA entry';
      const name = FIELD_NAMES[field].toLowerCase();

      let decided: [FindingResult, string] | undefined;
      if (ambiguous.length > 0) {
        decided = [
          'AMBIGUOUS',
          `The ${name} could not be read reliably from ${names(ambiguous)}.`,
        ];
      } else if (found.length === 0) {
        decided = ['NOT_FOUND', `The ${name} is not stated in ${where}.`];
      } else if (check.passesWhenStated) {
        decided = ['PASSED', `The ${name} is stated in ${where}.`];
      }

      if (decided) {
        findings.set(
          check.id,
          draftFinding(check.id, ctx.ruleSetVersion, ...decided, evidence),
        );
      } else {
        toJudge.push({ check, readings: found });
      }
    }

    const requester = requesterReference(ctx, extraction.readings('F-R6'));
    const requesterSide = toJudge.filter((j) => j.check.requesterVisible);
    const providerSide = toJudge.filter((j) => !j.check.requesterVisible);
    for (const side of [requesterSide, providerSide]) {
      const verdicts = await judge(
        ctx,
        INSTRUCTIONS,
        ['passed', 'failed'] as const,
        side.map(({ check, readings }) => itemFor(check, readings, requester)),
      );
      for (const { check, readings } of side) {
        const { verdict, explanation } = verdicts.get(check.id)!;
        findings.set(
          check.id,
          draftFinding(
            check.id,
            ctx.ruleSetVersion,
            verdict === 'passed' ? 'PASSED' : 'FAILED',
            explanation,
            readings.map(evidenceOf),
          ),
        );
      }
    }

    const result: CheckStepResult = {
      findings: checks.map((check) => findings.get(check.id)!),
    };
    return { result };
  },
};

// Who the requesting entity is, for FL-10: its registered name, or in the
// evaluation (which has none) the parties the request documents state.
function requesterReference(
  ctx: PipelineContext,
  parties: FieldReading[],
): Record<string, unknown> {
  if (ctx.request.requestingEntity) {
    return { requestingEntity: ctx.request.requestingEntity };
  }
  const stated = parties.flatMap((r) =>
    r.value.state === 'found' ? [r.value.value] : [],
  );
  return stated.length > 0
    ? {
        partiesStatedInTheRequest: stated,
        requestingEntityIs:
          'the entity the request is made by, not the one it is made to',
      }
    : {};
}

// FL-10 is about who the recipients are. The model read conditions attached
// to a recipient category ("where a law requires disclosure", "to check their
// tax status") as something the request had to prove, and failed requests
// whose requesting entity plainly belongs to the category (evaluation cases
// C02, C04 and C10). Whether the request's purpose fits is PC-01's question.
const RECIPIENTS_NOTE =
  'Judge only who the recipients are, not when or why they receive data. The requesting entity belongs to a category when it is the kind of entity the category names; every party to a request is a Saudi government entity, so it belongs to "government entities". A condition or purpose attached to a category, such as "where a law requires disclosure" or "to check their tax status", is not part of this check: the request does not have to show it is met. Whether the purpose fits is assessed by a separate check.';

function itemFor(
  check: CheckDefinition,
  readings: FieldReading[],
  requester: Record<string, unknown>,
): JudgeItem {
  const field = check.fields[0];
  return {
    checkId: check.id,
    task: {
      field: FIELD_NAMES[field],
      passesWhen: check.passesWhen,
      failsWhen: check.failsWhen,
      // FL-10 asks whether the requesting entity is among the recipients.
      ...(check.id === 'FL-10' ? { ...requester, note: RECIPIENTS_NOTE } : {}),
      values: readings.map((r) => ({
        document: r.documentName,
        value: r.value.state === 'found' ? r.value.value : null,
      })),
    },
  };
}

function names(readings: FieldReading[]): string {
  return readings.map((r) => r.documentName).join(', ');
}
