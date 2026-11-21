// The approved rule set in code (docs/rule-set.md, Sprint 3 spec §3.4). The
// one place the pipeline reads fields, checks, clauses and which checks the
// requester may see. When docs/rule-set.md changes, this file changes with it
// and RULE_SET_VERSION goes up.

export const RULE_SET_VERSION = '1.0';

// docs/rule-set.md §3.
export const REQUESTER_FIELDS = [
  'F-R1',
  'F-R2',
  'F-R3',
  'F-R4',
  'F-R5',
  'F-R6',
] as const;
export const PROVIDER_FIELDS = [
  'F-P1',
  'F-P2',
  'F-P3',
  'F-P4',
  'F-P5',
  'F-P6',
  'F-P7',
  'F-P8',
] as const;
export type RequesterFieldId = (typeof REQUESTER_FIELDS)[number];
export type ProviderFieldId = (typeof PROVIDER_FIELDS)[number];
export type FieldId = RequesterFieldId | ProviderFieldId;

export const FIELD_NAMES: Record<FieldId, string> = {
  'F-R1': 'Request purpose',
  'F-R2': 'Request legal basis',
  'F-R3': 'Public interest and mandate',
  'F-R4': 'Requested data categories',
  'F-R5': 'Requester retention period',
  'F-R6': 'Parties',
  'F-P1': 'Controller and contact details',
  'F-P2': 'Collection purpose',
  'F-P3': 'Collection legal basis',
  'F-P4': 'Held data categories',
  'F-P5': 'Data subject categories',
  'F-P6': 'Recipients',
  'F-P7': 'Transfer outside the Kingdom',
  'F-P8': 'Retention period',
};

// docs/rule-set.md §3, "What to capture": what the extraction (§6) reads for
// each field.
export const FIELD_CAPTURE: Record<FieldId, string> = {
  'F-R1': 'What the requester will use the data for',
  'F-R2':
    "The ground relied on for the disclosure (e.g. a public entity's request for a public interest, or another law)",
  'F-R3':
    'The public interest the request serves, and the law or decision that gives the requester that function',
  'F-R4': 'The types of personal data asked for',
  'F-R5':
    'How long the requester will keep the data, or the event that ends retention',
  'F-R6': 'The requesting entity and providing entity, as named in the document',
  'F-P1': "The controller's name and how to contact it",
  'F-P2': 'The purpose the data was collected and processed for',
  'F-P3': 'The legal basis the data was collected on',
  'F-P4': 'The categories of personal data held',
  'F-P5': 'The categories of people the data is about',
  'F-P6':
    'The entities, or categories of entities, the data has been or will be disclosed to',
  'F-P7':
    'Whether the data is or will be transferred or disclosed outside the Kingdom, and if so its basis and recipients',
  'F-P8': 'How long the data is kept, per category where given',
};

// Fields whose value is a list (data categories); found values also carry
// `items`, used by CD-03 and CD-04 (extraction.ts, the dataset README).
export const LIST_FIELDS: readonly FieldId[] = ['F-R4', 'F-P4'];

export function isRequesterField(field: FieldId): field is RequesterFieldId {
  return (REQUESTER_FIELDS as readonly string[]).includes(field);
}

export type CheckKind = 'FIELD' | 'CONSISTENCY' | 'PURPOSE';

export interface CheckDefinition {
  id: string;
  kind: CheckKind;
  name: string;
  citation: string;
  // Involves only the requester's own documents, so it appears in the
  // reduced report (§3.6).
  requesterVisible: boolean;
  // The fields it reads.
  fields: FieldId[];
  // Field-level checks: what passing and failing mean, given to the model.
  passesWhen?: string;
  failsWhen?: string;
  // Field-level checks that pass whenever the field is stated (no judgement).
  passesWhenStated?: boolean;
}

// docs/rule-set.md §4.1.
const FIELD_CHECKS: CheckDefinition[] = [
  {
    id: 'FL-01',
    kind: 'FIELD',
    name: 'Request purpose',
    citation: 'IR Art 21(1)',
    requesterVisible: true,
    fields: ['F-R1'],
    passesWhen:
      'A specific purpose is stated: a defined activity, not a general aim.',
    failsWhen:
      'The purpose is stated only in general terms (e.g. "government purposes", "any lawful use").',
  },
  {
    id: 'FL-02',
    kind: 'FIELD',
    name: 'Public interest and mandate',
    citation: 'IR Art 21(2)',
    requesterVisible: true,
    fields: ['F-R3'],
    passesWhen:
      "The public interest is stated and a specific law, regulation or decision is named as the requester's mandate.",
    failsWhen:
      'The interest is stated but no mandate is named, or the mandate named is unrelated to the interest.',
  },
  {
    id: 'FL-03',
    kind: 'FIELD',
    name: 'Request legal basis',
    citation: 'Law Art 15; IR Art 16',
    requesterVisible: true,
    fields: ['F-R2'],
    passesWhen:
      'The basis is one of the disclosure cases in PDPL Article 15 that a public entity can rely on (for example a public entity requesting data for a public interest or security purpose, or to implement another law).',
    failsWhen:
      'The basis is not a PDPL Article 15 case, or it is legitimate interest (not available to a public entity under Implementing Regulation Article 16).',
  },
  {
    id: 'FL-04',
    kind: 'FIELD',
    name: 'Requested data categories',
    citation: 'IR Art 20(3)(b)',
    requesterVisible: true,
    fields: ['F-R4'],
    passesWhen: 'The types of data are listed specifically.',
    failsWhen:
      'Only a vague description is given ("all relevant data", "the full record").',
  },
  {
    id: 'FL-05',
    kind: 'FIELD',
    name: 'Requester retention period',
    citation: 'Law Art 18',
    requesterVisible: true,
    fields: ['F-R5'],
    passesWhen: 'A definite period, or a defined event that ends retention.',
    failsWhen: '"Indefinitely", "as long as needed", or similar.',
  },
  {
    id: 'FL-06',
    kind: 'FIELD',
    name: 'Controller and contact details',
    citation: 'Law Art 31(1); IR Art 33(5)(a)',
    requesterVisible: false,
    fields: ['F-P1'],
    passesWhen: 'Both a controller name and a contact detail are stated.',
    failsWhen: 'The name or the contact detail is missing.',
  },
  {
    id: 'FL-07',
    kind: 'FIELD',
    name: 'Collection purpose',
    citation: 'Law Art 31(2); IR Art 33(5)(c)',
    requesterVisible: false,
    fields: ['F-P2'],
    passesWhen: 'A specific purpose is stated.',
    failsWhen: 'The purpose is stated only in general terms.',
  },
  {
    id: 'FL-08',
    kind: 'FIELD',
    name: 'Held data categories',
    citation: 'IR Art 33(5)(d)',
    requesterVisible: false,
    fields: ['F-P4'],
    passesWhenStated: true,
  },
  {
    id: 'FL-09',
    kind: 'FIELD',
    name: 'Data subject categories',
    citation: 'Law Art 31(3); IR Art 33(5)(d)',
    requesterVisible: false,
    fields: ['F-P5'],
    passesWhenStated: true,
  },
  {
    id: 'FL-10',
    kind: 'FIELD',
    name: 'Recipients',
    citation: 'Law Art 31(4); IR Art 33(5)(f); IR Art 20(6)',
    requesterVisible: false,
    fields: ['F-P6'],
    passesWhen:
      'Recipients are stated and include the requesting entity, or a category it clearly belongs to.',
    failsWhen:
      'Recipients are stated but the requesting entity is not among them, nor in a category it clearly belongs to.',
  },
  {
    id: 'FL-11',
    kind: 'FIELD',
    name: 'Transfer outside the Kingdom',
    citation: 'Law Art 31(5); IR Art 33(5)(g)',
    requesterVisible: false,
    fields: ['F-P7'],
    passesWhen:
      'The entry says whether there is a transfer outside the Kingdom; if there is, it gives the basis and the recipients.',
    failsWhen:
      'It says there is a transfer but gives no basis or no recipients.',
  },
  {
    id: 'FL-12',
    kind: 'FIELD',
    name: 'Retention period',
    citation: 'Law Art 31(6); IR Art 33(5)(e)',
    requesterVisible: false,
    fields: ['F-P8'],
    passesWhen: 'A period, or the criteria that set it, is stated.',
    failsWhen: '"Indefinitely" or similar.',
  },
];

// docs/rule-set.md §4.2.
const CONSISTENCY_CHECKS: CheckDefinition[] = [
  {
    id: 'CD-01',
    kind: 'CONSISTENCY',
    name: 'Parties',
    citation: 'IR Art 33(3)',
    requesterVisible: false,
    fields: ['F-R6', 'F-P1'],
  },
  {
    id: 'CD-02',
    kind: 'CONSISTENCY',
    name: 'Request purpose across documents',
    citation: 'IR Art 21(1)',
    requesterVisible: true,
    fields: ['F-R1'],
  },
  {
    id: 'CD-03',
    kind: 'CONSISTENCY',
    name: 'Requested data categories across documents',
    citation: 'IR Art 20(3)(b)',
    requesterVisible: true,
    fields: ['F-R4'],
  },
  {
    id: 'CD-04',
    kind: 'CONSISTENCY',
    name: 'Requested categories held by the provider',
    citation: 'IR Art 33(3); IR Art 33(5)(d)',
    requesterVisible: false,
    fields: ['F-R4', 'F-P4'],
  },
  {
    id: 'CD-05',
    kind: 'CONSISTENCY',
    name: 'Requester retention period across documents',
    citation: 'Law Art 18',
    requesterVisible: true,
    fields: ['F-R5'],
  },
];

// docs/rule-set.md §4.3, built in §7.3.
const PURPOSE_CHECKS: CheckDefinition[] = [
  {
    id: 'PC-01',
    kind: 'PURPOSE',
    name: 'Purpose compatibility',
    citation: 'Law Art 10; Law Art 11(1); IR Art 18; IR Art 21(1)',
    requesterVisible: false,
    fields: ['F-R1', 'F-P2', 'F-P3'],
  },
];

export const CHECKS: readonly CheckDefinition[] = [
  ...FIELD_CHECKS,
  ...CONSISTENCY_CHECKS,
  ...PURPOSE_CHECKS,
];

export function checkById(id: string): CheckDefinition {
  const check = CHECKS.find((c) => c.id === id);
  if (!check) throw new Error(`Unknown check "${id}".`);
  return check;
}

export function checksOfKind(kind: CheckKind): CheckDefinition[] {
  return CHECKS.filter((c) => c.kind === kind);
}
