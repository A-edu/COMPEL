import type { FindingResult } from '@prisma/client';
import { type FieldReading, readExtraction } from '../extraction.js';
import {
  type CheckStepResult,
  draftFinding,
  evidenceOf,
} from '../findings.js';
import type { PipelineStep } from '../pipeline-steps.js';
import { FIELD_NAMES, type FieldId } from '../rule-set.js';
import { judge } from './judge.js';

// Purpose compatibility (Sprint 3 spec §7.3, US-10; docs/rule-set.md §4.3).
// One finding, PC-01: the requester's purpose (F-R1) against the purpose the
// data was collected for (F-P2) and its legal basis (F-P3), from the
// extraction only.
// - In code, before any model call: if any of the three is not found or
//   ambiguous, the result is indeterminate, never compatible.
// - Otherwise the model judges compatible, incompatible, or indeterminate (a
//   purpose too general to compare), using the rule set's definitions.
// An incompatible or indeterminate finding sets both purposes side by side in
// its explanation, each with the text it came from; every finding carries the
// three values and their quotes as evidence. PC-01 involves the RoPA entry,
// so the requester never sees it (§3.6).
export const PURPOSE_STEP = 'purpose';
const CHECK_ID = 'PC-01';

const INSTRUCTIONS = `You judge whether a data-sharing request between Saudi government entities asks to use personal data for a purpose compatible with the purpose it was collected for, under the Saudi Personal Data Protection Law (PDPL) Articles 10 and 11(1) and its Implementing Regulation Articles 18 and 21(1). You get the requesting entity's stated purpose (from each of its documents that states one), and the providing entity's collection purpose and collection legal basis from its Record of Processing Activities (RoPA) entry. Values may be in English or Arabic.

Answer with exactly one verdict:
- "compatible": the request purpose is the same as the collection purpose, or directly linked to it, and nothing in the collection legal basis limits the data to a different use. For example, data collected on consent for one named service, requested for another use, is not compatible.
- "incompatible": both purposes are clear and the request purpose is unrelated to the collection purpose, or the collection legal basis rules the new use out.
- "indeterminate": a purpose is too general to compare (for example "government purposes", "any lawful use", "improving services").

Do not decide whether a legal exception (such as PDPL Article 10's public-interest or other-law exceptions) makes an incompatible use lawful: that is for a compliance officer. In the explanation, say how the two purposes relate.`;

const VERDICT: Record<
  'compatible' | 'incompatible' | 'indeterminate',
  FindingResult
> = {
  compatible: 'COMPATIBLE',
  incompatible: 'INCOMPATIBLE',
  indeterminate: 'INDETERMINATE',
};

export const purposeStep: PipelineStep = {
  name: PURPOSE_STEP,
  async run(ctx) {
    const extraction = readExtraction(ctx.results, ctx.documents);
    const requested = extraction.readings('F-R1');
    const purpose = extraction.readings('F-P2');
    const basis = extraction.readings('F-P3');
    const all = [...requested, ...purpose, ...basis];
    const evidence = all.map(evidenceOf);
    const finding = (result: FindingResult, explanation: string) => {
      const draft = draftFinding(
        CHECK_ID,
        ctx.ruleSetVersion,
        result,
        result === 'COMPATIBLE'
          ? explanation
          : `${explanation} ${sideBySide(requested, purpose, basis)}`,
        evidence,
      );
      return { result: { findings: [draft] } satisfies CheckStepResult };
    };

    // Missing or unreadable information is never compatible (§7.3).
    const gaps: string[] = [];
    for (const [field, readings, where] of [
      ['F-R1', requested, 'the request documents'],
      ['F-P2', purpose, 'the RoPA entry'],
      ['F-P3', basis, 'the RoPA entry'],
    ] as const) {
      const gap = gapIn(field, readings, where);
      if (gap) gaps.push(gap);
    }
    if (gaps.length > 0) {
      return finding(
        'INDETERMINATE',
        `${gaps.join(' ')} So the purposes cannot be compared.`,
      );
    }

    const verdicts = await judge(
      ctx,
      INSTRUCTIONS,
      ['compatible', 'incompatible', 'indeterminate'] as const,
      [
        {
          checkId: CHECK_ID,
          task: {
            question:
              'Is the request purpose compatible with the purpose the data was collected for, given its collection legal basis?',
            requestPurposes: found(requested).map((r) => ({
              document: r.documentName,
              value: r.value,
            })),
            collectionPurpose: found(purpose)[0].value,
            collectionLegalBasis: found(basis)[0].value,
          },
        },
      ],
    );
    const { verdict, explanation } = verdicts.get(CHECK_ID)!;
    return finding(VERDICT[verdict], explanation);
  },
};

interface Found {
  documentName: string;
  value: string;
  quote: string;
}

function found(readings: FieldReading[]): Found[] {
  return readings.flatMap((r) =>
    r.value.state === 'found'
      ? [
          {
            documentName: r.documentName,
            value: r.value.value,
            quote: r.value.quote,
          },
        ]
      : [],
  );
}

// Why a field cannot be compared, or null when it can: any document giving it
// as ambiguous, or no document stating it.
function gapIn(
  field: FieldId,
  readings: FieldReading[],
  where: string,
): string | null {
  const name = FIELD_NAMES[field];
  const ambiguous = readings.filter((r) => r.value.state === 'ambiguous');
  if (ambiguous.length > 0) {
    const docs = [...new Set(ambiguous.map((r) => r.documentName))].join(', ');
    return `The ${name.toLowerCase()} in ${docs} could not be read reliably.`;
  }
  if (found(readings).length === 0) {
    return `${where.charAt(0).toUpperCase()}${where.slice(1)} ${
      where === 'the request documents' ? 'do' : 'does'
    } not state the ${name.toLowerCase()}.`;
  }
  return null;
}

// Both purposes, and the legal basis, each with the text it came from.
function sideBySide(
  requested: FieldReading[],
  purpose: FieldReading[],
  basis: FieldReading[],
): string {
  return (
    [
      ['F-R1', requested],
      ['F-P2', purpose],
      ['F-P3', basis],
    ] as const
  )
    .map(([field, readings]) => {
      const values = found(readings);
      return values.length === 0
        ? `${FIELD_NAMES[field]}: not stated.`
        : values
            .map((v) => `${FIELD_NAMES[field]} (${v.documentName}): "${v.quote}"`)
            .join('; ')
            .concat('.');
    })
    .join(' ');
}
