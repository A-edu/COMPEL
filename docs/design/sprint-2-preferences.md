# Sprint 2 design preferences

The design work for Sprint 2 that has **not been built yet**. Nothing here is live: the task below hasn't started, so read it as what the team wants, not as a description of the app.

Anyone building a Sprint 2 screen (§7 to §10) should read this first, and raise anything that conflicts with their story before building on it.

## Where the code stands

Checked on 2026-11-07 against `main` at `324c222` (§6 and §7 merged).

**Not started**
- Part 0: `docs/design/sprint-2.md` doesn't exist, and `AGENTS.md` hasn't been changed.
- Tokens: `globals.css` still uses the neutral values, and `components/app/` still has hard-coded neutrals.
- Surface: `surface.ts` still has the large soft shadow, and there is no `surfaceRaised`.
- Entity chip: still has the initials circle.
- `EmptyState` and `ErrorState`: still centred, with an icon tile.
- Every new shared piece, from `CaseHeader` to `EntityTag`, and the `/dev/sprint-2` route.

**Partly there**
- Officer header: the wordmark already links to `/review` and the chip reads "Compliance officer". Still missing: "Review console" after the wordmark, "SDAIA" in the chip, and the officer's email in `title`.
- `StatusBadge`: shows "Flagged" to officers through a `flaggedLabel` prop, with an amber dot. Still missing: the `variant` prop and the red `Flag` glyph.
- Review queue (`/review`): works, but in the older style. It has the tabs In queue, Flagged, Awaiting response and Decided, and an oldest/newest toggle. Still missing: tab order and names, counts, the Entity filter, Longest waiting and Most recent sorting, table columns and `WaitingTime`.
- Case view (`/review/[id]`): works, but in the older style. Still missing: the dossier layout, the decision panel and `DecisionRecord`. It also shows the objection text twice, which the design doesn't allow.

**Depends on other stories**
- Decision panel, `DecisionRecord` and the Decided filter's decision date need §8.
- "Provider reminded" in the record and `WaitingTime` need §9.
- Screens for the provider under review, the requester's outcome and the DPO requests list change with §8 and §9.

## To settle before building

The task was written before §6 and §7 were built, so some of it no longer matches. These points are recorded here and haven't been decided.

1. **`/auth/me`:** the task says it doesn't return a role. It does now, so the header can rely on it.
2. **"It builds no Sprint 2 screen":** the queue and case view already exist, so they need restyling to this design. Decide whether that belongs in this task or in a later one.
3. **`StatusBadge`:** the task says "Keep its look and API", then asks for one `variant` prop. Those conflict. The existing `flagged` and `flaggedLabel` props would also go, and their callers would change.
4. **Queue API:** counts per filter, the Entity filter and waiting-time sorting need API changes, but the task allows none. They need their own story work.
5. **Non-objection flags:** "A compliance officer is reviewing your objection", "You objected; sent for review" and "Provider objected, flagged for a decision" assume an objection. Spec §3.2 says a flagged request can't be assumed to have one, so Sprint 3 will need other wording.
6. **Geist Mono:** the design reference says references and email addresses only, while `AGENTS.md` also lists OTP digits. This only matters for the login screen, which is out of scope here.

## The task

The original task follows, unchanged.

---

# Task: Sprint 2 design foundation

Sprint 2 adds the compliance officer's review console and changes several entity screens (`specs/sprint-2.md` §3.1, §7–§9). Before those stories are built, this task puts the shared design in place: the design reference in the repo, the colour and surface tokens, the header, the status badge and the shared pieces every Sprint 2 screen is built from. **It builds no Sprint 2 screen and calls no new endpoint.** The stories (§6–§9) build their screens on top of it, following `docs/design/sprint-2.md`.

Read `AGENTS.md` in full, `specs/sprint-2.md` §1–§3 and §7–§10, and `apps/web/components/app/` (every file, including `README.md`). Work on a new branch `feat/sprint-2-design` off the latest `main`. Don't push without asking.

Three parts. **Stop and wait for my approval at each ⏸.**

---

## Part 0: Docs (one commit, no code)

1. Create `docs/design/sprint-2.md` with the text in the **Appendix** below, verbatim.
2. In `AGENTS.md` → Design system → **Inner screens**, make these changes and nothing else:
   - **Canvas and surfaces:** replace the bullet with:
     > - **Canvas and surfaces:** the page is a warm off-white canvas; content sits on surfaces (shadcn `Card` with the `surface` preset): a hairline ring, a 1 px contact shadow and a 12 px radius. Neutrals are tinted, never pure `#fff` or `#000`. One surface per job: sections inside a surface are divided by hairlines and headings, never by cards inside cards.
   - **States:** replace the bullet with:
     > - **States:** loading uses `Skeleton` shaped like the content it replaces. Empty and error states are text-led (a short heading, a sentence, an optional action), left-aligned inside the surface, with no icon tile.
   - Add a bullet at the end:
     > - **Sprint 2 screens** follow `docs/design/sprint-2.md`. Where it differs from this section, it wins for Sprint 2 work.
3. Commit as `docs: Sprint 2 design reference`. ⏸

---

## Plan ⏸

Reply with a short plan and wait:

1. Files you'll create or change.
2. Any shadcn component you need to add (check `components/ui/` first). No npm packages.
3. How the header learns the user's role. `GET /api/auth/me` doesn't return a role today; §6 (US-14) adds it. Build the header to read `role` when it's present and treat anything else as a DPO. Don't change the API.
4. Anything in the Appendix you find ambiguous or that conflicts with the code. List it; don't resolve it by inventing behaviour.

---

## Part 1: Build ⏸

### Tokens (`app/globals.css`, `:root` only; leave `.dark` and the login alone)

| Token | Value |
|---|---|
| `--canvas` | `#f5f5f3` |
| `--background`, `--card`, `--popover` | `#fdfdfc` |
| `--foreground`, `--card-foreground`, `--popover-foreground`, `--primary`, `--secondary-foreground`, `--accent-foreground` | `#141413` |
| `--primary-foreground` | `#fdfdfc` |
| `--secondary`, `--muted`, `--accent` | `#f0f0ed` |
| `--muted-foreground` | `#6b6a65` |
| `--border`, `--input` | `rgb(20 20 19 / 0.12)` |

Then replace hard-coded neutrals in `components/app/` (`bg-white`, `text-black`, `neutral-*`, `black/*`) with the tokens, so the tint reaches every inner screen. Sprint 1 screens must look the same apart from the tint.

### Surface (`components/app/surface.ts`)

Ring `rgb(20 20 19 / 0.08)`, shadow `0 1px 2px rgb(20 20 19 / 0.04)`. Drop the large soft shadow. Add `surfaceRaised` for the decision panel only: the same ring at 0.10 plus `0 12px 32px -20px rgb(20 20 19 / 0.25)`.

### Header

- **Remove the initials circle** from the entity chip. The chip keeps its pill: the entity name only, `text-sm font-medium`, truncated at about 240 px with the full name in `title`. Delete `entityInitials` and the `Avatar` usage if nothing else uses them; update `EntityChipSkeleton` to match.
- **Officer variant**, when `/auth/me` returns the compliance officer role: after the wordmark, a hairline divider and "Review console" (`text-[13px] text-muted-foreground`). The chip reads "Compliance officer" with "SDAIA" after it in muted text, and `title` holds the officer's email. The wordmark links to `/review` instead of `/requests`. Until the role exists, nothing changes for anyone.

### `StatusBadge`

Keep its look and API. Change the requester/provider logic to match §3.1 exactly, and add an officer-only `flagged` state:

| Shown as | Dot or glyph |
|---|---|
| Awaiting response | dot `#f79009` |
| Responded | dot `#10b981` |
| Under review (provider of a flagged request) | dot `#f79009` |
| Flagged (officer only) | lucide `Flag`, 11 px, filled `#d92d20`, no dot |
| Approved | dot `#10b981` |
| Rejected | dot `#f04438` |

Make the badge take one `variant` prop naming what to show, and let the caller decide which variant an audience gets. Leave the audience rules to the API and the story code.

### `EmptyState` and `ErrorState`

Text-led, left-aligned, inside the surface: `title` (15 px semibold), optional `description` (14 px, `text-muted-foreground`, max about 60 ch) and optional `action`. Remove the icon tile and the `icon` prop, and update the Sprint 1 call sites. `ErrorState` keeps **Try again** as an `outline` button.

### New shared pieces (`components/app/`)

Build each one from the Appendix (**Case parts**), with props shaped for the data the API already has or the stories will add. No page uses them yet. Put one example of each on a temporary dev-only route, `app/(app)/dev/sprint-2/page.tsx`, so they can be reviewed, and say how to remove it later.

- `CaseHeader`: back link, case title (28/34 semibold), then the reference, a `StatusBadge` and an optional meta line.
- `CaseLayout`: the two-column grid (`minmax(0,1fr) 340px`, 24 px gap). The right column is sticky at `top-[88px]`; its content is passed in.
- `DossierSection`: a section inside the dossier surface: `title`, optional right-hand meta (e.g. "1 reason"), children, with the top hairline.
- `EntityPair`: Requester and Provider side by side, each with its abbreviation tag, full name and an optional meta line ("Submitted …", "No response yet").
- `FlagReason`: source label, raised time and the verbatim text in a sunken block. The source label comes from a map keyed by source identifier, with the provider objection as the first entry. An unknown source shows its identifier rather than breaking (§3.2).
- `FileRow`: replaces `DocumentLink`. Sunken row with icon, filename (underlined on hover), a file-type tag (PDF or DOCX, from the name) and the download behaviour `DocumentLink` has today. Move the existing callers to it.
- `RecordTimeline`: ordered events, each with a dot colour, a title, an optional line beneath and a time.
- `DecisionRecord`: outcome with its dot, When, Officer (mono), Based on, the justification in full and the lock note. Read-only.
- `WaitingTime`: renders "Today", "1 day" or "n days" with tabular figures, semibold from a `threshold` prop (the 3-day reminder setting).
- `EntityTag`: the small abbreviation tag used in the queue (`GOSI`, `HRSD`), with the full name in `title`. This is fine in tables; it's only the header that loses the initials.

Update `components/app/README.md` with a line and a usage snippet for each new piece, and point Tasks 2 and 3 of this sprint to `docs/design/sprint-2.md`.

### Constraints

Only shadcn components and lucide icons; no new npm packages. No API, schema or test changes beyond what the Sprint 1 call-site updates need. Keep the Sprint 1 behaviour exactly. Keyboard-reachable everything, visible focus, no animation under reduced motion. Weights 400, 500 and 600 only.

### When done

Lint, type checks, tests and build pass. Don't run browser automation. End with the AGENTS.md summary and a manual checklist:

- Sprint 1 pages (list, new request, detail, provider response) look as before apart from the warmer tint; nothing is pure white or black
- the header shows the entity name with no initials circle
- `/dev/sprint-2` shows every new piece, the badge in all six states, and the new empty and error states
- `FileRow` downloads a document exactly as `DocumentLink` did ⏸

---

## Appendix: `docs/design/sprint-2.md` (save verbatim)

```markdown
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

Geist throughout. Geist Mono only for request references and email addresses.

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
5. **Record**: `RecordTimeline`: Submitted; Provider reminded (if sent); Provider objected, flagged for a decision (or Provider endorsed); Approved or Rejected with the officer's email and "both entities emailed".

Right column, one of:
- **Flagged, undecided:** decision panel (`surfaceRaised`).
  - Step 1 of 2: title "Decision", "Final once recorded. Nobody can change it afterwards, including you." Outcome as two radio options: **Approve** ("The request can go ahead. Both entities are emailed the outcome.") and **Reject** ("The request cannot go ahead. Both entities are emailed the outcome."). **Justification** textarea (8 rows, placeholder "Explain the decision in terms another officer could check later."), help "Seen by compliance officers only. Both entities see the outcome, never this text." Button **Review decision**.
  - Empty justification on Review: red border and "Write a justification before recording the decision."; stay on step 1.
  - Step 2 of 2: "Reject CMP-…?" (or Approve), the consequence plus "This can't be changed once recorded.", the justification echoed in a sunken block, "Recorded as {officer email}". Buttons: **Record rejection** / **Record approval** (primary) and **Back to edit** (ghost).
  - On success: toast "Decision recorded. Both entities have been emailed." and the page shows the decided state.
  - Another officer decided first: panel title "Already decided" with a red dot, "Another officer recorded a decision on this request at {time}. Yours was not saved.", the officer's own justification kept in a sunken block until they leave, and **See the recorded decision**.
- **Decided:** `DecisionRecord`, read-only, with the lock note "Final and permanent. The entities see "{outcome}"; only compliance officers see this record."
- **Pending:** "Decision" / "The provider hasn't responded, so there is nothing to decide yet." / "If {provider} objects, this request moves to Flagged and a decision becomes possible here. If it endorses, the request leaves the queue."

### DPO requests list (§9)
- Received tab: the tab shows a count of requests awaiting your response. One surface with two groups: **Awaiting your response** (columns From · Waiting · Status) and **Responded**. The waiting time turns semibold at the reminder period.
- Sent tab: **Waiting for a response** (To · Waiting · Status) and **Responded**.

### Provider: request under review
Two columns. Left: From, Documents, Record ("Received from {requester}", "You were reminded to respond", "You objected; sent for review"). Right: a strip "A compliance officer is reviewing your objection." / "You'll be emailed the outcome at your data office address. Nothing else is needed from you.", then **Your response** read-only (Position, Reason in full, RoPA entry).

### Requester: outcome
Two columns. Left: To, Documents you submitted, Record ("You submitted the request", "{provider} responded", "Approved/Rejected by a compliance officer"). Never the position, the RoPA entry, a flag or the justification. Right: **Outcome** panel with the dot and "Approved"/"Rejected" (22/28), "A compliance officer {approved/rejected} this request on {date}." On rejection: "This decision is final. To pursue the same data, submit a new request." and an outline **New request** button.

## Never
- A position, RoPA entry, flag or justification on a requester's screen, before or after the outcome.
- The justification anywhere an entity can see it, including email.
- Stat tiles or big-number dashboards.
- A coloured stripe down one side of a card or row.
- A modal to record a decision.
- Icon tiles above headings or in empty states.
- Truncated objection or justification text on a case view.
- More than one primary button on a screen.
```
