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
} from '../rule-set.js';
import { judge, type JudgeItem } from './judge.js';

// Cross-document consistency check (Sprint 3 spec §7.2, US-09;
// docs/rule-set.md §4.2). Results are passed or inconsistent. In code, before
// any model call:
// - an ambiguous value that takes part in a comparison gives inconsistent: it
//   cannot be confirmed to agree (team decision, 2026-11-21);
// - a field a supporting document states but the request form does not gives
//   inconsistent; the reverse does not (D4). CD-04 leaves this to CD-03;
// - with fewer than two values to compare, the check passes: there is nothing
//   to disagree with, and the field-level check flags a missing value
//   (dataset README, point 3).
// Otherwise the model says whether the stated values agree. An inconsistent
// finding names the documents and quotes each value.
//
// Checks on the requester's documents alone (CD-02, CD-03, CD-05) and checks
// involving the RoPA entry (CD-01, CD-04) go to the model in separate calls,
// so nothing from the RoPA entry can reach an explanation the requester will
// see in its reduced report (§3.6).
export const CONSISTENCY_STEP = 'consistency';

const INSTRUCTIONS = `You compare the same information across the documents of a data-sharing request between Saudi government entities: the requesting entity's request form and supporting documents, and the providing entity's Record of Processing Activities (RoPA) entry. Values may be in English or Arabic; the same thing said in two languages, or in different words with the same meaning, is consistent. For each check, answer "consistent" if the values agree as the check's question asks, or "inconsistent" if they do not, and say which values disagree. Something a document does not mention is a disagreement only where the check's question says so. The verdict must match the explanation: if the values agree, answer "consistent".`;

type Decided = [FindingResult, string];

export const consistencyStep: PipelineStep = {
  name: CONSISTENCY_STEP,
  async run(ctx) {
    const extraction = readExtraction(ctx.results, ctx.documents);
    const checks = checksOfKind('CONSISTENCY');
    const findings = new Map<string, FindingDraft>();
    const pending: {
      check: CheckDefinition;
      readings: FieldReading[];
      item: JudgeItem;
    }[] = [];

    for (const check of checks) {
      const readings = check.fields.flatMap((f) => extraction.readings(f));
      const evidence = readings.map(evidenceOf);
      const plan = planCheck(ctx, check, readings);
      if ('decided' in plan) {
        findings.set(
          check.id,
          draftFinding(check.id, ctx.ruleSetVersion, ...plan.decided, evidence),
        );
      } else {
        pending.push({ check, readings, item: plan.item });
      }
    }

    const requesterSide = pending.filter((p) => p.check.requesterVisible);
    const crossSide = pending.filter((p) => !p.check.requesterVisible);
    for (const side of [requesterSide, crossSide]) {
      const verdicts = await judge(
        ctx,
        INSTRUCTIONS,
        ['consistent', 'inconsistent'] as const,
        side.map((p) => p.item),
      );
      for (const { check, readings } of side) {
        const { verdict, explanation } = verdicts.get(check.id)!;
        const found = readings.filter((r) => r.value.state === 'found');
        findings.set(
          check.id,
          draftFinding(
            check.id,
            ctx.ruleSetVersion,
            verdict === 'consistent' ? 'PASSED' : 'INCONSISTENT',
            verdict === 'consistent'
              ? explanation
              : `${explanation} ${quoted(found)}`,
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

function planCheck(
  ctx: PipelineContext,
  check: CheckDefinition,
  readings: FieldReading[],
): { decided: Decided } | { item: JudgeItem } {
  const fieldName = check.fields
    .map((f) => FIELD_NAMES[f].toLowerCase())
    .join(' and ');
  const found = readings.filter((r) => r.value.state === 'found');
  const ambiguous = readings.filter((r) => r.value.state === 'ambiguous');
  const stated = found.length + ambiguous.length;
  // Values on both sides, or a registered name to compare against, count as
  // a comparison even with one stated value.
  const registered = check.id === 'CD-01' ? registeredParties(ctx) : null;
  const comparing = stated >= 2 || (registered !== null && stated >= 1);

  if (ambiguous.length > 0 && comparing) {
    return {
      decided: [
        'INCONSISTENT',
        `The ${fieldName} in ${names(ambiguous)} could not be read reliably, so it cannot be confirmed to agree with the other documents.`,
      ],
    };
  }

  // CD-04 compares the request with the RoPA entry; a category missing from
  // the request form is CD-03's finding, not a second one here.
  const fieldsBySide = check.id === 'CD-04' ? [] : check.fields;
  for (const field of fieldsBySide) {
    const missing = missingFromForm(readings.filter((r) => r.field === field));
    if (missing) {
      return {
        decided: [
          'INCONSISTENT',
          `The ${FIELD_NAMES[field].toLowerCase()} is stated in ${names(missing)} but missing from the request form. ${quoted(missing)}`,
        ],
      };
    }
  }

  if (!comparing || found.length === 0) {
    return {
      decided: [
        'PASSED',
        stated === 0
          ? `No document states the ${fieldName}, so there is nothing to compare.`
          : `Only one document states the ${fieldName}, so there is nothing to compare.`,
      ],
    };
  }

  // CD-04 compares two sides: both must be stated.
  if (check.id === 'CD-04') {
    const requested = found.filter((r) => r.field === 'F-R4');
    const held = found.filter((r) => r.field === 'F-P4');
    if (requested.length === 0 || held.length === 0) {
      return {
        decided: [
          'PASSED',
          `The ${fieldName} are not both stated, so there is nothing to compare.`,
        ],
      };
    }
  }

  return {
    item: {
      checkId: check.id,
      task: {
        question: QUESTIONS[check.id],
        ...registered,
        values: found.map((r) => ({
          document: r.documentName,
          documentType: KIND_LABEL[r.kind],
          field: FIELD_NAMES[r.field],
          value: r.value.state === 'found' ? r.value.value : null,
          ...(r.value.state === 'found' && r.value.items
            ? { items: r.value.items }
            : {}),
        })),
      },
    },
  };
}

const QUESTIONS: Record<string, string> = {
  // The RoPA entry states only its controller. Asked whether "every
  // document" named both parties, the model counted the requesting entity's
  // absence from the RoPA as a disagreement (evaluation case C03).
  'CD-01':
    'The request form and any supporting documents each name two parties: the requesting entity (the one the request is made by) and the providing entity (the one it is made to). The RoPA entry names only its controller, with contact details. Work it out in order: 1) take the requesting and providing entity from each request document; 2) they must be the same in every request document, and match the registered parties if given; 3) the RoPA controller must be that providing entity; a controller that is the requesting entity, or any other entity, is inconsistent. The RoPA entry is not expected to name the requesting entity, and contact details or an office name after the controller do not matter.',
  'CD-02': 'Do all of these documents state the same purpose for the request?',
  'CD-03':
    'Do all of these documents list the same requested data categories? Every category in one list must be in the other.',
  'CD-04':
    'Is every requested data category among the categories the RoPA entry records as held? A requested category that is not held makes this inconsistent.',
  'CD-05':
    'Do all of these documents state the same retention period for the requested data?',
};

const KIND_LABEL = {
  REQUEST_FORM: 'request form',
  SUPPORTING: 'supporting document',
  ROPA: 'RoPA entry',
} as const;

// The parties the request was registered between, when the run knows them
// (always in the app; the evaluation has none).
function registeredParties(
  ctx: PipelineContext,
): Record<string, string> | null {
  const { requestingEntity, providingEntity } = ctx.request;
  if (!requestingEntity || !providingEntity) return null;
  return {
    registeredRequestingEntity: requestingEntity,
    registeredProvidingEntity: providingEntity,
  };
}

// Supporting documents that state a requester field the request form does
// not (D4). Null when there are none, or when the field is not a requester
// field.
function missingFromForm(readings: FieldReading[]): FieldReading[] | null {
  const form = readings.filter((r) => r.kind === 'REQUEST_FORM');
  const supporting = readings.filter(
    (r) => r.kind === 'SUPPORTING' && r.value.state === 'found',
  );
  if (supporting.length === 0) return null;
  const formStates = form.some((r) => r.value.state !== 'not_found');
  return formStates ? null : supporting;
}

function names(readings: FieldReading[]): string {
  return [...new Set(readings.map((r) => r.documentName))].join(', ');
}

function quoted(readings: FieldReading[]): string {
  return readings
    .flatMap((r) =>
      r.value.state === 'found'
        ? [`${r.documentName}: "${r.value.quote}"`]
        : [],
    )
    .join('; ')
    .concat(readings.some((r) => r.value.state === 'found') ? '.' : '');
}
