import { readdir, readFile } from 'node:fs/promises';
import { buildPlaceholderPdf } from '../seed/placeholder-pdf.js';
import { datasetCase, datasetFile } from './extract.helper-spec.js';
import {
  readPdfText,
  UnreadablePdfError,
  visualToLogical,
} from './pdf-text.js';
import { norm, quoteAppearsIn } from './quote-text.js';

// The text the extraction confirms quotes against (Sprint 3 spec §2.1, §2.8;
// dataset README -> Use an extractor that returns text in logical order).

describe('readPdfText', () => {
  it('reads every dataset document so that each of its quotes can be located, English and Arabic', async () => {
    const folders = (await readdir(new URL('../../eval/dataset', import.meta.url)))
      .filter((name) => /^C\d\d-/.test(name))
      .sort();
    expect(folders.length).toBeGreaterThanOrEqual(10);

    const missing: string[] = [];
    let quotes = 0;
    for (const folder of folders) {
      for (const doc of (await datasetCase(folder)).documents) {
        const pages = await readPdfText(await datasetFile(folder, doc.file));
        const text = norm(
          pages
            .filter((page) => page.readable)
            .map((page) => page.text)
            .join('\n'),
        );
        for (const [field, expected] of Object.entries(doc.fields)) {
          if (expected.state !== 'found') continue;
          quotes++;
          if (!quoteAppearsIn(expected.quote!, text)) {
            missing.push(`${folder}/${doc.file} ${field}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
    expect(quotes).toBeGreaterThan(100);
  });

  it('reads every demo document (spec §13) so that each of its quotes can be located', async () => {
    const demo = new URL('../../../../docs/demo/sprint-3/', import.meta.url);
    const index = JSON.parse(
      await readFile(new URL('index.json', demo), 'utf8'),
    ) as { cases: { folder: string }[] };
    expect(index.cases.length).toBeGreaterThanOrEqual(3);

    const missing: string[] = [];
    for (const { folder } of index.cases) {
      const expected = JSON.parse(
        await readFile(new URL(`${folder}/expected.json`, demo), 'utf8'),
      ) as Awaited<ReturnType<typeof datasetCase>>;
      for (const doc of expected.documents) {
        const pages = await readPdfText(
          await readFile(new URL(`${folder}/${doc.file}`, demo)),
        );
        expect(pages.every((page) => page.readable)).toBe(true);
        const text = norm(pages.map((page) => page.text).join('\n'));
        for (const [field, want] of Object.entries(doc.fields)) {
          if (want.state === 'found' && !quoteAppearsIn(want.quote!, text)) {
            missing.push(`${folder}/${doc.file} ${field}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps Arabic in reading order, as written', async () => {
    const [page] = await readPdfText(
      await datasetFile('C06-clean-arabic', 'request-form.pdf'),
    );
    const text = norm(page.text);
    expect(text).toContain('نموذج طلب مشاركة بيانات');
    expect(text).toContain(
      'تحفظ البيانات ثلاث سنوات بعد إغلاق التفتيش المرتبط بها، ثم تتلف.',
    );
  });

  it('marks exactly the pages with no text layer as unreadable', async () => {
    for (const folder of ['C01-clean-english', 'C06-clean-arabic', 'C07-scanned-page']) {
      for (const doc of (await datasetCase(folder)).documents) {
        const pages = await readPdfText(await datasetFile(folder, doc.file));
        const unreadable = pages.flatMap((page, index) =>
          page.readable ? [] : [index + 1],
        );
        expect({ doc: `${folder}/${doc.file}`, unreadable }).toEqual({
          doc: `${folder}/${doc.file}`,
          unreadable: doc.scanned_pages,
        });
      }
    }
  });

  it('reads a page with no text at all as unreadable', async () => {
    const pages = await readPdfText(buildPlaceholderPdf([]));
    expect(pages).toEqual([{ text: '', readable: false }]);
  });

  it('refuses a file that is not a PDF', async () => {
    await expect(
      readPdfText(Buffer.from('PK\u0003\u0004 not a pdf')),
    ).rejects.toBeInstanceOf(UnreadablePdfError);
  });
});

describe('visualToLogical', () => {
  it('reverses right-to-left text but keeps left-to-right runs in order', () => {
    // "contact: privacy@gosi.example" laid out right to left.
    expect(visualToLogical('privacy@gosi.example :لاصتالا')).toBe(
      'الاتصال: privacy@gosi.example',
    );
    // "12 months" in Arabic: the number keeps its digits' order.
    expect(visualToLogical('اًرهش 12')).toBe('12 شهرًا');
  });

  it('mirrors brackets outside left-to-right runs', () => {
    expect(visualToLogical('(ةرازولا)')).toBe('(الوزارة)');
  });

  it('is its own inverse', () => {
    const logical = 'المادة 15 من نظام حماية البيانات (PDPL)، الفقرة 3.';
    expect(visualToLogical(visualToLogical(logical))).toBe(logical);
  });
});
