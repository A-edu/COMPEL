Write specs/sprint-3.md for Sprint 3 of COMPEL. Then update AGENTS.md and CLAUDE.md so they point to specs/sprint-3.md as the current sprint spec, and add the Sprint 3 story definitions below to docs/backlog.md. Do not change any other rule in AGENTS.md in this task: the rule changes this sprint needs go in the spec as a foundation task (see "Standing rules" below).

## How to write this spec
Write it at the same level as sprint-2.md. Describe what each story must achieve and why it matters, and leave design and implementation to whoever builds it. Do not specify endpoints, components, table structures, prompts, libraries or file layouts. Acceptance criteria must describe behaviour a user or tester can observe, not implementation steps.

Read specs/sprint-1.md and specs/sprint-2.md for section numbering and conventions. Read the codebase so the spec doesn't contradict what Sprints 1 and 2 built, especially the request statuses, the findings (flag reason) record, the flag sources, how a request comes to count as flagged (worked out from its flag reasons, not stored), how an officer's decision is recorded, the officer case view and the notification emails. Sprint 3 extends these and must not replace them. Don't describe that code in the spec.

If something can't be settled from the repo or from this prompt, list it under "Open questions" at the end of the spec instead of guessing.

## Sprint 3 scope
Sprint 1 delivered entity login, request and RoPA submission, the provider's position, and entity isolation. Sprint 2 delivered the compliance officer's side (login, review queue and case view, final decisions, stored decision records), reminders and notification emails. A provider objection is currently the only reason a request gets flagged.

Sprint 3 builds the agentic pipeline. All seven stories are committed. List them in dependency order so a slip shows early: US-07, then US-08, US-09 and US-10, then US-11, US-12 and US-21.

US-07 Automated field extraction (Must)
The system extracts the defined fields (purpose, legal basis, data categories, retention period, and any others the rule set needs) from the submitted documents and the RoPA entry. Extraction happens once, and every later check reuses it.

US-08 Field-level compliance check (Must)
Each extracted field is checked against the PDPL article or Implementing Regulation clause it relates to. For each field the result is passed, failed or not found.

US-09 Cross-document consistency check (Must)
The system compares the same information across all documents submitted for a request. It flags any mismatch, and any information present in one document but missing from another.

US-10 Purpose compatibility (Must)
The system compares the requesting entity's stated purpose with the original collection purpose and legal basis in the providing entity's RoPA entry. The result is compatible, incompatible or indeterminate. Incompatible and indeterminate results show both purposes side by side.

US-11 Auto-clear or flag (Must)
Every request that goes through the pipeline ends with exactly one outcome, auto-cleared or flagged, based on the check results and the providing entity's position.

US-12 Check report (Must)
The system produces a report listing every check performed, its result and its PDPL clause. For a flagged request, it adds a summary of why the request was not auto-cleared.

US-21 Correction on a flagged request (Could, committed this sprint)
The providing entity can submit a correction to its RoPA entry on a flagged request. The correction is kept alongside the original documents, and the affected checks run again.

## Settled decisions (state these in the spec)
- Inputs. The pipeline accepts digital PDFs (with a text layer) in English and Arabic. There is no OCR. A field that could only come from a scanned or unreadable page is treated as ambiguous, and that sends the request to the officer. Uploads still accept DOCX as before, but the pipeline does not read it: a DOCX is treated as unreadable in the same way. So is a document too large to process in one model call.
- Model. Every model-assisted step uses Claude Haiku 5.5 (claude-haiku-5-5) through the Anthropic API. The model is a configuration setting, not hard-coded, and can be changed per step without touching the pipeline. Each document is processed in its own model call, which keeps prompts well under the 100,000-token price tier. Checks that span documents (consistency and purpose compatibility) work on the values already extracted, not by sending several documents in one call. The API key comes from environment secrets in both the workspace and the published app, and is never committed.
- When it runs. The pipeline starts once the providing entity has submitted both its RoPA entry and its position. It runs in the background, never inside a user's web request. While it runs, the request visibly shows that it is under automated review. A run that fails or is interrupted must never leave a request stuck: it ends as flagged, with the failure as the reason.
- Outcome rule. A request is auto-cleared (approved by the system) only if every check passed and the provider endorsed it. Anything else flags it: a failed, not-found, ambiguous, indeterminate or inconsistent result, a provider objection, or a pipeline error. The system never rejects a request. Only an officer can reject. The existing provider-objection flag source keeps working, and the pipeline's checks become another flag source feeding the same findings record and outcome decision.
- System decisions. An auto-clear is recorded as a decision like any other: final, permanent, and never changed afterwards. Its record says it was made by the system, not by an officer, and the check report takes the place of a written justification. The system can only approve. This supersedes, for this one case, Sprint 2 §2.6 (a decision is possible only on a flagged request) and §3.3 (a record names the officer and holds a 10 to 1000 character justification). Officer decisions are unchanged.
- What the requester sees. A request that was not auto-cleared shows the requester "Under review" until an officer decides it, the same label the provider already sees for a flagged request. The requester still never learns why: not the position, the RoPA entry, the flag reasons or the findings on the RoPA. Because checks now flag requests too, a flag no longer implies an objection. This supersedes Sprint 2 §2.5 and the requester's "Responded" label for flagged requests in §3.1.
- Evidence. Every extracted value carries the exact text it came from, and the system confirms that text really appears in the document. A value that can't be confirmed is not treated as found. "Not found" is a correct answer, and the extractor must never fill in a missing field. Missing information must never lead to auto-clearing.
- Traceability. The stored extraction records which model and which version of the extraction instructions produced it. Every check finding cites a clause and records which rule-set version it used.
- Rule set. The mapping of fields and checks to PDPL clauses is a single, versioned rule set, drafted from PDPL Article 31 and Implementing Regulation Article 33(3). The spec must say that the team reviews and approves the rule set before any check relies on it, and must mark the draft as awaiting approval.
- Case view. The extracted-fields panel deferred in Sprint 2 is now in scope. The officer sees the extracted fields with the text they came from, the findings and the clause citations.
- Report. The officer sees the full report in the case view. The provider sees the full report on its request page. The requester sees a reduced copy, and only once the request has an outcome: the checks on its own documents, their results and clauses, and the outcome. The reduced copy never includes anything from the RoPA entry, the purpose comparison, the provider's position or objection, or the summary of why the request was not auto-cleared. The full report is stored permanently with the request's decision record, whether the decision came from the system or an officer. This completes US-13.
- Corrections. Only the providing entity can correct, and only its RoPA entry, while the request is flagged and has no decision yet. The requester cannot correct; problems in its documents are for the officer to decide. The provider cannot change its position: Sprint 1 §2.7 stands, so a request the provider objected to always goes to an officer, and a correction only fixes the RoPA. The originals are kept, only the affected checks re-run, and the same outcome rule then applies again. Findings that a re-run replaces are marked superseded: they stay on the request as history, the case view shows them as superseded, and they no longer count towards the request being flagged. A correction never supersedes a provider objection.
- Officer view during automated review. A request under automated review appears in the officer's review queue as under automated review, like a pending request: the officer can open and follow it but cannot decide it.
- Notifications. Status changes caused by the pipeline trigger the existing status emails, under the same rule: reference and status or outcome only. This includes the requester's change to "Under review", which supersedes the Sprint 2 §10.2 rule that a request becoming flagged sends the requester nothing.
- Existing data. Only provider responses submitted after this sprint's release go through the pipeline. Existing requests keep their current status and findings, with no backfill. Seeded requests count as existing: the seed never starts the pipeline, so starting the published app makes no model calls. The sprint demo shows the pipeline on requests submitted live.
- Data handling. Documents are sent to an external model provider. This is acceptable only because all data in COMPEL is synthetic. State it in the spec as a known limitation.

## Supporting work (include as technical tasks)
- Draft the rule set described above, for team approval.
- A labelled synthetic dataset of 10 cases. Each case is a request form, any supporting documents and a RoPA entry, marked as synthetic, with the expected extracted values, check results and outcome. Together the cases cover: a clean case that should auto-clear, a missing field, a contradiction between documents, an incompatible purpose, an indeterminate purpose, Arabic documents, and a scanned page.
- A repeatable evaluation run over the dataset. It reports per-field extraction accuracy, the number of fields wrongly reported as found, and how often the outcome matches the expected one. Rerunning it after a prompt or model change must be one command.
- Automated tests never call the real model. A stand-in replaces it, so the test suite runs without an API key.
- Standing rules, as a foundation task done before the stories that depend on it, like Sprint 2 §5.2. The decisions above conflict with AGENTS.md, which wins on rules, so the spec lists the changes needed and they are made with the team's approval of the wording. Access rule 3: the requester sees "Under review" for a request that was not auto-cleared, and once there is an outcome sees the reduced report; it still never sees the RoPA document, the position, the flag reasons or the justification. Access rule 5: officers can also reach requests under automated review, without deciding them. Access rule 6: only compliance officers record decisions on flagged requests, and the system records only auto-clear approvals under the outcome rule. Terminology: "Decision" covers system decisions. Done when AGENTS.md says this and no rule contradicts the spec.

## Requirements to state in the spec
State these as outcomes and leave the design open:
- Entity isolation still holds for the report, extracted fields and corrections. An entity user sees only requests their entity is a party to. The requester sees only the reduced report and never the provider's RoPA, position, objection or flag reasons. Only compliance officers record decisions on flagged requests, and only they can reject; the system only approves, under the outcome rule.
- Anything shared between stories is decided once and recorded in the spec when it is decided, so parallel work stays consistent. This covers new statuses, the shape of findings from the pipeline, the extraction record and the rule set.
- Findings from the pipeline fit the existing findings record without changes to the officer's decision flow.

## Out of scope
End the spec with an "Out of scope" section: OCR, Word documents, the system rejecting requests on its own, running the pipeline over existing requests, corrections outside the flagged state, corrections by the requesting entity, and any model-provider change beyond the configuration setting.
