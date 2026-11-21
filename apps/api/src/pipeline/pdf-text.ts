import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Reads a PDF's text layer, page by page, in reading order (Sprint 3 spec
// §2.1, §6). There is no OCR: a page with no text layer (a scanned page) is
// unreadable. The extraction step sends the readable text to the model and
// confirms every quote against the same text.

export interface PdfPage {
  // The page's text, one line per line of the page, in logical order, in
  // Unicode NFKC.
  text: string;
  // False when the page has no text layer, as with a scanned page.
  readable: boolean;
}

// Thrown for a file pdf.js cannot open (damaged, encrypted, not a PDF).
export class UnreadablePdfError extends Error {
  constructor() {
    super('The PDF could not be read.');
    this.name = 'UnreadablePdfError';
  }
}

interface Glyphs {
  str: string;
  x: number;
  y: number;
  width: number;
  size: number;
  hasEOL: boolean;
}

export async function readPdfText(data: Buffer): Promise<PdfPage[]> {
  const loading = getDocument({
    // pdf.js takes ownership of the array it is given.
    data: new Uint8Array(data),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  try {
    const pdf = await loading.promise;
    const pages: PdfPage[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const glyphs: Glyphs[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        glyphs.push({
          // pdf.js puts a right-to-left run of several glyphs into logical
          // order itself. Lines are assembled in visual order, so it goes
          // back to visual order first (the reordering is its own inverse).
          str:
            item.dir === 'rtl' && [...item.str].length > 1
              ? visualToLogical(item.str)
              : item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          size: Math.hypot(item.transform[2], item.transform[3]) || 10,
          hasEOL: item.hasEOL,
        });
      }
      // NFKC turns the Arabic presentation forms a PDF stores into the
      // letters as written, which is what the model reads and quotes.
      const text = toLines(glyphs).join('\n').normalize('NFKC');
      pages.push({ text, readable: /\p{L}/u.test(text) });
      page.cleanup();
    }
    return pages;
  } catch {
    throw new UnreadablePdfError();
  } finally {
    await loading.destroy();
  }
}

// pdf.js gives text runs in drawing order. Runs on the same baseline form a
// line; within a line they are placed left to right by position, and a line
// that holds right-to-left script is then put back into logical order.
function toLines(glyphs: Glyphs[]): string[] {
  const lines: Glyphs[][] = [];
  let current: Glyphs[] = [];
  let endOfLine = false;
  for (const glyph of glyphs) {
    const last = current[current.length - 1];
    const sameLine =
      last !== undefined &&
      !endOfLine &&
      Math.abs(glyph.y - last.y) <= Math.max(1, last.size * 0.3);
    if (!sameLine && current.length > 0) {
      lines.push(current);
      current = [];
    }
    if (glyph.str !== '') current.push(glyph);
    endOfLine = glyph.hasEOL;
  }
  if (current.length > 0) lines.push(current);

  return lines
    .map((line) => {
      const placed = [...line].sort((a, b) => a.x - b.x);
      let visual = '';
      let previous: Glyphs | undefined;
      for (const glyph of placed) {
        if (previous) {
          const gap = glyph.x - (previous.x + previous.width);
          const spaced = /\s$/.test(visual) || /^\s/.test(glyph.str);
          if (!spaced && gap > previous.size * 0.2) visual += ' ';
        }
        visual += glyph.str;
        previous = glyph;
      }
      return RTL.test(visual) ? visualToLogical(visual) : visual;
    })
    .filter((line) => line.trim() !== '');
}

// Hebrew and Arabic, including Arabic presentation forms.
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const RTL_CHAR = new RegExp(`^${RTL.source}$`);
const LTR_CHAR = /^[\p{L}\p{N}]$/u;
const MIRRORED: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
  '«': '»',
  '»': '«',
};

// A right-to-left line laid out left to right on the page, back in the order
// it is read: the line is reversed, except that each left-to-right run
// (Latin words, numbers, an email address) keeps its own order. Brackets
// outside those runs are mirrored back.
export function visualToLogical(visual: string): string {
  const chars = [...visual];
  const kind = (c: string) =>
    RTL_CHAR.test(c) ? 'rtl' : LTR_CHAR.test(c) ? 'ltr' : 'neutral';
  const units: string[] = [];
  let i = 0;
  while (i < chars.length) {
    if (kind(chars[i]) !== 'ltr') {
      units.push(MIRRORED[chars[i]] ?? chars[i]);
      i++;
      continue;
    }
    // A left-to-right run: up to the last left-to-right character before the
    // next right-to-left one, taking the spaces and punctuation between.
    let end = i;
    for (let k = i; k < chars.length && kind(chars[k]) !== 'rtl'; k++) {
      if (kind(chars[k]) === 'ltr') end = k;
    }
    units.push(chars.slice(i, end + 1).join(''));
    i = end + 1;
  }
  return units.reverse().join('');
}
