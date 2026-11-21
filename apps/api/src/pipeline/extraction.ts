import type { DocumentKind } from '@prisma/client';
import { PipelineError } from './pipeline-error.js';
import { type FieldId, PROVIDER_FIELDS, REQUESTER_FIELDS } from './rule-set.js';

// The contract between extraction (§6) and the checks (§7). The extraction
// step saves an ExtractionResult as ctx.results[EXTRACT_STEP]; every check
// reads it through readExtraction() and never reads a document again (§3.3,
// US-07).
export const EXTRACT_STEP = 'extract';

// One field of one document (Sprint 3 spec §3.3).
// - found: the value and the exact text it came from, confirmed to appear in
//   the document. Data categories (F-R4, F-P4) also carry `items`.
// - not_found: the document does not state it.
// - ambiguous: it could only come from an unreadable page (scanned, a DOCX,
//   too large), or the document states it in conflicting ways.
export type ExtractedField =
  | { state: 'found'; value: string; quote: string; items?: string[] }
  | { state: 'not_found' }
  | { state: 'ambiguous'; note?: string };

export interface DocumentExtraction {
  documentId: string;
  kind: DocumentKind;
  // Requester documents carry F-R1–F-R6, the RoPA entry F-P1–F-P8. A field
  // left out is read as not found.
  fields: Partial<Record<FieldId, ExtractedField>>;
  // When this document was read (ISO 8601), §3.3.
  extractedAt?: string;
}

export interface ExtractionResult {
  model: string;
  instructionsVersion: string;
  documents: DocumentExtraction[];
}

// One document's reading of one field, with what a finding needs to cite it.
export interface FieldReading {
  documentId: string;
  documentName: string;
  kind: DocumentKind;
  field: FieldId;
  value: ExtractedField;
}

export interface Extraction {
  // Every requester document (request form first, then supporting documents
  // in upload order) and the RoPA entry.
  readings(field: FieldId): FieldReading[];
}

const NOT_FOUND: ExtractedField = { state: 'not_found' };

// The extraction saved by the extract step, checked for shape. A missing or
// malformed extraction is a pipeline error: no check runs on a guess.
export function readExtraction(
  results: Readonly<Record<string, unknown>>,
  documents: readonly {
    id: string;
    kind: DocumentKind;
    originalName: string;
  }[],
): Extraction {
  const saved = results[EXTRACT_STEP] as ExtractionResult | undefined;
  if (!saved || !Array.isArray(saved.documents)) {
    throw new PipelineError('The extraction is missing.');
  }
  const byId = new Map(saved.documents.map((doc) => [doc.documentId, doc]));
  const order: DocumentKind[] = ['REQUEST_FORM', 'SUPPORTING', 'ROPA'];
  const ordered = documents
    .map((doc, index) => ({ doc, index }))
    .sort(
      (x, y) =>
        order.indexOf(x.doc.kind) - order.indexOf(y.doc.kind) ||
        x.index - y.index,
    )
    .map(({ doc }) => doc);

  for (const doc of ordered) {
    if (!byId.has(doc.id)) {
      throw new PipelineError('A document has no extraction.');
    }
  }

  return {
    readings(field) {
      const requesterField = (REQUESTER_FIELDS as readonly string[]).includes(
        field,
      );
      const providerField = (PROVIDER_FIELDS as readonly string[]).includes(
        field,
      );
      return ordered
        .filter((doc) => (doc.kind === 'ROPA' ? providerField : requesterField))
        .map((doc) => ({
          documentId: doc.id,
          documentName: doc.originalName,
          kind: doc.kind,
          field,
          value: validField(byId.get(doc.id)!.fields?.[field]),
        }));
    },
  };
}

// Anything that is not a well-formed found value with a non-empty quote is
// not found: a value nobody can trace is never trusted (§2.8).
function validField(field: ExtractedField | undefined): ExtractedField {
  if (!field || typeof field !== 'object') return NOT_FOUND;
  if (field.state === 'ambiguous') return field;
  if (
    field.state === 'found' &&
    typeof field.value === 'string' &&
    field.value.trim() !== '' &&
    typeof field.quote === 'string' &&
    field.quote.trim() !== ''
  ) {
    return field;
  }
  return NOT_FOUND;
}
