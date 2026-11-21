# Project backlog — COMPEL

User story definitions, referenced by ID (US-xx) from the sprint specs in `specs/`. A story says what is wanted; its sprint spec adds what is specific to that sprint. If the two disagree, stop and ask.

This file currently holds the Sprint 2 and Sprint 3 stories. Stories from Sprint 1 are not recorded here yet.

## Sprint 2

### US-14 Compliance officer authentication (Must)
A reviewing officer authenticates via OTP. The review console is available only to accounts holding the compliance officer role.

### US-15 Review queue and case view (Must)
An officer sees a queue of pending and flagged requests that can be filtered and sorted, and can open a case to see its details and the reasons it was flagged. (Extracted fields and clause citations come in Sprint 3.)

### US-16 Final decision on flagged requests (Must)
An officer records a final approve or reject decision on a flagged request. A written justification is required, and the decision is added to the request's stored record.

### US-13 Stored decision records (Must)
Every decision is stored so it can be retrieved later, identifying the request, its outcome and the time of the decision. (Storing the check report waits for US-12 in Sprint 3.)

### US-06 Pending requests and provider reminders (Should)
A request with no response from the providing entity stays pending, shows how long it has been waiting, and triggers a reminder to the providing entity after a defined period.

### US-18 Provider notified on submission (Should)
The providing entity is emailed when a request naming it is submitted, stating that a RoPA entry and a position are required.

### US-17 Requester notified on status changes (Should)
The requesting entity is emailed on every status change of its request, giving only the request reference and the new status.

### US-19 Provider notified of the outcome (Could)
The providing entity is emailed when a request naming it is approved or rejected, giving only the reference and the outcome.

## Sprint 3

### US-07 Automated field extraction (Must)
The system extracts the defined fields (purpose, legal basis, data categories, retention period, and any others the rule set needs) from the submitted documents and the RoPA entry. Extraction happens once, and every later check reuses it.

### US-08 Field-level compliance check (Must)
Each extracted field is checked against the PDPL article or Implementing Regulation clause it relates to. For each field the result is passed, failed or not found.

### US-09 Cross-document consistency check (Must)
The system compares the same information across all documents submitted for a request. It flags any mismatch, and any information present in one document but missing from another.

### US-10 Purpose compatibility (Must)
The system compares the requesting entity's stated purpose with the original collection purpose and legal basis in the providing entity's RoPA entry. The result is compatible, incompatible or indeterminate. Incompatible and indeterminate results show both purposes side by side.

### US-11 Auto-clear or flag (Must)
Every request that goes through the pipeline ends with exactly one outcome, auto-cleared or flagged, based on the check results and the providing entity's position.

### US-12 Check report (Must)
The system produces a report listing every check performed, its result and its PDPL clause. For a flagged request, it adds a summary of why the request was not auto-cleared.

### US-21 Correction on a flagged request (Could)
The providing entity can submit a correction to its RoPA entry on a flagged request. The correction is kept alongside the original documents, and the affected checks run again.
