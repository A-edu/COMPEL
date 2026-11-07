# Project backlog — COMPEL

User story definitions, referenced by ID (US-xx) from the sprint specs in `specs/`. A story says what is wanted; its sprint spec adds what is specific to that sprint. If the two disagree, stop and ask.

This file currently holds the Sprint 2 stories. Stories from other sprints are not recorded here yet.

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
