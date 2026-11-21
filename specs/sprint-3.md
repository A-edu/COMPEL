# Sprint 3 spec — COMPEL

What Sprint 3 must achieve, and why. Standing rules (access rules, auth invariants, email safety, storage, design system, working rules) are in `AGENTS.md` and are not repeated here. `specs/sprint-1.md` and `specs/sprint-2.md` remain the record of what those sprints delivered.

**This spec sets outcomes, not designs.** It says what each story must achieve and how a tester can tell. Endpoints, screens, tables, prompts, libraries and file layout are for whoever builds the story. §3 and §4 therefore describe shared concepts and behaviour rather than a schema or an API.

**Story definitions** live in `docs/backlog.md`. Read a story's definition before building it. This spec adds what is specific to Sprint 3; if the two disagree, stop and ask.

**Section numbers are stable.** Handovers and prompts reference them. Add new material as new sub-sections or at the end; never renumber. Record every change in §14.

## Progress

- [x] §5.1 Shared decisions recorded
- [x] §5.2 Standing rules reconciled
- [x] §5.3 Rule set drafted and approved
- [x] §5.4 Labelled synthetic dataset
- [ ] §5.5 Evaluation run
- [ ] §5.6 Model access and test stand-in
- [x] §5.7 Existing data and seed
- [x] §6 Automated field extraction
- [x] §7.1 Field-level compliance check
- [ ] §7.2 Cross-document consistency check
- [ ] §7.3 Purpose compatibility
- [ ] §8 Auto-clear or flag
- [ ] §9.1 Check report
- [ ] §9.2 Case view: extracted fields and findings
- [x] §9.3 Stored check reports
- [ ] §10 Correction on a flagged request
- [ ] §12 Access and isolation tests

§11 Notifications is deferred: it is built with Sprint 2 §9 and §10, after Sprint 3.

---

## §1 Scope

Sprint 2 gave every flagged request an accountable end, but a request is still flagged for only one reason: the provider objected. Nothing reads the documents. An endorsed request is never checked against the PDPL and never gets an outcome. Sprint 3 builds the agentic pipeline: it reads the documents, checks them against the law, clears the requests that pass and sends everything else to an officer with the evidence.

All seven stories are committed. They are listed in dependency order, so a slip shows early.

| Story | Priority | What it achieves in Sprint 3 | Why it matters | Built in |
|---|---|---|---|---|
| US-07 | Must | The fields each check needs are read from the documents once, with the text they came from | Every check depends on it, and a value nobody can trace can't be trusted | §6 |
| US-08 | Must | Each field is checked against the PDPL clause it relates to | This is the compliance check the project exists for | §7.1 |
| US-09 | Must | The same information is compared across all documents of a request | A request that says one thing and a RoPA that says another can't both be right | §7.2 |
| US-10 | Must | The requester's purpose is compared with the purpose the data was collected for | Sharing for an incompatible purpose is the core PDPL risk | §7.3 |
| US-11 | Must | Every checked request ends auto-cleared or flagged | Clean requests stop waiting for a person; doubtful ones always reach one | §8 |
| US-12 | Must | A report lists every check, its result and its clause | An outcome must be explainable, whoever reached it | §9.1, §9.2 |
| US-13 | Must | The report is stored with the decision for good (completes Sprint 2's US-13) | The reasoning behind an outcome must be answerable later | §9.3 |
| US-21 | Could, committed | The provider corrects its RoPA entry on a flagged request, and the affected checks run again | A fixable mistake shouldn't need an officer | §10 |

**Sprint 3 is submitted** as the repository link plus the published app's URL.

## §2 Confirmed decisions

1. **Inputs.** The pipeline reads digital PDFs with a text layer, in English and Arabic. There is no OCR. A field that could only come from a scanned or unreadable page is ambiguous, and that sends the request to an officer. Uploads still accept DOCX as before, but the pipeline does not read it: a DOCX is unreadable in the same way. So is a document too large to process in one model call.
2. **Model.** Every model-assisted step uses Claude Haiku 5.5 (`claude-haiku-5-5`) through the Anthropic API. The model is a setting, not hard-coded, and can be changed per step without changing the pipeline. Each document is processed in its own model call, which keeps prompts well under the 100,000-token price tier. Checks that span documents (§7.2, §7.3) work on the values already extracted, not by sending several documents in one call. The API key comes from environment secrets in both the workspace and the published app, and is never committed.
3. **When it runs.** The pipeline starts once the provider has submitted its RoPA entry and its position. It runs in the background, never inside a user's web request. While it runs, the request visibly shows that it is under automated review. A run that fails or is interrupted never leaves a request stuck: it ends flagged, with the failure as the reason.
4. **Outcome rule.** A request is auto-cleared (approved by the system) only if every check passed and the provider endorsed it. Anything else flags it: a failed, not-found, ambiguous, indeterminate or inconsistent result, a provider objection, or a pipeline error. The system never rejects. Only an officer can reject.
5. **The pipeline is another flag source.** The provider's objection keeps working unchanged. The pipeline's findings become a second source, feeding the same flag reasons (Sprint 2 §3.2) and the same officer decision flow, which does not change.
6. **System decisions.** An auto-clear is recorded as a decision like any other: final, permanent and never changed. Its record says the system made it, not an officer, and the check report takes the place of a written justification. The system can only approve. This supersedes, for this one case, Sprint 2 §2.6 (a decision is possible only on a flagged request) and §3.3 (a record names the officer and holds a 10 to 1000 character justification). Officer decisions are unchanged.
7. **What the requester sees.** A request that was not auto-cleared shows the requester "Under review" until an officer decides it, the label the provider already sees for a flagged request. The requester still never learns why: not the position, the RoPA entry, the flag reasons or the findings on the RoPA. Because checks now flag requests too, a flag no longer implies an objection. This supersedes Sprint 2 §2.5 and the requester's "Responded" label for flagged requests in Sprint 2 §3.1.
8. **Evidence.** Every extracted value carries the exact text it came from, and the system confirms that text appears in the document. A value that can't be confirmed is not found. "Not found" is a correct answer; the extractor never fills in a missing field. Missing information never leads to auto-clearing.
9. **Traceability.** A stored extraction records which model and which version of the extraction instructions produced it. Every finding cites a clause and records which rule-set version it used.
10. **One rule set.** The mapping of fields and checks to PDPL clauses is a single, versioned rule set, drafted from PDPL Article 31 and Implementing Regulation Article 33(5), and from the other provisions its checks need (version 1.0 also cites PDPL Articles 10, 11, 15 and 18 and Implementing Regulation Articles 16, 18, 20 and 21). The team reviews and approves it before any check relies on it (§5.3).
11. **Case view.** The extracted-fields panel deferred in Sprint 2 (§2.4) is now in scope. The officer sees the extracted fields with the text they came from, the findings and the clause citations.
12. **Report.** The officer sees the full report on the case view, and the provider sees the full report on its request page. The requester sees a reduced copy, and only once the request has an outcome (§3.6). The full report is stored with the request's decision record, whoever made the decision. This completes US-13, which Sprint 2 §2.7 left waiting for US-12.
13. **Corrections.** Only the provider can correct, and only its RoPA entry, while the request is flagged and undecided. The requester cannot correct; problems in its documents are for the officer to decide. The provider cannot change its position: Sprint 1 §2.7 stands, so a request the provider objected to always reaches an officer. The original is kept, only the affected checks run again, and the outcome rule applies again. Findings a re-run replaces are superseded (§3.2). A correction never supersedes an objection.
14. **Officer view during automated review.** A request under automated review is in the officer's review queue, like a pending request: the officer can open and follow it but cannot decide it.
15. **Notifications are deferred.** Sprint 2's request emails (§9 reminders, §10 notifications) are not built, and will be built after Sprint 3. Sprint 3 sends no request emails. When they are built, status changes caused by the pipeline follow the same rule as Sprint 2 §4.2, reference and status or outcome only, including the requester's change to "Under review". That supersedes the Sprint 2 §10.2 rule that a request becoming flagged sends the requester nothing (§11).
16. **Existing data.** Only provider responses submitted after this sprint's release go through the pipeline. Existing requests keep their status and flag reasons, with no backfill. Seeded requests count as existing: the seed never starts the pipeline, so starting the published app makes no model calls.
17. **Synthetic data only.** Documents are sent to an external model provider. This is acceptable only because all data in COMPEL is synthetic. It is a known limitation: COMPEL could not process real personal data as built.

## §3 Data model: shared concepts

These concepts are shared between stories, so each is decided once and recorded here. Where an entry says **Decided: not yet**, the first person to need it settles it with the team and writes the result in that entry before building on it (§5.1).

### §3.1 Request statuses

Sprint 2 §3.1 left room for Sprint 3 to add stages. Sprint 3 adds one, and changes what the requester sees of another.

| Stage | Meaning | Requester sees | Provider sees | Compliance officer sees |
|---|---|---|---|---|
| Awaiting response (pending) | The provider has not responded | Awaiting response | Awaiting response | Awaiting response, in the review queue, with no decision possible |
| **Under automated review** (new) | The provider responded and the pipeline is running, or running again after a correction | Under automated review | Under automated review | Under automated review, in the review queue, with no decision possible |
| Responded | The provider responded before this sprint's release, and nothing is flagged | Responded | Responded | Nothing |
| Flagged | At least one active flag reason; no decision yet; no run in progress | **Under review** (changed) | Under review | Flagged, in the review queue |
| Decided | A decision is recorded, by an officer or by the system | Approved or Rejected | Approved or Rejected | Approved or Rejected, read-only, showing who decided: an officer or the system |

After release, a provider response never rests at Responded: it moves to Under automated review, and from there to Flagged or Approved.

**Decided:** while a run is in progress, the request is under automated review and not flagged, even if it already carries an objection. It becomes flagged, or is approved, only when the run ends. So an officer can never decide a request mid-run.

**Decided (2026-11-21):** the new stage is a stored status, `UNDER_AUTOMATED_REVIEW`, added to the request status enum. Submitting a provider response, or a correction, sets it; the end of the run moves the request to `PROVIDER_RESPONDED` (flagged, worked out from its active flag reasons) or `APPROVED` (a system decision). Flagged stays worked out from flag reasons rather than stored (Sprint 2 §3.1), and a request whose status is `UNDER_AUTOMATED_REVIEW` is never flagged. Each run is a stored `PipelineRun` record (request, trigger: response or correction, state, start and end time, model, rule-set version), so a run survives restarts and is never repeated or left open (§4.3).

### §3.2 Flag reasons and findings

Sprint 2 §3.2 stands: each flag reason is its own record with its source, its text and when it was raised, and a new source needs nothing more than a new source identifier.

A **finding** is the result of one check on one request. Every finding states the check, its result, the PDPL article or Implementing Regulation clause it cites, the rule-set version it used, and the documents and extracted values it rests on. A finding's result is one of: passed, failed, not found, ambiguous, inconsistent, compatible, incompatible or indeterminate, as the check allows (§7).

**Decided:**
- The pipeline is a new flag source. Every finding other than passed or compatible raises a flag reason from it, and the reason's text says which check failed and why, citing the clause. A pipeline error raises a reason from the same source, saying the automated review could not be completed; it never carries model output, stack traces or secrets.
- Passed findings raise no flag reason but are kept, because the report lists every check (§9.1).
- **Superseded.** When a correction re-runs a check (§10), the earlier finding of that check, and the flag reason it raised, are marked superseded. They stay on the request as history and the case view shows them as superseded, but a superseded reason no longer counts towards the request being flagged. Only pipeline findings can be superseded; an objection never is.
- A flag reason that arrives after a decision still does not reopen it (Sprint 2 §3.2).

**Decided (2026-11-21):**
- Findings are stored as `Finding` records. A flag reason raised by a finding points to it through a nullable, unique `findingId`; a reason from an objection or a pipeline error has none. The pipeline's source identifier is `PIPELINE`.
- Superseded is recorded as a nullable `supersededAt` time on both the finding and its flag reason. Only reasons with no `supersededAt` are active, and only active reasons count towards a request being flagged. Every query that counts or filters flag reasons uses one shared active-reason filter. An objection is never superseded, and existing reasons stay active, so a request flagged only by an objection works exactly as in Sprint 2.
- A pipeline-error reason is superseded when a later run of the same request finishes, so a correction can clear a request whose earlier run failed.

### §3.3 Extraction record

The extraction is the one stored reading of a request's documents. Every later check reuses it (US-07); a check never reads a document again for itself.

**Decided:** for each document and each field the rule set defines, the extraction holds one of:
- **found:** the value, plus the exact text it came from, which the system has confirmed appears in that document
- **not found:** the document does not state it
- **ambiguous:** the field could only come from a page that cannot be read (scanned, unreadable, a DOCX, or too large), or the document states it in conflicting ways

The extraction also records the model and the version of the extraction instructions that produced it, and when it ran. A correction adds a new extraction for the corrected document; the original's stays.

**Decided (2026-11-21):** the field list is the one in the approved rule set (`docs/rule-set.md` §3): six requester fields and eight provider fields. Purpose and legal basis are each split into the requester's (why the data is wanted) and the provider's (why it was collected).

**Decided (2026-11-21):** the extraction step (`extract`) saves, per document, each field as found (value, quote, and items for data categories), not found or ambiguous, with the model and instructions version (`apps/api/src/pipeline/extraction.ts`). Requester documents carry the requester fields, the RoPA entry the provider fields. The checks read it through one reader, which treats a field left out, or a found value with no quote, as not found.

### §3.4 Rule set

The rule set is the single, versioned statement of which fields are extracted, which checks run on them, what passing means, and which PDPL article or Implementing Regulation clause each check cites. It is drafted from PDPL Article 31 and Implementing Regulation Article 33(5), plus the other provisions its checks need (§2.10). It lives in `docs/rule-set.md`.

**Decided:**
- There is one rule set, with a version. Every finding records the version it used, so a later change never changes what a stored finding said.
- No check relies on a version until the team has approved it. The approval and its date are recorded in §14.

**Status: version 1.0 approved by the team on 2026-11-21** (§14). (§5.3)

### §3.5 Decision records

Sprint 2 §3.3 stands for officer decisions. A system decision (§2.6) is a decision record that identifies the request, states the outcome (approved, always), the time, that the system made it, and holds the check report in place of a justification. It belongs to the request and lasts as long as it does, like any other decision record.

**Decided:** one decision per request, for either kind; a system decision can no more be changed or removed than an officer's. Requests decided before this sprint have no check report, and their records stay as they are.

**Decided (2026-11-21):** a decision records who made it (`madeBy`: officer or system) and the full check report as it stood when it was recorded (`report`, §9.3); an officer decision on a request with no pipeline run has none. A database constraint allows a system decision only as an approval with a report and no officer or justification, and an officer decision only with both, so the system cannot record a rejection. Existing decisions are officer decisions.

### §3.6 Check report

The report is what the pipeline found, in a form a person can read: every check performed, its result and its clause. For a flagged request it adds a summary of why the request was not auto-cleared.

**Decided:** there are two views of one report.
- **Full:** every finding, including superseded ones marked as such, and the summary. The officer and the provider see it.
- **Reduced:** for the requester, and only once the request has an outcome. It holds the checks that involve only the requester's own documents, their results and clauses, and the outcome. It leaves out every check that involves the RoPA entry in any way, the purpose comparison, the provider's position or objection, and the summary of why the request was not auto-cleared.

The report reflects the latest run; earlier runs stay visible in the full view as superseded findings. Requests with no pipeline run (§2.16) have no report.

## §4 API contract: shared behaviour

Behaviour every story must share, whichever endpoints it uses.

### §4.1 Access

- Entity isolation holds for extracted fields, findings, reports and corrections exactly as for documents: a DPO reaches them only for requests their entity is a party to. Anyone else learns nothing, and the response is the same whether or not the request exists (AGENTS.md → Access rules).
- The requester never receives anything from the RoPA entry, the position, the objection, the flag reasons, the findings that involve the RoPA, the purpose comparison or the not-cleared summary: not on a screen, in a download, in an API response or in an email. It receives the reduced report (§3.6) once there is an outcome, and nothing of the report before.
- Only the provider can correct, only its RoPA entry, and only while the request is flagged and undecided (§10). The requester is refused as any non-provider party is today; anyone else gets "not found".
- Officers reach pending, under-automated-review, flagged and decided requests. They decide flagged requests only. Nothing in this sprint gives an officer DPO access or a DPO officer access (Sprint 2 §4.1).
- Only compliance officers record decisions on flagged requests, and only they can reject. The system records approvals only, under the outcome rule (§2.4). Nothing a client sends can make the system record a decision.

### §4.2 Email

Sprint 3 sends no request emails (§2.15). When Sprint 2 §9 and §10 are built, after Sprint 3, Sprint 2 §4.2 applies to everything the pipeline changes: one way of sending, through the existing mail setup and its safety switch; reference and status or outcome only; sent after the change is saved, once per change; a mail failure never blocks or undoes the change.

**Decided:** a system decision is an outcome like any other: when outcome emails exist, both parties are told of it exactly as of an officer's decision.

### §4.3 Background work and model calls

- A pipeline run happens in the background, never inside a user's web request. Submitting a response or a correction returns straight away.
- A run happens once per response or correction. Restarts, redeploys and more than one running instance must not lose a run, repeat it or leave a request under automated review for good. A run cut short ends flagged, with a pipeline error as the reason (§2.3).
- **Decided:** the published app stays on Autoscale for Sprint 3 (Sprint 2 §5.4's move to a Reserved VM has not happened). Autoscale stops idle instances, so a run must finish even when nobody is using the app after the response, and a run cut off by a stopped instance is ended, flagged, the next time the app runs.
- Which model each step uses is a setting. Changing it needs no code change. The API key and model settings live in environment secrets, are listed in `.env.example` without values, and are never committed or logged.
- Automated tests never call the real model (§5.6).
- Nothing in the pipeline sends a document anywhere except the configured model provider.

## §5 Foundation

Do this first. Parallel story work depends on it.

### §5.1 Shared decisions

Everything shared between stories is decided once and recorded in this spec, in §3 and §4: the new stage, the shape of findings and how they relate to flag reasons, the extraction record and the rule set.

- **Done when:** every **Decided: not yet** entry holds the team's decision, and each change is listed in §14.

### §5.2 Standing rules

`AGENTS.md` wins over this spec on rules, and several decisions in §2 conflict with it. Agree these changes with the team before building §8 to §10. They change access-rule behaviour, so they need explicit approval of the wording.

- **Access rule 3:** the requester sees "Under review" for a request that was not auto-cleared, and once there is an outcome sees the reduced report (§3.6). It still never sees the RoPA document, the position, the flag reasons or a justification.
- **Access rule 5:** officers can also reach requests under automated review, without deciding them.
- **Access rule 6:** only compliance officers record decisions on flagged requests; the system records only auto-clear approvals under the outcome rule.
- **Terminology:** "Decision" covers system decisions. Add finding, extraction, rule set, check report and correction.
- **Environment variables:** `AGENTS.md` already lists `ANTHROPIC_API_KEY` and one `PIPELINE_MODEL` (default `claude-haiku-5-5`). §2.2 needs the model to be settable per step, so the list must also cover the per-step settings, and `.env.example` must match it.

- **Done when:** `AGENTS.md` says this with the approved wording, and no rule contradicts the spec.

### §5.3 Rule set

The rule set (§3.4) drafted from PDPL Article 31 and Implementing Regulation Article 33(5), for the team to review.

- **Done when:** the draft names every field to extract, every check with what passing means, and the clause each check cites; the team has approved it; its version and the approval date are recorded in §14; and the §3.4 status no longer says "awaiting approval".

### §5.4 Labelled synthetic dataset

Ten cases to build and judge the pipeline against. Each case is a request form, any supporting documents and a RoPA entry, every page marked **"SYNTHETIC — DEMO DATA"**, with the expected extracted values, check results and outcome written down beside it.

- **Done when:** the ten cases together cover at least a clean case that should auto-clear, a missing field, a contradiction between documents, an incompatible purpose, an indeterminate purpose, Arabic documents and a scanned page; each case's expectations are stated in terms of the approved rule set; and no case contains a real person's data or a real email address.

### §5.5 Evaluation run

A repeatable measure of how well the pipeline does on the dataset, so a change to the extraction instructions or the model can be judged before it ships.

- **Done when:** one command runs the whole dataset through the real pipeline and reports per-field extraction accuracy, the number of fields wrongly reported as found, and how often the outcome matches the expected one; the report records the model and instruction version it used, so two runs can be compared; and the command is not part of the test suite, since it calls the real model.

### §5.6 Model access and test stand-in

- **Done when:** the workspace and the published app each reach the model with a key held only in their secrets; the model for each step can be changed through settings alone; on the published app, a run started by a response finishes with nobody using the app afterwards; and the whole test suite passes with no API key present, a stand-in answering in place of the model.

### §5.7 Existing data and seed

The published app already holds demo data, and runs migrations and the seed on every start.

- Existing requests keep their status, flag reasons and decisions. Existing responded requests are never run through the pipeline, and their requester keeps seeing what it saw before.
- The seed never starts the pipeline, and starting the app never makes a model call.
- The dataset's documents are not seeded into the app.

- **Done when:** upgrading a copy of Sprint 2 data changes no existing request's status, flag reasons or decision, and runs no pipeline; running the seed again duplicates nothing and starts no run.

## §6 Automated field extraction (US-07)

Every check stands on the extracted fields. A value that can't be traced to the document, or a gap quietly filled in, would make every check after it worthless.

**Done when:**
- once the provider has responded, every request form, supporting document and RoPA entry of the request is read, and each field the rule set defines is recorded as found, not found or ambiguous (§3.3)
- every found value carries the exact text it came from, and that text can be located in the document; a value whose text does not appear in the document is recorded as not found (tested with a stand-in that returns a made-up quote)
- a document that omits a field gives "not found" for it, never a guess (tested with the dataset's missing-field case)
- Arabic documents are read as well as English ones, and Arabic values and quotes are kept as written
- a scanned page, a DOCX or a document too large to process gives "ambiguous" for the fields that could only come from it
- extraction runs once per document; the checks reuse it and never read the document again
- the stored extraction shows the model and instruction version that produced it

## §7 Compliance checks

Each check produces findings (§3.2), citing the rule-set clause and version.

### §7.1 Field-level compliance check (US-08)

The point of the project: each field measured against the clause it answers to.

**Done when:**
- every field the rule set names is checked against its clause, and its result is passed, failed, not found, or ambiguous when the field was extracted as ambiguous; a field the rule set marks as extract-only (used by another check, such as the collection legal basis in §7.3) has no field-level check
- a field extracted as ambiguous is never passed
- every finding cites its clause and the rule-set version used
- with the rule set's version changed, earlier findings still show the version they used

### §7.2 Cross-document consistency check (US-09)

The request form, the supporting documents and the RoPA entry describe the same sharing. Where they disagree, someone has to find out why.

**Done when:**
- the same field is compared across every document of the request that states it, and a mismatch gives an inconsistent finding naming the documents and quoting each value
- a field present in one document and missing from another gives an inconsistent finding
- agreeing documents give a passed finding
- the dataset's contradiction case is flagged for the contradiction, citing both documents

### §7.3 Purpose compatibility (US-10)

Data collected for one purpose may only be shared for a compatible one. This is the judgement an officer most needs to see laid out.

**Done when:**
- the requester's stated purpose is compared with the original collection purpose and legal basis in the provider's RoPA entry, and the result is compatible, incompatible or indeterminate
- an incompatible or indeterminate result shows both purposes side by side, each with the text it came from
- a missing or ambiguous purpose on either side gives indeterminate, never compatible
- the dataset's incompatible and indeterminate cases give those results

## §8 Auto-clear or flag (US-11)

Requests that clearly pass shouldn't wait for an officer; anything doubtful must reach one. There is no third way out.

**Done when:**
- every request the pipeline runs on ends exactly one way: approved by the system, or flagged
- a request is approved by the system only when every check passed and the provider endorsed it; the dataset's clean case is approved without anyone acting
- any failed, not-found, ambiguous, inconsistent, incompatible or indeterminate result, any objection, or a pipeline error leaves the request flagged, with every reason shown in the review queue and case view
- the system never rejects a request
- from the provider's response to the end of the run, both parties and the officer see "Under automated review", and no officer can decide the request
- a run that fails, or is cut off by a restart, ends with the request flagged and a pipeline-error reason; no request stays under automated review for good
- an objected request runs through every check like any other, so the officer sees the findings beside the objection
- a system approval is recorded as a decision by the system, with the check report, and cannot be changed or decided again
- an officer's decision flow is unchanged for requests flagged by the pipeline (Sprint 2 §8.1 tests pass with a pipeline-flagged request)

## §9 Check report and stored records

### §9.1 Check report (US-12)

An outcome nobody can explain can't be defended, whether the system or an officer reached it.

**Done when:**
- every request the pipeline runs on has a report listing every check performed, its result and its clause
- a flagged request's report adds a short summary of why it was not auto-cleared
- the officer sees the full report on the case view, and the provider sees it on its request page
- the requester sees the reduced report only once the request has an outcome, and it holds nothing listed as left out in §3.6
- a request with no pipeline run shows no report, and nothing on its screens changes

### §9.2 Case view: extracted fields and findings

What Sprint 2 §2.4 deferred. The officer must be able to check the pipeline's work, not just read its verdict.

**Done when:**
- the case view shows the extracted fields of each document, each with the text it came from, and marks fields that were not found or ambiguous
- each finding shows its result and its clause citation, and superseded findings are shown as superseded
- a purpose comparison that is incompatible or indeterminate shows both purposes side by side
- a case flagged only by an objection, with no pipeline run, looks exactly as it did in Sprint 2

### §9.3 Stored check reports (US-13)

Completes US-13: anyone asking later why a request ended the way it did gets the whole answer from the request.

**Done when:**
- the full report is stored with the decision record, for system and officer decisions alike, and can be retrieved later with it
- the stored report shows what the pipeline found at the time, even after the rule set or the model setting changes
- no user can change or remove a stored report
- a request never ends up with a system decision but no report, even if saving fails partway

## §10 Correction on a flagged request (US-21)

A wrong retention period in a RoPA entry is a fixable mistake. The provider should be able to fix it without an officer deciding around it, and the original must stay on record.

**Done when:**
- the provider can submit a corrected RoPA entry on a request that is flagged and undecided, and on no other
- the requester, an officer and any other entity cannot correct; the requester is refused and the rest get "not found"
- the original RoPA entry stays on the request alongside the correction, and both can be opened by those allowed to see the RoPA
- only the checks that depend on the RoPA entry run again; findings on the requester's documents alone are reused
- the findings the re-run replaces are shown as superseded and no longer count towards the flag
- the outcome rule applies again: with every check passing and an endorsement, the request is approved by the system; otherwise it is flagged again
- a request the provider objected to stays flagged after any correction
- the request is under automated review during the re-run, and cannot be decided until it ends
- if an officer decides the request while a correction is being submitted, exactly one of the two takes effect and the other user is told so

## §11 Notifications

**Deferred.** Sprint 2 §9 and §10 are not built and will be built after Sprint 3 (§2.15). Nothing here is built in Sprint 3. These are the requirements the pipeline adds to that work, recorded now so it doesn't have to rediscover them. Sprint 2 §4.2 and §10 apply, and each email has a test that checks its full subject and body against the list of things it must not reveal.

**Done when (with Sprint 2 §10):**
- the requester gets one email each time the status it sees changes (§3.1), giving only the reference and the new status: Under automated review, Under review, Approved, Rejected
- the email about the provider's response is the same for an endorsement and an objection
- a system approval sends both parties the same outcome emails as an officer's approval
- no email reveals a finding, a field value, the rule set, the position, an objection or a justification

## §12 Access and isolation tests

Sprint 3 is done only when these pass, using entities A, B and C with a request from A to B, and a compliance officer. All of Sprint 1 §11 and Sprint 2 §11 must still pass, except where §2.7 changes what A sees of a flagged request.

- before an outcome, A sees "Under automated review" then "Under review" or "Approved", and nothing of the report, extracted fields or findings through any screen, download, API response or email
- after an outcome, A sees the reduced report, and nothing from the RoPA entry, the position, the objection, the flag reasons, the purpose comparison or the not-cleared summary
- B sees its full report, its extracted fields and findings, and its own corrections
- C sees nothing about the request, in any list or view, and receives no email about it
- A cannot submit a correction; C and the officer get "not found"
- changing an ID, role or any other value sent by the client grants no extra access, and cannot make the system record a decision
- the officer sees the request in the queue while it is under automated review, and cannot decide it
- no DPO can record a decision, and the system never records a rejection

## §13 Sprint review demo script

Run on the **published app**. Log in just before presenting, so the 15-minute idle timeout doesn't log anyone out mid-demo. Every email arrives in the team mailbox, so request one login code at a time and use the newest. The documents come from the labelled dataset (§5.4).

1. Three browser sessions: `moh`, another entity (the provider) and a compliance officer.
2. As `moh`, submit the dataset's clean case to the provider.
3. As the provider, upload its RoPA entry and endorse. Show "Under automated review" on both entities' screens and in the officer's queue.
4. Show the request approved by the system, and `moh`'s reduced report.
5. As `moh`, submit the dataset's incompatible-purpose case; as the provider, endorse it.
6. As `moh`, show "Under review", with no sign of why.
7. As the officer, open the case: the extracted fields with their source text, the findings with their clauses, and both purposes side by side.
8. As the provider, correct the RoPA entry. Show the superseded findings and the re-run result.
9. As the officer, decide the case with a justification, and show the stored decision with its report.
10. Run the evaluation command and show its report.

## §14 Change log

| Date | Section | Change |
|---|---|---|
| 2026-11-21 | All | Sprint 3 spec created. Supersedes Sprint 2 §2.5, §2.6 and §3.3 for system decisions, the requester's label for flagged requests in Sprint 2 §3.1, and the Sprint 2 §10.2 rule that a flag sends the requester nothing (§2.6, §2.7, §2.15). |
| 2026-11-21 | §2, §4.2, §4.3, §5.6, §11, §13, §15, §16 | Sprint 2 §9 and §10 are not built and come after Sprint 3, so §11 is deferred and Sprint 3 sends no request emails. The published app stays on Autoscale; runs must finish and recover there. |
| 2026-11-21 | §3.4, §5.3 | Rule set draft 0.1 written in `docs/rule-set.md`, not yet approved. Its §7 lists decisions D1–D6 for the team, including correcting the RoPA contents citation from IR Art 33(3) to IR Art 33(5). |
| 2026-11-21 | §3.4, §5.3 | **Rule set version 1.0 approved by the team.** Decisions D1–D6 accepted as proposed. |
| 2026-11-21 | §2.10, §3.4, §5.3, §15 | RoPA contents citation corrected from Implementing Regulation Article 33(3) to 33(5) (D2). The rule set may cite provisions beyond Article 31 and 33 (D1). |
| 2026-11-21 | §7.1 | Field-level results may be ambiguous (D5), and extract-only fields have no field-level check (D3). |
| 2026-11-21 | §3.1 | Under automated review stored as status `UNDER_AUTOMATED_REVIEW`; runs stored as `PipelineRun` records. |
| 2026-11-21 | §3.2 | Findings stored as `Finding` records, linked from flag reasons by `findingId`; superseded recorded as `supersededAt`; only active reasons count towards flagged; a pipeline-error reason is superseded when a later run finishes. |
| 2026-11-21 | §3.3 | Field list fixed by the rule set. |
| 2026-11-21 | §5.2 | `AGENTS.md` wording approved by the team: access rules 2, 3, 5 and 6 updated, rule 7 added, Sprint 3 terminology added, per-step model settings listed. Requests flagged before Sprint 3 keep showing the requester "Responded" (§5.7). |
| 2026-11-21 | §5.4 | Labelled synthetic dataset added in `apps/api/eval/dataset/`: ten cases against rule set 1.0, generated with their expectations by `build_dataset.py`. Its README lists three points rule set 1.0 leaves open for §7.1–§7.2 (a field in several requester documents, a cross-document check on an ambiguous value, a field no requester document states). |
| 2026-11-21 | §15 | Open question 6 (missing API key) resolved: the app starts with one warning, and every run ends flagged with the generic pipeline-error reason. |
| 2026-11-21 | §3.3, §3.5 | Extraction contract recorded; decisions record who made them and the stored report, guarded by a database constraint. |
| 2026-11-21 | §7.1, §7.2 | The dataset README's open points settled. (1) A field-level check gives one finding per request: ambiguous if any document gives the field as ambiguous, not found if none states it, otherwise failed if any stated value fails. (2) **Team decision:** an ambiguous value that takes part in a cross-document comparison gives inconsistent, since it cannot be confirmed to agree; no new result is added, so rule set 1.0 stands. (3) A field no requester document states passes its cross-document check; the field-level check flags it. D4's missing-from-the-request-form rule is CD-03's to apply, not CD-04's. |
| 2026-11-21 | §8, §2.7 | A run with any rule-set check left without a finding (a step not built yet, such as §7.3) ends flagged with the pipeline-error reason and is never approved. The requester's API response says "under review" only for a flagged request that went through the pipeline; requests flagged before Sprint 3 keep "Responded". |
| 2026-11-21 | §6, §3.3 | Extraction built. The pipeline reads each PDF's text layer with pdf.js (`pdfjs-dist`), putting right-to-left lines back into reading order, and sends the model that text, never the file, so a scanned page can't be read (§2.1). Every quote is looked up in the same text, compared as the dataset README describes; a quote that isn't there gives not found. A DOCX, a PDF that can't be opened, one with no text layer, and one with more than 150,000 characters of text (too large for one call) give ambiguous for all its fields, with no model call. In a document with an unreadable page, a field not found on the readable pages is ambiguous. Each document's extraction records when it was read (`extractedAt`); instructions version `extract-1`. The extraction tests read the dataset's PDFs. |

## §15 Open questions

1. **Resolved 2026-11-21.** Sprint 2 §9 and §10 are not built, and will be built after Sprint 3. Sprint 3 sends no request emails; §11 records what the pipeline adds to that work (§2.15).
2. **Resolved 2026-11-21.** The published app stays on Autoscale for Sprint 3; the pipeline must work there (§4.3, §5.6).
3. **Design reference.** `docs/design/sprint-2.md` covers neither the new stage, the extracted-fields panel, the report views nor the correction screen. Who produces the Sprint 3 design reference, and is it needed before §9 and §10?
4. **Corrections and the requester's status.** During a re-run after a correction, should the requester see "Under automated review" (and get an email for it), or keep seeing "Under review" until the outcome? The first is accurate but tells the requester a correction happened.
5. **How many corrections.** Can the provider correct as many times as it likes while the request stays flagged and undecided, or is there a limit?
6. **Resolved 2026-11-21.** Missing API key: the app starts, logs one warning, and every run ends flagged with a pipeline-error reason worded "The automated review could not be completed.", which never mentions the key (§3.2). A missing `PIPELINE_INTERNAL_TOKEN` in the published app has the same effect.
7. **Legal references.** Partly resolved 2026-11-21: the rule set was checked against the official English texts, which showed the RoPA contents are in Implementing Regulation Article 33(5), not 33(3). Still open: confirm every citation in `docs/rule-set.md` against the official Arabic text. SDAIA's October 2026 draft amendments would delete Article 33(5); re-check before the final demo (`docs/rule-set.md` §6, R1).

## §16 Out of scope

Do not build these in Sprint 3:

- OCR, or reading scanned pages
- reading Word documents
- the system rejecting a request on its own
- running the pipeline over requests that existed before this sprint's release
- corrections outside the flagged, undecided state
- corrections by the requesting entity, and the provider changing its position
- any change of model provider beyond the model setting
- request emails: reminders and notifications (Sprint 2 §9 and §10), built after Sprint 3 (§11)
