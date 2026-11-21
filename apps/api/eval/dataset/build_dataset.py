#!/usr/bin/env python3
"""Builds the Sprint 3 labelled synthetic dataset (spec §5.4).

Every PDF and every expected.json in this folder is generated from the CASES
table below, so a document and its expectations can't drift apart. Run it from
this folder:

    python3 build_dataset.py

Needs: Python 3.10+, Google Chrome (headless, for HTML -> PDF), pdftoppm and
pdftotext (poppler), and the Python packages Pillow, img2pdf and pypdf. It is a
one-off authoring tool, not part of the app or its tests.

Expectations are written against rule set 1.1 (docs/rule-set.md).
"""

from __future__ import annotations

import html
import io
import json
import random
import re
import shutil
import subprocess
import tempfile
import unicodedata
from pathlib import Path

import img2pdf
from PIL import Image, ImageFilter
from pypdf import PdfReader, PdfWriter

HERE = Path(__file__).resolve().parent
RULE_SET_VERSION = "1.1"
MARK_EN = "SYNTHETIC — DEMO DATA"
MARK_AR = "بيانات اصطناعية — للعرض فقط"

REQUESTER_FIELDS = ["F-R1", "F-R2", "F-R3", "F-R4", "F-R5", "F-R6"]
PROVIDER_FIELDS = ["F-P1", "F-P2", "F-P3", "F-P4", "F-P5", "F-P6", "F-P7", "F-P8"]
FIELD_NAMES = {
    "F-R1": "Request purpose",
    "F-R2": "Request legal basis",
    "F-R3": "Public interest and mandate",
    "F-R4": "Requested data categories",
    "F-R5": "Requester retention period",
    "F-R6": "Parties",
    "F-P1": "Controller and contact details",
    "F-P2": "Collection purpose",
    "F-P3": "Collection legal basis",
    "F-P4": "Held data categories",
    "F-P5": "Data subject categories",
    "F-P6": "Recipients",
    "F-P7": "Transfer outside the Kingdom",
    "F-P8": "Retention period",
}
CHECKS = [f"FL-{n:02d}" for n in range(1, 13)] + [f"CD-{n:02d}" for n in range(1, 6)] + ["PC-01"]
PASSING = {"passed", "compatible"}

ENTITIES = {
    "moh": ("Ministry of Health", "وزارة الصحة"),
    "zatca": ("Zakat, Tax and Customs Authority", "هيئة الزكاة والضريبة والجمارك"),
    "gosi": ("General Organization for Social Insurance", "المؤسسة العامة للتأمينات الاجتماعية"),
    "hrsd": ("Ministry of Human Resources and Social Development", "وزارة الموارد البشرية والتنمية الاجتماعية"),
}

LABELS = {
    "en": {
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
    },
    "ar": {
        "F-R6": "أطراف الطلب:",
        "F-R1": "الغرض من الطلب:",
        "F-R3": "المصلحة العامة والتفويض:",
        "F-R2": "الأساس النظامي:",
        "F-R4": "البيانات المطلوبة:",
        "F-R5": "مدة الاحتفاظ:",
        "F-P1": "المتحكم وبيانات التواصل:",
        "F-P2": "غرض المعالجة:",
        "F-P3": "الأساس النظامي للجمع:",
        "F-P4": "فئات البيانات الشخصية:",
        "F-P5": "فئات أصحاب البيانات:",
        "F-P6": "الجهات المستلمة:",
        "F-P7": "النقل خارج المملكة:",
        "F-P8": "مدة الاحتفاظ:",
    },
}


def parties(lang: str, frm: str, to: str) -> str:
    if lang == "ar":
        return f"مقدم من {ENTITIES[frm][1]} إلى {ENTITIES[to][1]}."
    return f"Requested by the {ENTITIES[frm][0]} from the {ENTITIES[to][0]}."


def controller(lang: str, slug: str) -> str:
    if lang == "ar":
        # The Latin address goes on its own line so right-to-left text and the
        # address are extracted in reading order.
        return f"{ENTITIES[slug][1]}، مكتب إدارة البيانات،\nprivacy@{slug}.example"
    return f"{ENTITIES[slug][0]}, Data Management Office, privacy@{slug}.example"


def basis(lang: str, law_en: str, law_ar: str) -> str:
    if lang == "ar":
        return (
            "الفقرة الثالثة من المادة الخامسة عشرة من نظام حماية البيانات الشخصية: "
            f"إفصاح تطلبه جهة عامة لتنفيذ نظام آخر، وهو {law_ar}."
        )
    return (
        "PDPL Article 15(3): disclosure requested by a public entity to implement "
        f"another law, namely the {law_en}."
    )


NO_TRANSFER = {"en": "No transfer or disclosure outside the Kingdom.", "ar": "لا يوجد نقل أو إفصاح خارج المملكة."}

# --- Shared document bodies -------------------------------------------------

GOSI_ROPA_EN = {
    "F-P1": controller("en", "gosi"),
    "F-P2": "Registering private-sector employees and their wages to calculate and collect social insurance contributions and pay benefits, and verifying with labour authorities that registered wages match the wages paid.",
    "F-P3": "Processing required to implement the Social Insurance Law.",
    "F-P4": "Employee name, national ID number, date of birth, employer establishment number, registered monthly wage, contribution history.",
    "F-P5": "Private-sector employees registered for social insurance, and employers' authorised representatives.",
    "F-P6": "The Ministry of Human Resources and Social Development, for labour law enforcement; other government entities where a law requires disclosure.",
    "F-P7": NO_TRANSFER["en"],
    "F-P8": "Contribution records are kept for the employee's insured life and ten years after the final benefit is paid.",
}

HRSD_ROPA_EN = {
    "F-P1": controller("en", "hrsd"),
    "F-P2": "Monitoring private-sector wage payments under the wage protection programme to enforce timely and correct payment of wages, and confirming wages paid to the General Organization for Social Insurance for contribution audits.",
    "F-P3": "Processing required to implement the Labour Law.",
    "F-P4": "Employee name, national ID number, employer establishment number, monthly wage paid, bank account number the wage was paid into, payment date.",
    "F-P5": "Private-sector employees whose wages are paid through the wage protection programme.",
    "F-P6": "The General Organization for Social Insurance, for contribution audits; other government entities where a law requires disclosure.",
    "F-P7": NO_TRANSFER["en"],
    "F-P8": "Wage payment records are kept for ten years after the payment date.",
}

ZATCA_ROPA_EN = {
    "F-P1": controller("en", "zatca"),
    "F-P2": "Registering taxpayers for VAT and verifying their returns and payments, and enabling contracting government entities to check the VAT registration status of their suppliers.",
    "F-P3": "Processing required to implement the VAT Law.",
    "F-P4": "Establishment owner name, owner's national ID number, VAT registration number, VAT registration status, tax returns, payments.",
    "F-P5": "Individuals and sole-proprietorship owners registered for VAT.",
    "F-P6": "Government entities that contract with suppliers, to check their tax status; other government entities where a law requires disclosure.",
    "F-P7": NO_TRANSFER["en"],
    "F-P8": "Records are kept for ten years after the end of the tax year they relate to.",
}

MOH_SUPPLIER_REQUEST_EN = {
    "F-R6": parties("en", "moh", "zatca"),
    "F-R1": "To confirm, before awarding a supply contract, that the supplier is registered for VAT and in good tax standing.",
    "F-R3": "Contracting only with suppliers that meet their tax obligations, as required by the Government Tenders and Procurement Law.",
    "F-R2": basis("en", "Government Tenders and Procurement Law", ""),
    "F-R4": "Establishment owner name, owner's national ID number, VAT registration number, VAT registration status.",
    "F-R5": "Kept until the related supply contract ends, then destroyed.",
}

GOSI_AUDIT_REQUEST_EN = {
    "F-R6": parties("en", "gosi", "hrsd"),
    "F-R1": "To check that the contributions employers pay are calculated on the wages they actually paid their employees.",
    "F-R3": "Collecting social insurance contributions on the correct wage base, a function given to the Organization by the Social Insurance Law.",
    "F-R2": basis("en", "Social Insurance Law", ""),
    "F-R4": "Employee name, national ID number, employer establishment number, monthly wage paid.",
    "F-R5": "Kept for five years after the related contribution audit is closed, then destroyed.",
}


def without(d: dict, *keys: str) -> dict:
    return {k: v for k, v in d.items() if k not in keys}


def with_(d: dict, **changes: str) -> dict:
    out = dict(d)
    out.update({k.replace("_", "-"): v for k, v in changes.items()})
    return out


# --- The ten cases ----------------------------------------------------------
# Each document is a list of pages; each page maps field IDs to the sentence
# that states them. A page listed in `scanned` is rendered as an image with no
# text layer. Each case lists only the checks whose expected result is not
# passed/compatible.

CASES = [
    {
        "id": "C01",
        "slug": "clean-english",
        "title": "Employee wage records for labour inspection audits",
        "covers": "Clean case that should auto-clear (English)",
        "position": "ENDORSED",
        "documents": [
            {
                "file": "request-form.pdf", "kind": "REQUEST_FORM", "side": "requester", "lang": "en",
                "heading": "Data-sharing request form",
                "pages": [{
                    "F-R6": parties("en", "hrsd", "gosi"),
                    "F-R1": "To verify that employers inspected under the wage protection programme pay the wages they report for their registered employees.",
                    "F-R3": "Enforcing correct payment of wages to private-sector employees, a function given to the Ministry by the Labour Law.",
                    "F-R2": basis("en", "Labour Law", ""),
                    "F-R4": "Employee name, national ID number, employer establishment number, registered monthly wage.",
                    "F-R5": "Kept for three years after the related inspection is closed, then destroyed.",
                }],
            },
            {
                "file": "supporting-cover-letter.pdf", "kind": "SUPPORTING", "side": "requester", "lang": "en",
                "heading": "Cover letter",
                "pages": [{
                    "F-R6": parties("en", "hrsd", "gosi"),
                    "F-R1": "The data will be used only to check that inspected employers pay the wages they report for their registered employees.",
                }],
            },
            {
                "file": "ropa.pdf", "kind": "ROPA", "side": "provider", "lang": "en",
                "heading": "Record of processing activities — entry",
                "pages": [GOSI_ROPA_EN],
            },
        ],
        "expected_checks": {},
    },
    {
        "id": "C02",
        "slug": "missing-retention",
        "title": "Supplier tax compliance verification",
        "covers": "Missing field: the request form never states a retention period",
        "position": "ENDORSED",
        "documents": [
            {
                "file": "request-form.pdf", "kind": "REQUEST_FORM", "side": "requester", "lang": "en",
                "heading": "Data-sharing request form",
                "pages": [without(MOH_SUPPLIER_REQUEST_EN, "F-R5")],
            },
            {
                "file": "ropa.pdf", "kind": "ROPA", "side": "provider", "lang": "en",
                "heading": "Record of processing activities — entry",
                "pages": [ZATCA_ROPA_EN],
            },
        ],
        "expected_checks": {"FL-05": "not_found"},
    },
    {
        "id": "C03",
        "slug": "contradiction-between-documents",
        "title": "Employee wage records for contribution audits",
        "covers": "Contradiction between documents: the supporting memo asks for a data category the request form doesn't",
        "position": "ENDORSED",
        "documents": [
            {
                "file": "request-form.pdf", "kind": "REQUEST_FORM", "side": "requester", "lang": "en",
                "heading": "Data-sharing request form",
                "pages": [GOSI_AUDIT_REQUEST_EN],
            },
            {
                "file": "supporting-audit-memo.pdf", "kind": "SUPPORTING", "side": "requester", "lang": "en",
                "heading": "Audit plan memo",
                "pages": [{
                    "F-R6": parties("en", "gosi", "hrsd"),
                    "F-R1": "To check that the contributions employers pay are calculated on the wages they actually paid their employees.",
                    "F-R4": "Employee name, national ID number, employer establishment number, monthly wage paid, bank account number the wage was paid into.",
                }],
            },
            {
                "file": "ropa.pdf", "kind": "ROPA", "side": "provider", "lang": "en",
                "heading": "Record of processing activities — entry",
                "pages": [HRSD_ROPA_EN],
            },
        ],
        "expected_checks": {"CD-03": "inconsistent"},
    },
    {
        "id": "C04",
        "slug": "incompatible-purpose",
        "title": "Private clinic visit records for VAT audits",
        "covers": "Incompatible purpose: health-supervision data requested for a tax audit",
        "position": "ENDORSED",
        "documents": [
            {
                "file": "request-form.pdf", "kind": "REQUEST_FORM", "side": "requester", "lang": "en",
                "heading": "Data-sharing request form",
                "pages": [{
                    "F-R6": parties("en", "zatca", "moh"),
                    "F-R1": "To identify patients' visits to private clinics and the fees they paid, to check whether the clinics declared that revenue in their VAT returns.",
                    "F-R3": "Collecting the VAT due on taxable supplies by private health facilities, a function given to the Authority by the VAT Law.",
                    "F-R2": basis("en", "VAT Law", ""),
                    "F-R4": "Patient name, national ID number, facility name, date of visit, fee charged for the visit.",
                    "F-R5": "Kept for five years after the related tax audit is closed, then destroyed.",
                }],
            },
            {
                "file": "ropa.pdf", "kind": "ROPA", "side": "provider", "lang": "en",
                "heading": "Record of processing activities — entry",
                "pages": [{
                    "F-P1": controller("en", "moh"),
                    "F-P2": "Licensing and supervising private health facilities and monitoring the quality of care they provide to patients.",
                    "F-P3": "Processing required to implement the Private Health Institutions Law.",
                    "F-P4": "Patient name, national ID number, facility name, date of visit, diagnosis, fee charged for the visit.",
                    "F-P5": "Patients treated at licensed private health facilities.",
                    "F-P6": "Government entities where a law requires disclosure.",
                    "F-P7": NO_TRANSFER["en"],
                    "F-P8": "Visit records are kept for ten years after the patient's last visit.",
                }],
            },
        ],
        "expected_checks": {"PC-01": "incompatible"},
    },
    {
        "id": "C05",
        "slug": "indeterminate-purpose",
        "title": "Occupational health records for labour inspections",
        "covers": "Indeterminate purpose: the RoPA entry never states the collection legal basis",
        "position": "ENDORSED",
        "documents": [
            {
                "file": "request-form.pdf", "kind": "REQUEST_FORM", "side": "requester", "lang": "en",
                "heading": "Data-sharing request form",
                "pages": [{
                    "F-R6": parties("en", "hrsd", "moh"),
                    "F-R1": "To check that employers in hazardous sectors arrange the periodic medical examinations their workers are required to have.",
                    "F-R3": "Protecting the health and safety of workers in hazardous sectors, a function given to the Ministry by the Labour Law.",
                    "F-R2": basis("en", "Labour Law", ""),
                    "F-R4": "Worker name, national ID number, employer establishment number, date of the last periodic medical examination.",
                    "F-R5": "Kept for two years after the related inspection is closed, then destroyed.",
                }],
            },
            {
                "file": "ropa.pdf", "kind": "ROPA", "side": "provider", "lang": "en",
                "heading": "Record of processing activities — entry",
                "pages": [{
                    "F-P1": controller("en", "moh"),
                    "F-P2": "Recording the periodic occupational medical examinations of workers in hazardous sectors and their results, and reporting examination dates to labour inspection authorities.",
                    "F-P4": "Worker name, national ID number, employer establishment number, date and result of each periodic medical examination.",
                    "F-P5": "Workers in hazardous sectors who undergo periodic occupational medical examinations.",
                    "F-P6": "The Ministry of Human Resources and Social Development, for labour inspections; other government entities where a law requires disclosure.",
                    "F-P7": NO_TRANSFER["en"],
                    "F-P8": "Examination records are kept for fifteen years after the worker's last examination.",
                }],
            },
        ],
        "expected_checks": {"PC-01": "indeterminate"},
    },
    {
        "id": "C06",
        "slug": "clean-arabic",
        "title": "سجلات أجور العاملين لأغراض التفتيش العمالي",
        "covers": "Arabic documents; clean case that should auto-clear (Arabic version of C01)",
        "position": "ENDORSED",
        "documents": [
            {
                "file": "request-form.pdf", "kind": "REQUEST_FORM", "side": "requester", "lang": "ar",
                "heading": "نموذج طلب مشاركة بيانات",
                "pages": [{
                    "F-R6": parties("ar", "hrsd", "gosi"),
                    "F-R1": "التحقق من أن أصحاب العمل الخاضعين للتفتيش ضمن برنامج حماية الأجور يدفعون الأجور التي يسجلونها لعامليهم المسجلين.",
                    "F-R3": "ضمان صرف الأجور الصحيحة لعاملي القطاع الخاص، وهي مهمة أسندها نظام العمل إلى الوزارة.",
                    "F-R2": basis("ar", "", "نظام العمل"),
                    "F-R4": "اسم العامل، رقم الهوية الوطنية، الرقم الموحد للمنشأة، الأجر الشهري المسجل.",
                    "F-R5": "تحفظ البيانات ثلاث سنوات بعد إغلاق التفتيش المرتبط بها، ثم تتلف.",
                }],
            },
            {
                "file": "ropa.pdf", "kind": "ROPA", "side": "provider", "lang": "ar",
                "heading": "سجل أنشطة معالجة البيانات الشخصية — قيد",
                "pages": [{
                    "F-P1": controller("ar", "gosi"),
                    "F-P2": "تسجيل عاملي القطاع الخاص وأجورهم لاحتساب اشتراكات التأمينات الاجتماعية وتحصيلها وصرف المنافع، والتحقق مع جهات العمل المختصة من مطابقة الأجور المسجلة للأجور المدفوعة.",
                    "F-P3": "معالجة يقتضيها تنفيذ نظام التأمينات الاجتماعية.",
                    "F-P4": "اسم العامل، رقم الهوية الوطنية، تاريخ الميلاد، الرقم الموحد للمنشأة، الأجر الشهري المسجل، سجل الاشتراكات.",
                    "F-P5": "عاملو القطاع الخاص المسجلون في التأمينات الاجتماعية، والممثلون المفوضون لأصحاب العمل.",
                    "F-P6": "وزارة الموارد البشرية والتنمية الاجتماعية لأغراض تطبيق نظام العمل، والجهات الحكومية الأخرى متى أوجب نظام الإفصاح.",
                    "F-P7": NO_TRANSFER["ar"],
                    "F-P8": "تحفظ سجلات الاشتراكات طوال مدة تأمين العامل وعشر سنوات بعد صرف آخر منفعة.",
                }],
            },
        ],
        "expected_checks": {},
    },
    {
        "id": "C07",
        "slug": "scanned-page",
        "title": "Supplier tax compliance verification",
        "covers": "Scanned page: page 2 of the RoPA entry is an image with no text layer",
        "position": "ENDORSED",
        "documents": [
            {
                "file": "request-form.pdf", "kind": "REQUEST_FORM", "side": "requester", "lang": "en",
                "heading": "Data-sharing request form",
                "pages": [MOH_SUPPLIER_REQUEST_EN],
            },
            {
                "file": "ropa.pdf", "kind": "ROPA", "side": "provider", "lang": "en",
                "heading": "Record of processing activities — entry",
                "pages": [
                    {k: ZATCA_ROPA_EN[k] for k in ["F-P1", "F-P2", "F-P3", "F-P4"]},
                    {k: ZATCA_ROPA_EN[k] for k in ["F-P5", "F-P6", "F-P7", "F-P8"]},
                ],
                "scanned": [1],
            },
        ],
        "expected_checks": {"FL-09": "ambiguous", "FL-10": "ambiguous", "FL-11": "ambiguous", "FL-12": "ambiguous"},
    },
    {
        "id": "C08",
        "slug": "provider-objection",
        "title": "Employee wage records for contribution audits",
        "covers": "Provider objection: every check passes, but the provider objected, so the request must still be flagged",
        "position": "OBJECTED",
        "objection": "We object because the request covers every establishment rather than only those selected for audit.",
        "documents": [
            {
                "file": "request-form.pdf", "kind": "REQUEST_FORM", "side": "requester", "lang": "en",
                "heading": "Data-sharing request form",
                "pages": [GOSI_AUDIT_REQUEST_EN],
            },
            {
                "file": "ropa.pdf", "kind": "ROPA", "side": "provider", "lang": "en",
                "heading": "Record of processing activities — entry",
                "pages": [HRSD_ROPA_EN],
            },
        ],
        "expected_checks": {},
    },
    {
        "id": "C09",
        "slug": "category-not-held",
        "title": "Registered wages for payroll declaration audits",
        "covers": "Contradiction between the request and the RoPA: a requested data category the provider doesn't hold",
        "position": "ENDORSED",
        "documents": [
            {
                "file": "request-form.pdf", "kind": "REQUEST_FORM", "side": "requester", "lang": "en",
                "heading": "Data-sharing request form",
                "pages": [{
                    "F-R6": parties("en", "zatca", "gosi"),
                    "F-R1": "To check that the payroll costs employers declare in their tax returns match the wages they registered for social insurance.",
                    "F-R3": "Assessing the zakat and tax due on employers' correct taxable base, a function given to the Authority by the Income Tax Law.",
                    "F-R2": basis("en", "Income Tax Law", ""),
                    "F-R4": "Employee name, national ID number, employer establishment number, registered monthly wage, employee bank account number.",
                    "F-R5": "Kept for five years after the related tax audit is closed, then destroyed.",
                }],
            },
            {
                "file": "ropa.pdf", "kind": "ROPA", "side": "provider", "lang": "en",
                "heading": "Record of processing activities — entry",
                "pages": [with_(
                    GOSI_ROPA_EN,
                    F_P2="Registering private-sector employees and their wages to calculate and collect social insurance contributions and pay benefits, and providing registered wage information to government entities that verify employers' declarations under the law.",
                    F_P6="Government entities that verify employers' declarations under the law, including the Zakat, Tax and Customs Authority; other government entities where a law requires disclosure.",
                )],
            },
        ],
        "expected_checks": {"CD-04": "inconsistent"},
    },
    {
        "id": "C10",
        "slug": "vague-purpose-arabic",
        "title": "التحقق من الالتزام الضريبي للموردين",
        "covers": "Arabic documents; request purpose stated only in general terms",
        "position": "ENDORSED",
        "documents": [
            {
                "file": "request-form.pdf", "kind": "REQUEST_FORM", "side": "requester", "lang": "ar",
                "heading": "نموذج طلب مشاركة بيانات",
                "pages": [{
                    "F-R6": parties("ar", "moh", "zatca"),
                    "F-R1": "لأغراض حكومية عامة.",
                    "F-R3": "التعاقد مع الموردين الملتزمين بالتزاماتهم الضريبية فقط، وفق ما يتطلبه نظام المنافسات والمشتريات الحكومية.",
                    "F-R2": basis("ar", "", "نظام المنافسات والمشتريات الحكومية"),
                    "F-R4": "اسم مالك المنشأة، رقم هويته الوطنية، الرقم الضريبي، حالة التسجيل في ضريبة القيمة المضافة.",
                    "F-R5": "تحفظ حتى انتهاء عقد التوريد المرتبط بها، ثم تتلف.",
                }],
            },
            {
                "file": "ropa.pdf", "kind": "ROPA", "side": "provider", "lang": "ar",
                "heading": "سجل أنشطة معالجة البيانات الشخصية — قيد",
                "pages": [{
                    "F-P1": controller("ar", "zatca"),
                    "F-P2": "تسجيل المكلفين في ضريبة القيمة المضافة والتحقق من إقراراتهم ومدفوعاتهم، وتمكين الجهات الحكومية المتعاقدة من التحقق من حالة تسجيل مورديها.",
                    "F-P3": "معالجة يقتضيها تنفيذ نظام ضريبة القيمة المضافة.",
                    "F-P4": "اسم مالك المنشأة، رقم هويته الوطنية، الرقم الضريبي، حالة التسجيل في ضريبة القيمة المضافة، الإقرارات الضريبية، المدفوعات.",
                    "F-P5": "المكلفون المسجلون في ضريبة القيمة المضافة من الأفراد وملاك المنشآت الفردية.",
                    "F-P6": "الجهات الحكومية التي تتعاقد مع الموردين للتحقق من حالتهم الضريبية، والجهات الحكومية الأخرى متى أوجب نظام الإفصاح.",
                    "F-P7": NO_TRANSFER["ar"],
                    "F-P8": "تحفظ السجلات عشر سنوات بعد نهاية السنة الضريبية التي تخصها.",
                }],
            },
        ],
        "expected_checks": {"FL-01": "failed", "PC-01": "indeterminate"},
    },
]

# --- Rendering --------------------------------------------------------------

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
.line { display: block; }
"""


def render_html(doc: dict, case: dict, page: dict, first: bool) -> str:
    """One A4 sheet: the mark at top and bottom, then the page's fields."""
    lang = doc["lang"]
    rtl = lang == "ar"
    mark = f"{MARK_EN} · {MARK_AR}"
    labels = LABELS[lang]
    if rtl:
        meta = "وثيقة اصطناعية أعدت لاختبار النظام. لا تحتوي على بيانات أشخاص حقيقيين."
    else:
        meta = "Synthetic document prepared for testing. It contains no real person's data."
    parts = [f'<div class="sheet"><div class="mark top">{mark}</div>']
    if first:
        parts.append(f"<h1>{html.escape(doc['heading'])}</h1>")
        parts.append(f'<div class="meta">{html.escape(case["title"])}<br>{html.escape(meta)}</div>')
    for field_id, text in page.items():
        parts.append(
            f'<p class="field"><span class="label">{html.escape(labels[field_id])}</span>'
            + "".join(f'<span class="line" dir="auto">{html.escape(line)}</span>' for line in text.split("\n"))
            + "</p>"
        )
    parts.append(f'<div class="mark bottom">{mark}</div></div>')
    return (
        f'<!DOCTYPE html><html lang="{lang}" dir="{"rtl" if rtl else "ltr"}"><head><meta charset="utf-8">'
        f"<title>{html.escape(doc['heading'])}</title><style>{CSS}</style></head><body>"
        f"{''.join(parts)}</body></html>"
    )


def chrome_pdf(html_text: str, out: Path, tmp: Path) -> None:
    src = tmp / (out.stem + ".html")
    src.write_text(html_text, encoding="utf-8")
    subprocess.run(
        [
            "google-chrome", "--headless", "--no-sandbox", "--disable-gpu",
            "--no-pdf-header-footer", f"--print-to-pdf={out}", src.as_uri(),
        ],
        check=True, capture_output=True,
    )


def scan_page(pdf_page: Path, out_pdf: Path, tmp: Path, seed: int) -> None:
    """Rasterise a one-page PDF and make it look scanned, with no text layer."""
    stem = tmp / "scan"
    subprocess.run(["pdftoppm", "-r", "150", "-gray", "-png", "-singlefile", str(pdf_page), str(stem)], check=True)
    img = Image.open(f"{stem}.png").convert("L")
    rnd = random.Random(seed)
    img = img.rotate(rnd.uniform(-0.8, 0.8), expand=False, fillcolor=255, resample=Image.BICUBIC)
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    px = img.load()
    w, h = img.size
    for _ in range(w * h // 300):
        x, y = rnd.randrange(w), rnd.randrange(h)
        px[x, y] = rnd.choice((170, 200, 230))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=70)
    a4 = (img2pdf.mm_to_pt(210), img2pdf.mm_to_pt(297))
    out_pdf.write_bytes(img2pdf.convert(buf.getvalue(), layout_fun=img2pdf.get_layout_fun(a4)))


def build_document(case: dict, doc: dict, case_dir: Path, tmp: Path) -> None:
    scanned = set(doc.get("scanned", []))
    writer = PdfWriter()
    for i, page in enumerate(doc["pages"]):
        one = tmp / f"{case['id']}-{Path(doc['file']).stem}-p{i}.pdf"
        chrome_pdf(render_html(doc, case, page, first=i == 0), one, tmp)
        if i in scanned:
            scanned_pdf = one.with_name(one.stem + "-scan.pdf")
            scan_page(one, scanned_pdf, tmp, seed=int(case["id"][1:]) * 10 + i)
            one = scanned_pdf
        for p in PdfReader(one).pages:
            writer.add_page(p)
    writer.add_metadata({"/Title": doc["heading"], "/Subject": MARK_EN})
    with (case_dir / doc["file"]).open("wb") as fh:
        writer.write(fh)


# --- Expectations -----------------------------------------------------------

def list_items(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"[,،]", text.rstrip(".")) if p.strip()]


def expected_fields(doc: dict) -> dict:
    ids = REQUESTER_FIELDS if doc["side"] == "requester" else PROVIDER_FIELDS
    scanned = set(doc.get("scanned", []))
    readable = {}
    unreadable = set()
    for i, page in enumerate(doc["pages"]):
        for field_id, text in page.items():
            (unreadable.add(field_id) if i in scanned else readable.__setitem__(field_id, text))
    out = {}
    for field_id in ids:
        if field_id in readable:
            text = readable[field_id]
            entry = {"state": "found", "quote": text.replace("\n", " ")}
            if field_id in ("F-R4", "F-P4"):
                entry["items"] = list_items(text)
            out[field_id] = entry
        elif scanned:
            # A field that could only come from an unreadable page is ambiguous
            # (spec §2.1, §3.3).
            out[field_id] = {"state": "ambiguous"}
        else:
            out[field_id] = {"state": "not_found"}
    return out


def expected_case(case: dict) -> dict:
    checks = {c: ("compatible" if c == "PC-01" else "passed") for c in CHECKS}
    checks.update(case["expected_checks"])
    all_pass = all(r in PASSING for r in checks.values())
    outcome = "APPROVED" if all_pass and case["position"] == "ENDORSED" else "FLAGGED"
    reasons = [c for c, r in checks.items() if r not in PASSING]
    if case["position"] == "OBJECTED":
        reasons.append("PROVIDER_OBJECTION")
    return {
        "case": case["id"],
        "slug": case["slug"],
        "covers": case["covers"],
        "rule_set_version": RULE_SET_VERSION,
        "title": case["title"],
        "position": case["position"],
        "objection": case.get("objection"),
        "documents": [
            {
                "file": d["file"],
                "kind": d["kind"],
                "language": d["lang"],
                "pages": len(d["pages"]),
                "scanned_pages": [p + 1 for p in d.get("scanned", [])],
                "fields": expected_fields(d),
            }
            for d in case["documents"]
        ],
        "checks": checks,
        "outcome": outcome,
        "flag_reasons": reasons,
    }


# --- Self-check -------------------------------------------------------------

BIDI_CONTROLS = dict.fromkeys(map(ord, "\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\u0640"))


def norm(text: str) -> str:
    """How quotes are compared: NFKC (folds Arabic presentation forms, the
    lam-alef ligature and Latin ligatures such as "ffi"), no bidi controls or
    tatweel, a hyphen at a line break joined, whitespace collapsed."""
    text = unicodedata.normalize("NFKC", text).translate(BIDI_CONTROLS)
    text = re.sub(r"-\n\s*", "-", text)  # a hyphen at a line break joins the word
    return re.sub(r"\s+", " ", text).strip()


def page_text(pdf: Path) -> list[str]:
    return [p.extract_text() or "" for p in PdfReader(pdf).pages]


def verify(case_dir: Path, exp: dict) -> list[str]:
    problems = []
    for d in exp["documents"]:
        pdf = case_dir / d["file"]
        pages = page_text(pdf)
        if len(pages) != d["pages"]:
            problems.append(f"{pdf.name}: {len(pages)} pages, expected {d['pages']}")
        for n, text in enumerate(pages, start=1):
            if n in d["scanned_pages"]:
                if text.strip():
                    problems.append(f"{pdf.name} p{n}: scanned page has a text layer")
            elif MARK_EN not in norm(text):
                problems.append(f"{pdf.name} p{n}: missing '{MARK_EN}' mark")
        full = norm(" ".join(pages))
        for field_id, f in d["fields"].items():
            if f["state"] == "found" and norm(f["quote"]) not in full:
                problems.append(f"{pdf.name} {field_id}: quote not found in extracted text")
    return problems


def main() -> None:
    for old in HERE.glob("C[0-9][0-9]-*"):
        shutil.rmtree(old)
    index = []
    all_problems = []
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        for case in CASES:
            case_dir = HERE / f"{case['id']}-{case['slug']}"
            case_dir.mkdir()
            for doc in case["documents"]:
                build_document(case, doc, case_dir, tmp)
            exp = expected_case(case)
            (case_dir / "expected.json").write_text(json.dumps(exp, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            problems = verify(case_dir, exp)
            all_problems += [f"{case['id']}: {p}" for p in problems]
            index.append({"case": case["id"], "folder": case_dir.name, "covers": case["covers"],
                          "position": case["position"], "outcome": exp["outcome"],
                          "not_passing": [c for c in exp["checks"] if exp["checks"][c] not in PASSING]})
    (HERE / "index.json").write_text(json.dumps({"rule_set_version": RULE_SET_VERSION, "cases": index},
                                                ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if all_problems:
        raise SystemExit("Self-check failed:\n" + "\n".join(all_problems))
    print(f"Built {len(CASES)} cases; self-check passed.")


if __name__ == "__main__":
    main()
