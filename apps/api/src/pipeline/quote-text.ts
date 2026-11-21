// How a quote is matched against a document (Sprint 3 spec §2.8, §3.3, and
// the dataset README -> How quotes are compared). The extraction step uses it
// to confirm that every quote appears in its document; the evaluation uses it
// to compare quotes with the dataset's. Mirrors build_dataset.py's norm().

// Bidi controls (LRM, RLM, LRE–RLO, LRI–PDI) and tatweel.
const BIDI_AND_TATWEEL = /[‎‏‪-‮⁦-⁩ـ]/g;

// NFKC (folds Arabic presentation forms, the lam-alef ligature and Latin
// ligatures such as "ffi"), no bidi controls or tatweel, a hyphen at a line
// break joined, whitespace collapsed.
export function norm(text: string): string {
  return text
    .normalize('NFKC')
    .replace(BIDI_AND_TATWEEL, '')
    .replace(/-\n\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// A quote shorter than this supports nothing.
export const MIN_QUOTE_LENGTH = 4;

// Whether `quote` appears in a document whose text, already passed through
// norm(), is `normalisedText`.
export function quoteAppearsIn(quote: string, normalisedText: string): boolean {
  const wanted = norm(quote);
  return wanted.length >= MIN_QUOTE_LENGTH && normalisedText.includes(wanted);
}
