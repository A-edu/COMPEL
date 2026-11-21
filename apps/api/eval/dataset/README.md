# Labelled synthetic dataset (Sprint 3 §5.4)

Ten cases to build and judge the pipeline against. Expectations follow **rule set 1.0** (`docs/rule-set.md`). The dataset is for development and the evaluation run (§5.5) only. It is **not seeded into the app** (§5.7), and the test suite doesn't read it.

Every page of every document carries the mark **"SYNTHETIC — DEMO DATA"**. The documents name real Saudi government entities, as the seed does. They contain no real person's data, and their only email addresses are on the reserved `.example` domain.

## Cases

| Case | Folder | What it tests | Position | Checks not passing | Outcome |
|---|---|---|---|---|---|
| C01 | `C01-clean-english` | Clean case, English, with a supporting cover letter | Endorsed | — | Approved |
| C02 | `C02-missing-retention` | Missing field: the request form never states a retention period | Endorsed | FL-05 not found | Flagged |
| C03 | `C03-contradiction-between-documents` | Contradiction between documents: the supporting memo asks for one more data category than the request form | Endorsed | CD-03 inconsistent | Flagged |
| C04 | `C04-incompatible-purpose` | Incompatible purpose: health-supervision data requested for a tax audit | Endorsed | PC-01 incompatible | Flagged |
| C05 | `C05-indeterminate-purpose` | Indeterminate purpose: the RoPA entry never states the collection legal basis | Endorsed | PC-01 indeterminate | Flagged |
| C06 | `C06-clean-arabic` | Arabic documents; clean case (the Arabic version of C01, without the cover letter) | Endorsed | — | Approved |
| C07 | `C07-scanned-page` | Scanned page: page 2 of the RoPA entry is an image with no text layer | Endorsed | FL-09, FL-10, FL-11, FL-12 ambiguous | Flagged |
| C08 | `C08-provider-objection` | Every check passes, but the provider objected | Objected | — | Flagged (objection only) |
| C09 | `C09-category-not-held` | The request asks for a data category the RoPA entry doesn't record | Endorsed | CD-04 inconsistent | Flagged |
| C10 | `C10-vague-purpose-arabic` | Arabic documents; the request purpose is stated only in general terms | Endorsed | FL-01 failed, PC-01 indeterminate | Flagged |

**Coverage of §5.4:** clean auto-clear (C01, C06); missing field (C02); contradiction between documents (C03, and C09 across the two sides); incompatible purpose (C04); indeterminate purpose (C05, C10); Arabic documents (C06, C10); scanned page (C07).

The four outcome sources of §8 are all covered: a field-level result (C02, C07, C10), a cross-document result (C03, C09), a purpose result (C04, C05, C10), and a provider objection with clean checks (C08).

## Files

Each case folder holds its PDFs and an `expected.json`. `index.json` lists every case with its outcome.

**`expected.json`**

- `position`, `objection`: the provider's response that goes with the documents.
- `documents[]`: `file`, `kind` (the `DocumentKind` enum: `REQUEST_FORM`, `SUPPORTING`, `ROPA`), `language`, `pages`, `scanned_pages`, and `fields`.
  - Requester documents list `F-R1`–`F-R6`; the RoPA entry lists `F-P1`–`F-P8`.
  - Each field has a `state`: `found`, `not_found` or `ambiguous`.
  - A found field has a `quote`, the exact text it comes from. Data categories (`F-R4`, `F-P4`) also have `items`, the list split on commas.
- `checks`: every rule-set check with its expected result.
- `outcome`: `APPROVED` (a system decision) or `FLAGGED`.
- `flag_reasons`: the checks that raise a reason, plus `PROVIDER_OBJECTION` for C08.

## Conventions the pipeline must match

- **The value is the stated sentence.** A found field's expected value is the whole sentence after its label, so the quote and the value are the same text. The extractor may return a shorter quote, as long as that quote appears in the document and supports the value. Compare values loosely (by meaning, or by the `items` list for categories), and quotes strictly.
- **How quotes are compared.** Both sides are normalised before checking that the quote appears in the document:
  - apply Unicode NFKC, which folds Arabic presentation forms, the lam-alef ligature and Latin ligatures such as "ffi"
  - remove bidi control characters and tatweel
  - join a hyphen at a line break
  - collapse all whitespace

  `build_dataset.py` applies exactly this (`norm()`).
- **Use an extractor that returns text in logical order.** In its default mode, `pdftotext` reorders Arabic, for example turning `الالتزام` into `االلتزام`, so Arabic quotes would wrongly fail. `pypdf` and pdf.js return logical order. `build_dataset.py` verifies every quote with `pypdf`.
- **Unreadable pages.** If a document has an unreadable page, any field not found on its readable pages is ambiguous, not "not found" (spec §2.1, §3.3). C07 tests this.

## Points rule set 1.0 leaves open

The cases are built so that none of these changes an expected result. Points 1–3 were settled on 2026-11-21 (spec §14):

1. **A field in several requester documents.** Rule set 1.0 doesn't say whether a field-level check runs on each document's value or on one value per request. In every case here, all stated values pass, so either reading gives the same result. *Settled:* one finding per request, failed if any stated value fails, ambiguous if any document gives the field as ambiguous.
2. **A cross-document check on an ambiguous value.** CD checks define only passed and inconsistent. No case feeds them an ambiguous value: C07's unreadable page holds only fields that no CD check uses. *Settled:* an ambiguous value in a comparison gives inconsistent.
3. **A field no requester document states.** C02's CD-05 is expected to pass, because there is no second value to disagree with. FL-05 already flags the missing retention period. *Settled as described.*
4. **Purpose compatibility and Law Art 10.** C04 is incompatible under PC-01. An officer may still approve it if a Law Art 10 exception applies. That's the officer's judgement, which is why the system only flags it.

## Regenerating

```
cd apps/api/eval/dataset
python3 build_dataset.py
```

The script rebuilds every case from its `CASES` table and self-checks the result:

- every found quote appears in its PDF
- every readable page carries the mark
- the scanned page has no text layer

It needs Python 3.10+, Google Chrome, poppler (`pdftoppm`), and the Python packages Pillow, img2pdf and pypdf. It's an authoring tool only, not a dependency of the app.

To change an expectation, change the case in `CASES` and rebuild, never `expected.json` by hand. If a rule-set change alters any expected result, raise the rule-set version and rebuild.
