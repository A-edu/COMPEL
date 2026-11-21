#!/usr/bin/env python3
"""Builds the Sprint 3 demo documents (spec §13).

The demo script has the Ministry of Health (`moh`) submit a clean case and an
incompatible-purpose case to one provider. The labelled dataset (§5.4) has no
such cases (its clean case is hrsd -> gosi, its incompatible case zatca ->
moh), and CD-01 flags documents that name other parties than the request's.
So these documents are written for moh -> gosi, in the dataset's layout, with
expectations in the dataset's expected.json format so `npm run eval` can
score them:

    EVAL_DATASET=docs/demo/sprint-3 npm run eval

Run it from this folder:

    python3 build_demo.py

Needs Python 3.10+ and Chromium (or Google Chrome) for HTML -> PDF; nothing
else. Every page carries "SYNTHETIC — DEMO DATA"; the documents contain no
real person's data, and their only email addresses are on `.example`.
Expectations follow rule set 1.0 (docs/rule-set.md).
"""

from __future__ import annotations

import html
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

RULE_SET_VERSION = "1.0"
MARK = "SYNTHETIC — DEMO DATA"

REQUESTER_FIELDS = ["F-R1", "F-R2", "F-R3", "F-R4", "F-R5", "F-R6"]
PROVIDER_FIELDS = ["F-P1", "F-P2", "F-P3", "F-P4", "F-P5", "F-P6", "F-P7", "F-P8"]
CHECKS = [f"FL-{n:02d}" for n in range(1, 13)] + [f"CD-{n:02d}" for n in range(1, 6)] + ["PC-01"]
PASSING = {"passed", "compatible"}

# The dataset's labels (build_dataset.py), so the documents read the same.
LABELS = {
    "F-R6": "Parties:",
    "F-R1": "Purpose of the request:",
    "F-R3": "Public interest and mandate:",
    "F-R2": "Legal basis:",
    "F-R4": "Data requested:",
    "F-R5": "Retention:",
    "F-P1": "Controller and contact:",
    "F-P2": "Purpose of processing:",
    "F-P3": "Legal basis for collection:",
    "F-P4": "Categories of personal data:",
    "F-P5": "Categories of data subjects:",
    "F-P6": "Recipients:",
    "F-P7": "Transfer outside the Kingdom:",
    "F-P8": "Retention period:",
}

PARTIES = "Requested by the Ministry of Health from the General Organization for Social Insurance."
HEALTH_LAW_BASIS = (
    "PDPL Article 15(3): disclosure requested by a public entity to implement "
    "another law, namely the Health Law."
)
GOSI_CONTROLLER = "General Organization for Social Insurance, Data Management Office, privacy@gosi.example"
NO_TRANSFER = "No transfer or disclosure outside the Kingdom."

# --- Case D1: clean, auto-cleared ------------------------------------------
# MOH follows up treatment of occupational injuries; GOSI collected the
# records for exactly that, and names MOH as a recipient.

CLEAN_REQUEST = {
    "F-R6": PARTIES,
    "F-R1": "To follow up the medical treatment of insured workers' occupational injuries in health facilities and settle their treatment costs with the Organization.",
    "F-R3": "Supervising the medical treatment provided in health facilities, a function given to the Ministry by the Health Law.",
    "F-R2": HEALTH_LAW_BASIS,
    "F-R4": "Worker name, national ID number, injury date, injury type, treating health facility.",
    "F-R5": "Kept for five years after the related treatment case is closed, then destroyed.",
}

CLEAN_ROPA = {
    "F-P1": GOSI_CONTROLLER,
    "F-P2": "Registering occupational injuries of insured workers, paying their compensation, and covering and following up their medical treatment with the Ministry of Health and health facilities.",
    "F-P3": "Processing required to implement the Social Insurance Law.",
    "F-P4": "Worker name, national ID number, employer establishment number, injury date, injury type, treating health facility, compensation paid.",
    "F-P5": "Private-sector workers insured against occupational hazards who report an occupational injury.",
    "F-P6": "The Ministry of Health, for following up the treatment of occupational injuries; other government entities where a law requires disclosure.",
    "F-P7": NO_TRANSFER,
    "F-P8": "Occupational injury records are kept for ten years after the final compensation is paid.",
}

# --- Case D2: incompatible purpose, with a fixable gap ---------------------
# MOH wants contact details for an awareness campaign; GOSI collected them to
# run social insurance. The RoPA entry also leaves out its retention period
# (FL-12), which the corrected entry (D3) adds; the purpose stays
# incompatible, so the request still needs an officer.

CAMPAIGN_REQUEST = {
    "F-R6": PARTIES,
    "F-R1": "To send insured workers text messages inviting them to the Ministry's national health awareness campaign.",
    "F-R3": "Promoting public health awareness, a function given to the Ministry by the Health Law.",
    "F-R2": HEALTH_LAW_BASIS,
    "F-R4": "Employee name, mobile number, employer establishment number.",
    "F-R5": "Kept until the awareness campaign ends, then destroyed.",
}

REGISTRATION_ROPA_CORRECTED = {
    "F-P1": GOSI_CONTROLLER,
    "F-P2": "Registering private-sector employees and their wages to calculate and collect social insurance contributions and pay benefits.",
    "F-P3": "Processing required to implement the Social Insurance Law.",
    "F-P4": "Employee name, national ID number, mobile number, employer establishment number, registered monthly wage, contribution history.",
    "F-P5": "Private-sector employees registered for social insurance.",
    "F-P6": "The Ministry of Human Resources and Social Development, for labour law enforcement; the Ministry of Health, to confirm workers' insurance status for the treatment of occupational injuries; other government entities where a law requires disclosure.",
    "F-P7": NO_TRANSFER,
    "F-P8": "Registration records are kept for the employee's insured life and ten years after the final benefit is paid.",
}
REGISTRATION_ROPA = {k: v for k, v in REGISTRATION_ROPA_CORRECTED.items() if k != "F-P8"}

CASES = [
    {
        "id": "D1",
        "folder": "D1-clean",
        "covers": "Demo steps 2–4: clean case from moh to gosi, auto-cleared by the system",
        "title": "Occupational injury records for treatment follow-up",
        "documents": [
            {"file": "request-form.pdf", "kind": "REQUEST_FORM", "side": "requester",
             "heading": "Data-sharing request form", "fields": CLEAN_REQUEST},
            {"file": "ropa.pdf", "kind": "ROPA", "side": "provider",
             "heading": "Record of processing activities — entry", "fields": CLEAN_ROPA},
        ],
        "expected_checks": {},
    },
    {
        "id": "D2",
        "folder": "D2-incompatible",
        "covers": "Demo steps 5–7: incompatible purpose from moh to gosi; the RoPA entry also omits its retention period",
        "title": "Worker contact details for a health awareness campaign",
        "documents": [
            {"file": "request-form.pdf", "kind": "REQUEST_FORM", "side": "requester",
             "heading": "Data-sharing request form", "fields": CAMPAIGN_REQUEST},
            {"file": "ropa.pdf", "kind": "ROPA", "side": "provider",
             "heading": "Record of processing activities — entry", "fields": REGISTRATION_ROPA},
        ],
        "expected_checks": {"FL-12": "not_found", "PC-01": "incompatible"},
    },
    {
        "id": "D3",
        "folder": "D3-incompatible-corrected",
        "covers": "Demo steps 8–9: D2 after the provider's correction adds the retention period; the purpose stays incompatible",
        "title": "Worker contact details for a health awareness campaign",
        "documents": [
            {"file": "request-form.pdf", "kind": "REQUEST_FORM", "side": "requester",
             "heading": "Data-sharing request form", "fields": CAMPAIGN_REQUEST},
            {"file": "ropa-corrected.pdf", "kind": "ROPA", "side": "provider",
             "heading": "Record of processing activities — entry (corrected)", "fields": REGISTRATION_ROPA_CORRECTED},
        ],
        "expected_checks": {"PC-01": "incompatible"},
    },
]

# --- Rendering (the dataset's layout) --------------------------------------

CSS = """
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; }
body { font-family: 'DejaVu Sans', sans-serif; font-size: 11pt; line-height: 1.5; color: #111; }
.sheet { position: relative; width: 210mm; height: 296mm; padding: 28mm 20mm 26mm 20mm;
  box-sizing: border-box; overflow: hidden; }
.mark { position: absolute; left: 20mm; right: 20mm; text-align: center; font-weight: bold;
  font-size: 10pt; letter-spacing: 0.05em; border: 1.5px solid #111; padding: 3px 0; }
.mark.top { top: 10mm; }
.mark.bottom { bottom: 10mm; }
h1 { font-size: 16pt; margin: 0 0 4mm 0; }
.meta { color: #444; font-size: 9.5pt; margin-bottom: 8mm; }
.field { margin: 0 0 5mm 0; }
.label { font-weight: bold; display: block; }
"""


def render_html(case: dict, doc: dict) -> str:
    meta = "Synthetic document prepared for the COMPEL demo. It contains no real person's data."
    parts = [
        f'<div class="sheet"><div class="mark top">{MARK}</div>',
        f"<h1>{html.escape(doc['heading'])}</h1>",
        f'<div class="meta">{html.escape(case["title"])}<br>{html.escape(meta)}</div>',
    ]
    for field_id, text in doc["fields"].items():
        parts.append(
            f'<p class="field"><span class="label">{html.escape(LABELS[field_id])}</span>'
            f"<span>{html.escape(text)}</span></p>"
        )
    parts.append(f'<div class="mark bottom">{MARK}</div></div>')
    return (
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
        f"<title>{html.escape(doc['heading'])}</title><style>{CSS}</style></head><body>"
        f"{''.join(parts)}</body></html>"
    )


def chrome() -> str:
    for name in ("chromium", "google-chrome", "chromium-browser"):
        path = shutil.which(name)
        if path:
            return path
    raise SystemExit("Chromium or Google Chrome is needed to render the PDFs.")


def render_pdf(html_text: str, out: Path, tmp: Path) -> None:
    src = tmp / f"{out.parent.name}-{out.stem}.html"
    src.write_text(html_text, encoding="utf-8")
    subprocess.run(
        [chrome(), "--headless", "--no-sandbox", "--disable-gpu",
         "--no-pdf-header-footer", f"--print-to-pdf={out}", src.as_uri()],
        check=True, capture_output=True,
    )


# --- Expectations (the dataset's expected.json format) ---------------------

def list_items(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"[,،]", text.rstrip(".")) if p.strip()]


def expected_fields(doc: dict) -> dict:
    ids = REQUESTER_FIELDS if doc["side"] == "requester" else PROVIDER_FIELDS
    out = {}
    for field_id in ids:
        text = doc["fields"].get(field_id)
        if text is None:
            out[field_id] = {"state": "not_found"}
            continue
        entry = {"state": "found", "quote": text}
        if field_id in ("F-R4", "F-P4"):
            entry["items"] = list_items(text)
        out[field_id] = entry
    return out


def expected_case(case: dict) -> dict:
    checks = {c: ("compatible" if c == "PC-01" else "passed") for c in CHECKS}
    checks.update(case["expected_checks"])
    all_pass = all(r in PASSING for r in checks.values())
    return {
        "case": case["id"],
        "covers": case["covers"],
        "rule_set_version": RULE_SET_VERSION,
        "title": case["title"],
        "position": "ENDORSED",
        "objection": None,
        "documents": [
            {
                "file": d["file"],
                "kind": d["kind"],
                "language": "en",
                "pages": 1,
                "scanned_pages": [],
                "fields": expected_fields(d),
            }
            for d in case["documents"]
        ],
        "checks": checks,
        "outcome": "APPROVED" if all_pass else "FLAGGED",
        "flag_reasons": [c for c, r in checks.items() if r not in PASSING],
    }


def main() -> None:
    here = Path(__file__).resolve().parent
    index = {"rule_set_version": RULE_SET_VERSION, "cases": []}
    with tempfile.TemporaryDirectory() as tmp_name:
        tmp = Path(tmp_name)
        for case in CASES:
            case_dir = here / case["folder"]
            case_dir.mkdir(exist_ok=True)
            for doc in case["documents"]:
                render_pdf(render_html(case, doc), case_dir / doc["file"], tmp)
            exp = expected_case(case)
            (case_dir / "expected.json").write_text(
                json.dumps(exp, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            index["cases"].append({
                "case": case["id"],
                "folder": case["folder"],
                "covers": case["covers"],
                "position": "ENDORSED",
                "outcome": exp["outcome"],
                "not_passing": exp["flag_reasons"],
            })
            print(f"{case['id']}: {exp['outcome']} {exp['flag_reasons']}")
    (here / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
