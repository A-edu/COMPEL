# Sprint 2 spec — COMPEL

What Sprint 2 must achieve, and why. Standing rules (access rules, auth invariants, email safety, storage, design system, working rules) are in `AGENTS.md` and are not repeated here. `specs/sprint-1.md` remains the record of what Sprint 1 delivered.

**This spec sets outcomes, not designs.** It says what each story must achieve and how a tester can tell. Endpoints, screens, tables, libraries and file layout are for whoever builds the story. §3 and §4 therefore describe shared concepts and behaviour rather than a schema or an API.

**Story definitions** live in `docs/backlog.md`. Read a story's definition before building it. This spec adds what is specific to Sprint 2; if the two disagree, stop and ask.

**Section numbers are stable.** Handovers and prompts reference them. Add new material as new sub-sections or at the end; never renumber. Record every change in §13.

## Progress

- [x] §5.1 Shared decisions recorded
- [x] §5.2 Standing rules reconciled
- [x] §5.3 Seed and existing data
- [ ] §5.4 Scheduled work on the published app
- [x] §6 Compliance officer login
- [ ] §7 Review queue and case view
- [x] §8.1 Final decision
- [ ] §8.2 Stored decision records
- [ ] §9 Pending requests and provider reminders
- [ ] §10.1 Provider notified of a new request
- [ ] §10.2 Requester notified of status changes
- [ ] §10.3 Provider notified of the final outcome
- [ ] §11 Access and isolation tests

---

## §1 Scope

Sprint 1 ends when the provider states a position, and nothing happens after that: an objection goes nowhere, and nobody hears about anything unless they log in and look. Sprint 2 closes that loop. An objection reaches a compliance officer, the officer makes an accountable decision, the decision is kept for good, and both entities are told what they need to know by email.

| Story | Priority | What it achieves in Sprint 2 | Why it matters | Built in |
|---|---|---|---|---|
| US-14 | Must | Compliance officers sign in, and only they reach the review console | A decision must come from an identified, accountable person | §6 |
| US-15 | Must | Officers see a queue of pending and flagged requests, and everything needed to judge a case in one place | An officer can't decide fairly on a partial picture | §7 |
| US-16 | Must | An officer approves or rejects a flagged request with a written justification | Without it, a flagged request never ends | §8.1 |
| US-13 | Must | Every decision stays on the request permanently | The reasoning behind a decision on personal data must be answerable later | §8.2 |
| US-06 | Should | Pending requests show how long they have waited, and the provider is reminded after a defined period | A request stalled at the provider blocks everything after it | §9 |
| US-18 | Should | The provider learns a request naming it was submitted, and what it must supply | Otherwise it only finds out by logging in | §10.1 |
| US-17 | Should | The requester learns when its request's status changes | Otherwise it has to keep checking | §10.2 |
| US-19 | Could | The provider learns the final outcome | The provider took part and should hear how it ended | §10.3 |

The agentic pipeline is Sprint 3 and is out of scope (§14).

**Sprint 2 is submitted** as the repository link plus the published app's URL.

## §2 Confirmed decisions

1. **Flagged means an officer must decide.** Until the pipeline exists, a request is flagged when the providing entity objects to it, with the objection as the reason.
2. **Flagging doesn't depend on its source.** The objection is the first source of flag reasons, not a special case. Sprint 3's compliance checks must be able to add their own reasons without any change to the officer's decision flow (§3.2).
3. **Endorsed requests are not flagged**, and have no final outcome in Sprint 2. They stay as Sprint 1 left them until Sprint 3's automatic outcomes.
4. **The case view shows what exists now:** the submitted documents, the RoPA entry, the provider's position and the reasons the request was flagged. Extracted fields and clause citations come in Sprint 3.
5. **The requester still can't learn the provider's position** (AGENTS.md → Access rules, rule 3). Because a flag currently means an objection, a visible flag would reveal the position, so the requester sees no difference between an endorsed request and a flagged one (§3.1). Once a decision is recorded the requester sees the outcome. In Sprint 2 only flagged requests get an outcome, so an outcome does imply there was a flag. This is accepted for now, and goes away when Sprint 3 gives other requests outcomes too. The position itself is never shown.
6. **Decisions are final.** One decision per request, possible only while it is flagged and undecided, and never changed afterwards.
7. **US-13 covers decisions.** Storing the check report waits for US-12.
8. **Sprint 1 §2.3 is superseded:** the two statuses are no longer the whole list (§3.1). All other Sprint 1 decisions stand, including §2.7: the provider responds once.
9. **The review queue holds pending and flagged requests** (US-15). Pending means the provider has not responded (US-06). Officers can follow pending requests, but decide only flagged ones.
10. **The published app moves to a Reserved VM**, replacing the Autoscale deployment in Sprint 1 §5.6, so that scheduled work runs when nobody is using the app (§5.4).

## §3 Data model: shared concepts

These concepts are shared between stories, so each is decided once and recorded here. Where an entry says **Decided: not yet**, the first person to need it settles it with the team and writes the result in that entry before building on it (§5.1).

### §3.1 Request statuses

A request moves through these stages. What each party sees is fixed; the stored statuses and their names are not.

| Stage | Meaning | Requester sees | Provider sees | Compliance officer sees |
|---|---|---|---|---|
| Awaiting response (pending) | The provider has not responded | Awaiting response | Awaiting response | Awaiting response, in the review queue, with no decision possible |
| Responded | The provider responded, and nothing is flagged | Responded | Responded | Nothing |
| Flagged | At least one flag reason exists; no decision yet | **Responded** | Under review | Flagged, in the review queue |
| Decided | An officer recorded a final decision | Approved or Rejected | Approved or Rejected | Approved or Rejected, read-only |

The list must leave room for Sprint 3 to add stages without reworking the stages above.

**Decided:** the labels are those in the table, and the final outcomes are approved and rejected (US-16). Flagged is not a stored status: a request is flagged when it has at least one flag reason and no decision. The status the requester sees therefore cannot show a flag, and only the provider is told a request is under review.

### §3.2 Flag reasons

A request can carry any number of flag reasons, from any number of sources. Every reason must say where it came from, what it says and when it was raised, whatever its source. A new source must need nothing more than recording a reason: the queue, the case view and the decision flow keep working without being changed, and without assuming that a flagged request has an objection.

**Decided:** each flag reason is its own record on the request, holding its source, its text and the time it was raised. Adding a source means adding a new source identifier, and nothing else. The first source is the provider's objection, and its text is the objection. A reason that arrives after a decision is kept on the request, but does not reopen it or change the decision.

### §3.3 Decision records

A decision record identifies the request, and states its outcome, the time of the decision, the written justification and which officer made it. It belongs to the request, lasts as long as the request does, and can be retrieved later.

**Decided:** the justification is visible to compliance officers only. The two parties see only the outcome, since a justification may quote the objection.

**Decided:** a justification is 10 to 1000 characters after trimming, the same limits as an objection reason. Any flagged request can be decided, including one with a flag reason but no provider response yet (§3.1); once it is decided, the provider can no longer respond. A reason other than an objection is needed for this to arise, so it cannot happen until Sprint 3.

## §4 API contract: shared behaviour

Behaviour every story must share, whichever endpoints it uses.

### §4.1 Access

- Only accounts holding the compliance officer role can reach the review console (the review queue and case view), and only they can record decisions.
- Officers can reach pending, flagged and decided requests only. A request the provider has responded to with nothing flagged is closed to them. They cannot submit or respond to requests.
- Entity users still see only their own entity's data. Nothing in this sprint widens what a DPO can see.
- Someone refused access learns nothing from the refusal: the response is the same whether or not the request is flagged, and whether or not it exists.
- Who counts as an officer is decided by the server, never by anything the client sends.

**Decided:** compliance officers belong to SDAIA, the PDPL regulator, so the session contract does not change. An officer acts as a reviewer, not for SDAIA: an officer account has none of a DPO's access, even to SDAIA's own requests, and SDAIA's DPO has no officer access. Officers can review and decide requests SDAIA is a party to, because every officer belongs to SDAIA and those requests could otherwise never be decided. This conflict of interest is accepted for the demo.

**Decided:** a role refusal is a 404 "Not found" in both directions: a DPO on a review console route, and an officer on a DPO route, including the Sent and Received lists and submitting a request. Routes are for DPOs unless explicitly opened to officers, so a new route is closed to officers by default.

### §4.2 Email

- All sprint email goes out one way, through the existing mail setup and its safety switch (AGENTS.md → Email). No story gets its own way of sending.
- **A notification reveals only the request reference and its status or outcome.** No title, entity names, position, flag reasons, justification or filenames, in the subject or the body. The status is the one the recipient would see in the app (§3.1). The one addition is the provider's submission email, which also states that a RoPA entry and a position are required (US-18); that wording is the same for every request.
- An email is sent only after the change it reports has been saved, and once per change.
- A mail failure never blocks or undoes the action that caused it. It is logged.

**Decided:** notifications go to the entity's data office email, since the stories address the entity rather than a person.

A failed notification is logged, not retried. While the safety switch is on, each email carries its intended address in a mail header, never in the subject or body, so a tester can read it from the message source.

### §4.3 Scheduled work

Work that is due happens at the time it is due, whether or not anyone is using the app, and happens once. Restarts, redeploys and more than one running instance must not cause it to be skipped for good or repeated.

**Decided:** the published app runs on a Reserved VM, which never scales to zero, so scheduled work can run inside the app (§5.4).

## §5 Foundation

Do this first. Parallel story work depends on it.

### §5.1 Shared decisions

Everything shared between stories is decided once and recorded in this spec, in §3, §4 and §9.

- **Done when:** every **Decided: not yet** entry holds the team's decision, and each change is listed in §13.

### §5.2 Standing rules

`AGENTS.md` wins over this spec on rules, and it does not yet allow for a compliance officer. Agree these changes with the team before building §6 to §8. They change auth and access-rule behaviour, so they need explicit approval.

- **Terminology** has no compliance officer, flag, flag reason or decision. It also defines a user as a DPO.
- **Access rules 1 and 5** limit every request query to requests the user's entity is a party to, which rules out a cross-entity review queue.
- **The session contract** assumes every user belongs to an entity, and says that shape must not change. Officers belong to SDAIA (§4.1), so the shape stands, but the rules must say that an officer's entity gives them no party access.

- **Done when:** `AGENTS.md` describes the officer and the access rules cover the review queue, with the approved wording, and no rule contradicts §4.1.

### §5.3 Seed and existing data

The published app already holds demo data, and runs migrations and the seed on every start.

- The seed provides at least one compliance officer account in SDAIA, on a `.example` address, and at least one flagged request awaiting a decision, with documents marked **"SYNTHETIC — DEMO DATA"**.
- Requests objected to before this sprint appear in the review queue once it is released, with their objection as the reason.
- Upgrading loses nothing: every existing request keeps its documents, response and history, and the requester sees the same status as before.

- **Done when:** upgrading a copy of Sprint 1 data shows its past objections as flagged; running the seed again duplicates nothing and never alters a recorded decision.

### §5.4 Scheduled work on the published app

The published app moves from Autoscale to a Reserved VM on the smallest tier. Autoscale scales to zero when idle, and anything that only runs inside the app stops with it; a Reserved VM runs continuously. The workspace owner makes the change and republishes. Everything else in Sprint 1 §5.6 stands.

**Done when:**
- the published app runs on a Reserved VM, and every existing request and document is still there
- the API and web app run reliably within the smallest tier; if they don't, move up a tier and record it in §13
- with nobody using the published app, a reminder falls due and arrives in the team mailbox on time

## §6 Compliance officer login (US-14)

Officers are the people who close flagged requests, so the app must know exactly who they are. The standing authentication rules apply to them unchanged.

**Done when:**
- a seeded officer signs in with an emailed one-time code and lands on the review queue; a DPO still lands on their requests
- an account without the compliance officer role cannot reach the review console
- nothing in the login flow reveals whether an email belongs to an officer, a DPO or nobody
- an officer's session expires and logs out exactly as a DPO's does, and their logins are recorded in the same way

## §7 Review queue and case view (US-15)

Officers need to find what's waiting, then judge each case on everything that exists, without going to the parties for it.

**Done when:**
- the queue shows every pending and flagged request, from all entities, and nothing else
- the officer can filter and sort the queue, and can at least separate pending requests from flagged ones
- a request becomes flagged in the queue straight after an objection, with no one taking any action; an endorsed request leaves the queue
- opening a request shows the two entities, the submitted documents, and whatever exists so far of the RoPA entry, the provider's position and the flag reasons, each reason with its source; the officer can open each document
- a request with reasons from two different sources shows both, with no change to the screen (tested with a made-up second source)
- a decided request leaves the queue, and an officer can still find it and read its decision
- an empty queue says so clearly

## §8 Final decision and decision records

### §8.1 Final decision (US-16)

A flag has to end in something. The officer's decision is that end, and the written justification is what makes it accountable.

**Done when:**
- an officer approves or rejects a flagged request with a written justification, and the request moves to that outcome
- a decision with no justification is refused, and the request stays as it was
- a decision is refused on a request that isn't flagged, including a pending one, or is already decided
- if two officers decide the same request at once, exactly one decision is recorded and the other officer is told so
- the flow behaves the same for a request flagged by a reason other than an objection (tested with a made-up second source)

### §8.2 Stored decision records (US-13)

Anyone asking later why a request ended the way it did must get the answer from the request itself.

**Done when:**
- an officer can retrieve any decision later, and it shows the request, its outcome, the time, the justification and the officer, alongside the flag reasons that led to it
- no user, including the officer who made it, can change or remove a decision
- a decision survives restarts, redeploys and re-seeding
- a request never ends up with an outcome but no record, or a record but no outcome, even if saving fails partway

## §9 Pending requests and provider reminders (US-06)

The whole process waits on the provider's response, and nothing today prompts a provider who hasn't given one.

Each pending request gets one reminder, once it has waited for the defined period.

**Decided:** the defined period is 3 days. It is a setting, so a sprint review can shorten it without changing code.

**Done when:**
- a pending request shows how long it has been waiting, wherever it is listed
- a provider can see at a glance which received requests still await its response
- a request pending for the defined period triggers one reminder to the provider, on time, with nobody using the app
- no reminder is sent once the provider has responded, and none goes to the requester or to any other entity
- a reminder that fell due during an outage goes out late rather than never, and is still sent only once
- a reminder follows §4.2: reference and status only
- the team can show a reminder arriving during a sprint review without waiting days and without changing code

## §10 Notifications

All three follow §4.2. Each has a test that checks the email's full subject and body against the list of things it must not reveal.

### §10.1 Provider notified of a new request (US-18)

**Done when:** submitting a request sends one email meant for the named provider, giving the reference and status and stating that a RoPA entry and a position are required, and sends none to any other entity.

### §10.2 Requester notified of status changes (US-17)

"Every status change" in US-17 means every change in the status the requester can see (§3.1). Reporting a flag would reveal the provider's position, which AGENTS.md → Access rules, rule 3 forbids.

**Done when:**
- the requester gets one email each time the status it sees changes, giving only the reference and the new status: when the provider responds, and when the request is approved or rejected
- the email about the provider's response is the same for an endorsement and an objection
- a request becoming flagged sends the requester nothing, since the status it sees doesn't change

### §10.3 Provider notified of the final outcome (US-19)

**Done when:** approving or rejecting a request sends one email meant for the provider, giving only the reference and the outcome.

## §11 Access and isolation tests

Sprint 2 is done only when these pass, using entities A, B and C with a request from A to B, and a compliance officer. All of Sprint 1 §11 must still pass unchanged.

- no DPO, including those of A and B, can reach the review console or record a decision, and the refusal is the same whether or not the request is flagged
- changing an ID, role or any other value sent by the client grants no officer access
- an officer gets "not found" for a request the provider endorsed with nothing flagged, and cannot submit or respond to a request
- an officer has no DPO access, even when SDAIA is a party: no Sent or Received lists, and the "not found" above still applies
- until a decision is recorded, A cannot tell an objection from an endorsement through any screen, download, API response or email; afterwards it sees the outcome but still not the position or the RoPA document
- B sees its own position and the outcome
- C sees nothing about the request, in any list or view, and receives no email about it

## §12 Sprint review demo script

Run on the **published app**. Log in just before presenting, so the 15-minute idle timeout doesn't log anyone out mid-demo. Every email arrives in the team mailbox, so request one login code at a time and use the newest.

1. Three browser sessions: `moh`, another entity (the provider) and a compliance officer.
2. As `moh`, submit a request to the provider. Show the email announcing it: the reference and status, and that a RoPA entry and a position are required.
3. As the provider, show the request among those pending, with how long it has waited, then object with a reason.
4. As `moh`, show the status "Responded" with no sign of the objection. Show the status email.
5. As the officer, open the review queue, filter it to flagged requests, then open the request and walk through the documents, RoPA entry, position and flag reason.
6. Paste the case's address into the `moh` session: "Not found".
7. As the officer, try to decide with no justification and show the refusal. Then approve or reject it with a justification.
8. Show the outcome emails to both parties, and the outcome on each party's screen. `moh` still sees no position or RoPA document.
9. As the officer, show the stored decision, and that it can't be decided again.
10. Show a reminder arriving for a pending request.

## §13 Change log

| Date | Section | Change |
|---|---|---|
| 2026-11-07 | All | Sprint 2 spec created. Sprint 1 §2.3 superseded by §3.1. |
| 2026-11-07 | §1–§4, §6–§12, §14 | Reconciled with the story definitions, now in `docs/backlog.md`. The review queue holds pending and flagged requests, with filters and sorting. Outcomes are approved and rejected. Notifications go to the data office email. One reminder per pending request. The provider's submission email also states what is required. |
| 2026-11-07 | §2, §4.3, §5.4, §12 | Published app moves from Autoscale to a Reserved VM on the smallest tier, superseding the deployment type in Sprint 1 §5.6. The demo no longer needs a wake-up step. |
| 2026-11-07 | §3.2, §3.3, §4.1, §4.2, §5.2, §5.3, §9, §11 | Shared decisions recorded, and `AGENTS.md` terminology and access rules updated for compliance officers. Flag reasons are records with a source, text and time. The justification is for officers only. Officers belong to SDAIA with no DPO access, and can decide requests SDAIA is a party to. Failed notifications are logged, not retried. A mail header carries the intended address while the safety switch is on. The reminder period is 3 days. |
| 2026-11-07 | §3.1, §5.3 | Flagged is worked out from flag reasons rather than stored as a status. Seed adds `officer@sdaia.example` and a flagged demo request from `gosi` to `hrsd`. |
| 2026-11-07 | §4.1 | A role refusal is a 404 in both directions, and routes are closed to officers unless explicitly opened. |
| 2026-11-07 | §3.3 | A justification is 10 to 1000 characters after trimming. A flagged request with no provider response can be decided. |

## §14 Out of scope

Do not build these in Sprint 2. They are the **Sprint 3** stories, which together make up the agentic pipeline:

- US-07
- US-08
- US-09
- US-10
- US-11
- US-12, including storing the check report
- US-21

Between them they cover field extraction, the compliance checks, automatic outcomes and the check report. Sprint 2 only leaves room for them, through §3.1 and §3.2.

Also still out of scope from Sprint 1: editing or withdrawing a submitted request, Arabic UI, pagination and search on lists, and filters on any list but the review queue.
