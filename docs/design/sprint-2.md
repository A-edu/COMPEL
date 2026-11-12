# Sprint 2 design reference

How the review console and the Sprint 2 changes to entity screens look and behave. Builds on `AGENTS.md` → Inner screens; where this page differs, it wins for Sprint 2 work. The visual reference is the "Sprint 2" page of the team's design canvas.

## Principles

1. **The decision is the heaviest thing on a case.** Everything else is evidence. The decision panel holds the screen's only primary button and stays in view while the officer reads.
2. **Quote people; never paraphrase them.** Objections and justifications appear verbatim, in full, at 15/24. No truncation on case views.
3. **Show time only where it changes what someone does.** Waiting time, when a reason was raised, when a decision was recorded, and the record timeline. No other dates.
4. **One surface per job.** A case is one dossier and one decision panel. No cards inside cards. No stat tiles: counts live in the filter.
5. **Colour marks state, and nothing else.** Amber waits, red flags or rejects, green clears. Everything else is ink on paper.
6. **Confirm in place, not in a modal.** Recording a decision is two steps inside the panel.

## Paper and ink

| Name | Value | Use |
|---|---|---|
| Canvas | `#F5F5F3` | Page background |
| Surface | `#FDFDFC` | Panels, the dossier, tables |
| Sunken | `#F0F0ED` (`#F3F3F0` inside a surface) | Quoted text, file rows, tags |
| Hairline | ink at 8% | Dividers and surface rings |
| Ink | `#141413` | Text, primary button |
| Ink 2 | `#3A3A37` | Body copy in long text |
| Muted | `#6B6A65` | Labels and meta (5.2:1 on Surface) |
| Amber | `#F79009` | Awaiting response; Under review |
| Flag red | `#D92D20` | Flagged (officer only), as a flag glyph; validation text |
| Red | `#F04438` | Rejected |
| Green | `#10B981` | Responded; Approved |

## Type

Geist throughout. Geist Mono only for request references, OTP digits and email addresses.

| Role | Spec |
|---|---|
| Case title | 28/34, 600, −0.02em |
| List page title | 24/32, 600, −0.02em |
| Panel title | 17/24, 600, −0.01em |
| Section heading | 14/20, 600 |
| Quoted text | 15/24, 400 |
| Table and UI | 14/20, 400–500 |
| Meta | 13/18, 400, tabular figures, muted |
| Label | 12/16, 500, muted, sentence case |
| Reference | Geist Mono 12/16, muted |

## Status vocabulary (spec §3.1)

| Stage | Requester | Provider | Officer |
|---|---|---|---|
| Awaiting response | Awaiting response | Awaiting response | Awaiting response |
| Responded, nothing flagged | Responded | Responded | not in the console |
| Flagged | **Responded** | Under review | Flagged |
| Approved | Approved | Approved | Approved |
| Rejected | Rejected | Rejected | Rejected |

## Screens

### Officer header
Mark and wordmark (links to `/review`), a hairline, "Review console", then on the right the chip "Compliance officer · SDAIA" and Log out. No initials circle on any header.

### Review queue (`/review`, §7)
- List page title "Review queue", line beneath: "Requests from every entity that are waiting on a provider or on a decision."
- One surface. Toolbar: segmented filter **Flagged · Awaiting response · All open · Decided**, each open filter with its count; on the right, **Entity** (any, or one entity: matches requester or provider) and **Sort** (Longest waiting, Most recent). Filter, entity and sort live in the URL.
- Table columns: Request (title 14/500, reference beneath) · Requester → provider (two `EntityTag`s and an arrow) · Flag reason ("Provider objection", or "No response yet" in muted) · Waiting (`WaitingTime`, with "on a decision" or "on the provider" beneath, right-aligned) · Status · chevron. The whole row links to the case.
- Decided filter: the reason column header reads "Flagged by", the time column "Decided" with the decision date.
- Empty queue: "Nothing is waiting for a decision." / "Flagged requests appear here as soon as a provider objects, and requests still awaiting a provider's response appear under Awaiting response." / outline button "See decided requests".
- Filter with no matches: "No requests match." / "Try another entity, or show all open requests."

### Case view (`/review/[id]`, §7, §8)
`CaseHeader` (back to "Review queue"), then `CaseLayout`.

Dossier (left), in this order:
1. `EntityPair`: Requester with "Submitted {date, time}", Provider with "Responded {date, time}" or "No response yet".
2. **Why it was flagged** (meta: "n reasons"): one `FlagReason` per reason, oldest first. Omit the section when there are none.
3. **Provider's response**: Position (Objected or Endorsed) and the RoPA entry as a `FileRow`. Don't repeat the objection text here; it's already a flag reason. If there's no response: "Not received. The RoPA entry and the provider's position will appear here once {provider} responds."
4. **Submitted documents**: "Request form" then "Supporting documents" (or "None submitted"), each a `FileRow`.
5. **Record**: `RecordTimeline`: Submitted; Provider reminded (only if the API has a reminder time); Provider responded; Flagged for a decision (one entry per flag reason, with its source label beneath); Approved or Rejected, with the officer's email and "both entities emailed".

Right column, one of:
- **Flagged, undecided:** decision panel (`surfaceRaised`).
  - Step 1 of 2: title "Decision", "Final once recorded. Nobody can change it afterwards, including you." Outcome as two radio options: **Approve** ("The request can go ahead. Both entities are emailed the outcome.") and **Reject** ("The request cannot go ahead. Both entities are emailed the outcome."). **Justification** textarea (8 rows, placeholder "Explain the decision in terms another officer could check later."), help "Seen by compliance officers only. Both entities see the outcome, never this text." Button **Review decision**.
  - Empty justification on Review: red border and "Write a justification of 10 to 1000 characters before recording the decision."; stay on step 1.
  - Step 2 of 2: "Reject CMP-…?" (or Approve), the consequence plus "This can't be changed once recorded.", the justification echoed in a sunken block, "Recorded as {officer email}". Buttons: **Record rejection** / **Record approval** (primary) and **Back to edit** (ghost).
  - On success: toast "Decision recorded. Both entities have been emailed." and the page shows the decided state.
  - Another officer decided first: panel title "Already decided" with a red dot, "Another officer recorded a decision on this request at {time}. Yours was not saved.", the officer's own justification kept in a sunken block until they leave, and **See the recorded decision**.
- **Decided:** `DecisionRecord`, read-only, with the lock note "Final and permanent. The entities see "{outcome}"; only compliance officers see this record."
- **Pending:** "Decision" / "The provider hasn't responded, so there is nothing to decide yet." / "If {provider} objects, this request moves to Flagged and a decision becomes possible here. If it endorses, the request leaves the queue."

### DPO requests list (§9)
- Received tab: the tab shows a count of requests awaiting your response. One surface with two groups: **Awaiting your response** (columns From · Waiting · Status) and **Responded**. The waiting time turns semibold at the reminder period.
- Sent tab: **Waiting for a response** (To · Waiting · Status) and **Responded**.

### Provider and requester screens: Record
A party's Record shows only events whose data that party's API already returns. No new fields on party routes.

### Provider: request under review
Two columns. Left: From, Documents, Record ("Received from {requester}", "You responded", "Sent for review"). Right: a strip "A compliance officer is reviewing this request." / "You'll be emailed the outcome at your data office address. Nothing else is needed from you.", then **Your response** read-only (Position, Reason in full, RoPA entry).

### Requester: outcome
Two columns. Left: To, Documents you submitted, Record ("You submitted the request", "{provider} responded", "Approved/Rejected by a compliance officer"). Never the position, the RoPA entry, a flag or the justification. Right: **Outcome** panel with the dot and "Approved"/"Rejected" (22/28), "A compliance officer {approved/rejected} this request." Add "on {date}" only if the party API already returns the decision date. On rejection: "This decision is final. To pursue the same data, submit a new request." and an outline **New request** button.

## Never
- A position, RoPA entry, flag or justification on a requester's screen, before or after the outcome.
- The justification anywhere an entity can see it, including email.
- Stat tiles or big-number dashboards.
- A coloured stripe down one side of a card or row.
- A modal to record a decision.
- Icon tiles above headings or in empty states.
- Truncated objection or justification text on a case view.
- More than one primary button on a screen.
