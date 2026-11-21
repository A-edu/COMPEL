# Sprint 3 demo documents (spec §13)

Synthetic documents for the sprint review demo. Every page is marked **"SYNTHETIC — DEMO DATA"**; they contain no real person's data, and their only email addresses are on `.example`. They are not seeded into the app: the presenters upload them during the demo.

The §13 script has the Ministry of Health (`moh`) submit both requests to one provider. The labelled dataset (`apps/api/eval/dataset`) has no such cases, and a document naming other parties than the request's fails CD-01, so these are written for **`moh` → `gosi`** in the dataset's layout.

| Case | Folder | Demo steps | Who uploads what | Expected result |
|---|---|---|---|---|
| D1 | `D1-clean` | 2–4 | `moh`: `request-form.pdf`. `gosi`: `ropa.pdf`, endorse | Every check passes: **approved by the system** |
| D2 | `D2-incompatible` | 5–7 | `moh`: `request-form.pdf`. `gosi`: `ropa.pdf`, endorse | **Flagged**: PC-01 incompatible (an awareness campaign against data collected for social insurance), and FL-12 not found (the RoPA entry omits its retention period) |
| D3 | `D3-incompatible-corrected` | 8–9 | `gosi`: `ropa-corrected.pdf` as the correction to D2 | FL-12 now passes; PC-01 stays incompatible, so the request **stays flagged** for the officer |

D3's `request-form.pdf` is the same as D2's; it is there so the evaluation can score the corrected case on its own.

## Files

- `build_demo.py`: writes every PDF, `expected.json` and `index.json`. Needs Python 3.10+ and Chromium. Run it from this folder: `python3 build_demo.py`.
- `<case>/expected.json`: the dataset's format (`apps/api/eval/dataset/README.md`), so the evaluation can score these cases.

## Checking them

- `npm test` confirms every expected quote can be found in the PDFs' text (`pdf-text.spec.ts`).
- With the real model (costs a few cents, about 15 calls):

  ```
  EVAL_DATASET=docs/demo/sprint-3 npm run eval
  ```

## Still to come

The step-by-step runbook and the rehearsal on the published app follow once §9.1, §9.2 and §10 are merged: demo steps 4, 7, 8 and 9 depend on them.
