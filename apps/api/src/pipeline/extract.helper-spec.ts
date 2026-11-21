import type { DocumentKind } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModelRequest, ModelResponse } from './model/model-client.js';
import type { FieldId } from './rule-set.js';

// The labelled dataset (apps/api/eval/dataset) for the extraction tests
// (Sprint 3 spec §6 names its cases). Its PDFs are real documents: English,
// Arabic and a scanned page. The model is always a stand-in.

const DATASET_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'eval',
  'dataset',
);

export interface ExpectedField {
  state: 'found' | 'not_found' | 'ambiguous';
  quote?: string;
  items?: string[];
}

export interface DatasetDocument {
  file: string;
  kind: DocumentKind;
  language: string;
  scanned_pages: number[];
  fields: Partial<Record<FieldId, ExpectedField>>;
}

export async function datasetCase(
  folder: string,
): Promise<{ documents: DatasetDocument[] }> {
  return JSON.parse(
    await readFile(join(DATASET_DIR, folder, 'expected.json'), 'utf8'),
  ) as { documents: DatasetDocument[] };
}

export function datasetFile(folder: string, file: string): Promise<Buffer> {
  return readFile(join(DATASET_DIR, folder, file));
}

export interface AnswerField {
  fieldId: FieldId;
  state: 'found' | 'not_found' | 'ambiguous';
  value: string;
  quote: string;
  items: string[];
}

// What a faithful model would answer for a dataset document: every field the
// dataset found, with its quote as value and quote. A field the dataset gives
// as ambiguous (only ever because of a scanned page) is answered not found,
// since the model cannot see that page.
export function faithfulAnswer(doc: DatasetDocument): AnswerField[] {
  return (Object.entries(doc.fields) as [FieldId, ExpectedField][]).map(
    ([fieldId, field]) =>
      field.state === 'found'
        ? {
            fieldId,
            state: 'found',
            value: field.quote!,
            quote: field.quote!,
            items: field.items ?? [],
          }
        : { fieldId, state: 'not_found', value: '', quote: '', items: [] },
  );
}

export function answer(fields: AnswerField[]): ModelResponse {
  return { model: 'stand-in-model', text: '', json: { fields } };
}

// A plain ASCII PDF of `pageCount` pages, each holding `linesPerPage` lines
// of `line`, for a document longer than one model call takes.
export function longPdf(
  pageCount: number,
  linesPerPage: number,
  line: string,
): Buffer {
  const content = Buffer.from(
    `BT /F1 10 Tf 72 740 Td 12 TL\n${Array.from(
      { length: linesPerPage },
      () => `(${line}) '`,
    ).join('\n')}\nET`,
  );
  // 1 catalog, 2 pages, 3 font, 4 shared content, then one object per page.
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from(
      { length: pageCount },
      (_, i) => `${i + 5} 0 R`,
    ).join(' ')}] /Count ${pageCount} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content.toString()}\nendstream`,
    ...Array.from(
      { length: pageCount },
      () =>
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R >>',
    ),
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

// The text of the one user turn an extraction call sent.
export function promptOf(request: ModelRequest): string {
  return request.content
    .map((block) => (block.type === 'text' ? block.text : `[${block.type}]`))
    .join('\n');
}
