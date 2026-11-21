# COMPEL rule set

| | |
|---|---|
| **Version** | 1.1 |
| **Status** | Approved |
| **Drafted** | 2026-11-21 |
| **Approved** | 2026-11-21, by the team (`specs/sprint-3.md` §14) |
| **Changed** | 1.1, 2026-11-21: FL-10 clarified (§4.1; spec §14) |

The rule set is the single statement of which fields the pipeline extracts, which checks run on them, what passing means, and which PDPL article or Implementing Regulation clause each check cites (`specs/sprint-3.md` §3.4). Every finding records the version it used. When this file changes after approval, the version goes up and the change is logged in §14 of the current spec. Rule IDs (`F-…`, `FL-…`, `CD-…`, `PC-…`) never change meaning and are never reused.

## 1. Legal sources

| Instrument | Provisions used | Text checked against | Status on 2026-11-21 |
|---|---|---|---|
| Personal Data Protection Law (Royal Decree M/19, amended by M/148) — "the Law" | Art 10, Art 11(1), Art 15, Art 18, Art 31 | Official English text published on misa.gov.sa | In force. Art 31 is not repealed (only Art 32 is marked repealed). |
| Implementing Regulation of the Law (2023) — "the Regulation" or "IR" | Art 16, Art 18, Art 20, Art 21, Art 33 | SDAIA's English Regulation PDF and the Istitlaa consultation page showing the current text | In force since 14 Sep 2024. |
| SDAIA draft amendments to the Regulation | — | Istitlaa consultation, 6 Oct – 5 Nov 2026 | **Proposed, not in force.** Would delete IR Art 33(5), the list of what a record must contain. See §6, risk R1. |

English translations are not authoritative; the Arabic text prevails. Checking every citation in this file against the official Arabic text is still open (spec §15, question 7).

**Correction to the spec (applied, D2).** The spec cited "Implementing Regulation Article 33(3)" for the contents of a RoPA. In the current text, Art 33(3) only says the records must be accurate and up to date. The minimum contents are in **Art 33(5)**, items (a) to (h). This rule set cites 33(5) for contents and 33(3) for accuracy.

## 2. Documents

| Document | Submitted by | Role in the checks |
|---|---|---|
| Request form | Requesting entity | Main statement of the request. Expected to state every requester field. |
| Supporting documents | Requesting entity | Optional. A field is read from them only if they state it. |
| RoPA entry | Providing entity | The provider's record for the requested data. Expected to state every provider field. |

## 3. Fields to extract

The requester and the provider describe different things: why the data is wanted, versus why it was collected. So fields are split by side, and a check compares across sides only where the meaning is the same.

**Requester fields** (from the request form and any supporting document that states them)

| ID | Field | What to capture |
|---|---|---|
| F-R1 | Request purpose | What the requester will use the data for |
| F-R2 | Request legal basis | The ground relied on for the disclosure (e.g. a public entity's request for a public interest, or another law) |
| F-R3 | Public interest and mandate | The public interest the request serves, and the law or decision that gives the requester that function |
| F-R4 | Requested data categories | The types of personal data asked for |
| F-R5 | Requester retention period | How long the requester will keep the data, or the event that ends retention |
| F-R6 | Parties | The requesting entity and providing entity, as named in the document |

**Provider fields** (from the RoPA entry)

| ID | Field | What to capture |
|---|---|---|
| F-P1 | Controller and contact details | The controller's name and how to contact it |
| F-P2 | Collection purpose | The purpose the data was collected and processed for |
| F-P3 | Collection legal basis | The legal basis the data was collected on |
| F-P4 | Held data categories | The categories of personal data held |
| F-P5 | Data subject categories | The categories of people the data is about |
| F-P6 | Recipients | The entities, or categories of entities, the data has been or will be disclosed to |
| F-P7 | Transfer outside the Kingdom | Whether the data is or will be transferred or disclosed outside the Kingdom, and if so its basis and recipients |
| F-P8 | Retention period | How long the data is kept, per category where given |

Each field is recorded per document as found (with the exact source text), not found or ambiguous (spec §3.3).

## 4. Checks

### 4.1 Field-level checks (US-08, spec §7.1)

Results: passed, failed, not found, or ambiguous when the field was extracted as ambiguous. Ambiguous never passes. "Requester sees" marks the checks that involve only the requester's own documents, so they appear in the reduced report (spec §3.6).

| ID | Field | Passes when | Fails when | Cites | Requester sees |
|---|---|---|---|---|---|
| FL-01 | F-R1 Request purpose | A specific purpose is stated: a defined activity, not a general aim | Stated only in general terms (e.g. "government purposes", "any lawful use") | IR Art 21(1) | Yes |
| FL-02 | F-R3 Public interest and mandate | The public interest is stated and a specific law, regulation or decision is named as the requester's mandate | Interest stated but no mandate named, or the mandate named is unrelated to the interest | IR Art 21(2) | Yes |
| FL-03 | F-R2 Request legal basis | The basis is one of the disclosure cases in Law Art 15 that a public entity can rely on | The basis is not an Art 15 case, or is legitimate interest (not available to a public entity: IR Art 16) | Law Art 15; IR Art 16 | Yes |
| FL-04 | F-R4 Requested data categories | The types of data are listed specifically | Only a vague description ("all relevant data", "the full record") | IR Art 20(3)(b) | Yes |
| FL-05 | F-R5 Requester retention period | A definite period, or a defined event that ends retention | "Indefinitely", "as long as needed", or similar | Law Art 18 | Yes |
| FL-06 | F-P1 Controller and contact details | Both a name and a contact detail are stated | Name or contact detail missing | Law Art 31(1); IR Art 33(5)(a) | No |
| FL-07 | F-P2 Collection purpose | A specific purpose is stated | Stated only in general terms | Law Art 31(2); IR Art 33(5)(c) | No |
| FL-08 | F-P4 Held data categories | Categories are stated | — (absent gives not found) | IR Art 33(5)(d) | No |
| FL-09 | F-P5 Data subject categories | Categories are stated | — (absent gives not found) | Law Art 31(3); IR Art 33(5)(d) | No |
| FL-10 | F-P6 Recipients | Recipients are stated **and** include the requesting entity, or a category it clearly belongs to | Recipients stated but the requesting entity is not among them | Law Art 31(4); IR Art 33(5)(f); IR Art 20(6) | No |
| FL-11 | F-P7 Transfer outside the Kingdom | The entry says whether there is a transfer; if there is, it gives the basis and recipients | Says there is a transfer but gives no basis or recipients | Law Art 31(5); IR Art 33(5)(g) | No |
| FL-12 | F-P8 Retention period | A period, or the criteria that set it, is stated | "Indefinitely" or similar | Law Art 31(6); IR Art 33(5)(e) | No |

**FL-10: who, not when or why (1.1).** FL-10 asks only who the recipients are. The requesting entity belongs to a category when it is the kind of entity the category names; every party to a request is a Saudi government entity, so it belongs to "government entities". A condition or purpose attached to a category, such as "where a law requires disclosure", is not part of FL-10, and the request does not have to show it is met: whether the request's purpose fits is PC-01's question. Version 1.0 left this unsaid, and the model failed requests whose requester plainly belongs to the category.

F-P3 (collection legal basis) has no field-level check, because no provision requires a RoPA to state it. It is extracted only for the purpose compatibility check, PC-01. See decision D3.

### 4.2 Cross-document consistency checks (US-09, spec §7.2)

Results: passed or inconsistent. An inconsistent finding names the documents and quotes each value.

| ID | Compares | Passes when | Inconsistent when | Cites | Requester sees |
|---|---|---|---|---|---|
| CD-01 | F-R6 Parties across the request form and supporting documents, and with the RoPA controller (F-P1) | Every document names the same requesting and providing entity, and the RoPA's controller is the providing entity | Any document names a different entity | IR Art 33(3) | No (involves the RoPA) |
| CD-02 | F-R1 Request purpose across requester documents | Every requester document that states a purpose states the same one | Two documents state different purposes | IR Art 21(1) | Yes |
| CD-03 | F-R4 Requested data categories across requester documents | All requester documents that list categories list the same ones | Lists differ | IR Art 20(3)(b) | Yes |
| CD-04 | F-R4 Requested categories against F-P4 Held categories | Every requested category is among the categories the RoPA records | A requested category does not appear in the RoPA | IR Art 33(3); IR Art 33(5)(d) | No (involves the RoPA) |
| CD-05 | F-R5 Requester retention period across requester documents | All requester documents that state a period state the same one | Periods differ | Law Art 18 | Yes |

**Missing from one document.** US-09 says information present in one document but missing from another is inconsistent. Supporting documents are optional and rarely restate everything, so this rule set applies that rule only to the request form: a field stated in a supporting document but missing from the request form is inconsistent. A field the request form states that a supporting document doesn't mention is not inconsistent. See decision D4.

### 4.3 Purpose compatibility (US-10, spec §7.3)

| ID | Compares | Cites |
|---|---|---|
| PC-01 | F-R1 Request purpose against F-P2 Collection purpose and F-P3 Collection legal basis | Law Art 10; Law Art 11(1); IR Art 18; IR Art 21(1) |

- **Compatible:** the request purpose is the same as the collection purpose, or directly linked to it (Law Art 11(1)), and nothing in the collection legal basis limits the data to a different use. For example, data collected on consent for one named service, requested for another use, is not compatible.
- **Incompatible:** both purposes are clear and the request purpose is unrelated to the collection purpose, or the collection legal basis rules the new use out.
- **Indeterminate:** either purpose, or the collection legal basis, is not found or ambiguous, or a purpose is too general to compare.

Incompatible does not mean unlawful. Law Art 10 lets a public entity process data for another purpose in some cases (e.g. public interest, or to implement another law). Whether such an exception applies is a legal judgement, so an incompatible result goes to an officer rather than being decided by the system.

## 5. Results and the outcome

- A field extracted as not found gives not found on its field-level check. A field extracted as ambiguous gives ambiguous.
- Every result other than passed or compatible raises a flag reason (spec §3.2). The outcome rule is unchanged (spec §2.4, §8): a request is auto-cleared only if every check above passed or was compatible and the provider endorsed it.

## 6. Left out of version 1.0

| Item | Why it is left out |
|---|---|
| DPO details in the RoPA (IR Art 33(5)(b)) | Required only "where required" by Art 32, which the documents can't show. Checking it would flag requests that need no DPO. |
| Security measures in the RoPA (IR Art 33(5)(h)) | Required only "where possible", so absence isn't a breach. |
| Data minimisation (Law Art 11; IR Art 21(5)) | Whether the data asked for is the minimum necessary is a judgement for an officer, not a field check. |
| IR Art 20(2) disclosure conditions | That paragraph excludes disclosures under Law Art 15(3) and (4), which covers most requests between government entities. |

**Risks**

- **R1 — Pending amendment.** If SDAIA adopts its draft, IR Art 33(5) is deleted. FL-06, FL-07, FL-09, FL-10, FL-11 and FL-12 still stand on Law Art 31. FL-08 and CD-04 cite only IR Art 33(5)(d) for the RoPA's data categories, so they would need a new citation or would be dropped. Re-check before the final demo.
- **R2 — Translations.** Article and paragraph numbers were read from English texts. They still need confirming against the Arabic.

## 7. Decisions taken at approval (2026-11-21)

| # | Question | Decided |
|---|---|---|
| D1 | Spec §2.10 says the rule set is drafted from Law Art 31 and IR Art 33(3). The checks above need more provisions: Law Art 10, 11, 15 and 18, and IR Art 16, 18, 20 and 21. Allow them? | Yes. Without them there is no clause for the requester's fields or for purpose compatibility. |
| D2 | Correct "IR Art 33(3)" to "IR Art 33(5)" in spec §2.10, §3.4 and §5.3, and in the project overview. | Yes. |
| D3 | F-P3 (collection legal basis) is needed for PC-01 but has no field-level check. Spec §7.1 says every field the rule set names is checked. | Allow "extract-only" fields used by another check, and add one line to §7.1. |
| D4 | How strict is "missing from another document" (§4.2)? | Apply it only against the request form, as described in §4.2. |
| D5 | Field-level checks return "ambiguous" for an ambiguous field. Spec §7.1 lists only passed, failed and not found. | Allow ambiguous, already in §3.2's result list. Adjust §7.1's wording. |
| D6 | Version numbering. | The draft was 0.1; the approved version is 1.0. |
