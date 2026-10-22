
# Sprint 1 spec — COMPEL

What to build in Sprint 1. Standing rules (access rules, auth invariants, email safety, design system, working rules) are in `AGENTS.md` and are not repeated here.

**Section numbers are stable.** Handovers and prompts reference them. Add new material as new sub-sections or at the end; never renumber. Record every change in §13.

## Progress

- [ ] §5.1 Monorepo scaffold
- [ ] §5.2 Database and Prisma schema
- [ ] §5.3 Seed script
- [ ] §6.1 Auth API and temporary login form
- [ ] §6.2 Login screen design
- [ ] §7 App shell
- [ ] §8 Requests list
- [ ] §9 Submit a request
- [ ] §10 Request detail and provider response
- [ ] §11 Entity isolation tests

---

## §1 Scope

| Story | Meaning in Sprint 1 | Built in |
|---|---|---|
| US-01 / US-03 | One login for all DPOs: email → 6-digit OTP → session with inactivity timeout | §6 |
| US-02 | A DPO submits a data-sharing request to another entity with documents and gets a unique reference | §9 |
| US-04 | The providing entity's DPO uploads a RoPA document linked to the request | §10 |
| US-05 | The providing entity's DPO records a position: endorse, or object with a written reason | §10 |
| US-20 | Entity isolation: a user only sees requests their entity is a party to | §11 (rules in AGENTS.md) |

**Out of scope** (do not build): field extraction, compliance checks, reports, email notifications about requests, editing or withdrawing a submitted request, a reviewer/compliance-officer role, Arabic UI, pagination.

## §2 Confirmed decisions

1. **Documents only.** The request form has no typed purpose, legal basis or data-category fields. That information lives in the uploaded documents and is extracted in a later sprint.
2. **Requester sees status only.** The requesting entity never sees the provider's RoPA document or position in Sprint 1.
3. **Two statuses only:** `AWAITING_PROVIDER_RESPONSE` and `PROVIDER_RESPONDED`.
4. **One DPO per entity**, seeded for every entity, so any entity can log in and respond.
5. **Real entity names, `.example` addresses**, Ethereal for all email.
6. **Choosing the providing entity:** a searchable combobox of all entities, excluding the user's own. One request has exactly one providing entity.
7. **The provider responds once:** the RoPA document and position are submitted together, atomically, and are read-only afterwards.

## §3 Data model

Prisma models. IDs are `cuid()` strings. All models have `createdAt`; mutable ones also have `updatedAt`. Emails are stored lowercased.

**Entity**
- `name` (unique), `slug` (unique), `dataOfficeEmail`

**User**
- `email` (unique), `entityId` → Entity, `isActive` (default true), `role` enum `UserRole { DPO }` (default `DPO`; not used for access checks in Sprint 1)

**OtpChallenge**
- `userId` → User, `codeHash`, `expiresAt`, `attempts` (default 0), `consumedAt?`

**Session**
- `userId` → User, `tokenHash` (unique), `lastSeenAt`, `expiresAt` (absolute expiry)

**AuthEvent**
- `userId?` → User, `email` (as submitted), `type` enum `OTP_REQUESTED | LOGIN_SUCCEEDED | LOGIN_FAILED | LOGOUT | SESSION_EXPIRED`, `ip?`

**DataSharingRequest**
- `reference` (unique, `CMP-YYYY-NNNNNN`), `title`
- `requestingEntityId` → Entity, `providingEntityId` → Entity, `submittedById` → User
- `status` enum `RequestStatus { AWAITING_PROVIDER_RESPONSE, PROVIDER_RESPONDED }`
- Database check: requesting and providing entity must differ.

**Document**
- `requestId` → DataSharingRequest, `kind` enum `DocumentKind { REQUEST_FORM, SUPPORTING, ROPA }`
- `storageKey`, `originalName`, `mimeType`, `sizeBytes`, `uploadedById` → User

**ProviderResponse**
- `requestId` (unique) → DataSharingRequest, `ropaDocumentId` (unique) → Document
- `position` enum `Position { ENDORSED, OBJECTED }`, `objectionReason?`, `respondedById` → User

**Reference generation:** sequential per year, generated inside the same transaction that creates the request (a per-year counter row or a Postgres sequence). Concurrent submissions must never produce duplicates.

## §4 API contract

All endpoints are under `/api`. All except `otp/request` and `otp/verify` require a valid session (401 otherwise). Errors use `{ "message": string }`. Validation errors return 400.

### Auth

| Method & path | Body | Success | Errors |
|---|---|---|---|
| `POST /auth/otp/request` | `{ email }` | 200 `{ message: "If this email is registered, a code has been sent." }` (always) | 429 `"Too many attempts. Please wait a few minutes and try again."` |
| `POST /auth/otp/verify` | `{ email, code }` | 200 `{ user, entity }` + sets `compel_session` | 401 `"Invalid or expired code."` (all failures) · 429 |
| `POST /auth/logout` | — | 204, clears cookie | — |
| `GET /auth/me` | — | 200 `{ user: { id, email }, entity: { id, name, slug } }` | 401 |

### Entities

| Method & path | Success |
|---|---|
| `GET /entities` | 200 `[{ id, name, slug }]`, sorted by name, **excluding the current user's entity** |

### Requests

| Method & path | Body | Success | Errors |
|---|---|---|---|
| `GET /requests?direction=sent\|received` | — | 200 list (below), newest first | 400 invalid direction |
| `POST /requests` | multipart: `providingEntityId`, `title`, `requestForm` (1 file, required), `supportingDocuments` (0–5 files) | 201 `{ id, reference, status }` | 400 validation (incl. own entity as provider, file type/size) |
| `GET /requests/:id` | — | 200 detail (below) | 404 not a party |
| `GET /requests/:id/documents/:documentId` | — | 200 file download | 404 not a party, or a RoPA document requested by the requester |
| `POST /requests/:id/response` | multipart: `ropaDocument` (1 file), `position` (`ENDORSED`\|`OBJECTED`), `objectionReason` (required if `OBJECTED`, 10–1000 chars) | 201 `{ status: "PROVIDER_RESPONDED" }` | 400 validation · 403 party but not provider · 404 not a party · 409 already responded |

**List item:** `{ id, reference, title, status, createdAt, counterpartEntity: { id, name } }`. The counterpart is the providing entity in `sent`, the requesting entity in `received`.

**Detail:**
```
{
  id, reference, title, status, createdAt,
  requestingEntity: { id, name }, providingEntity: { id, name },
  myRole: "REQUESTER" | "PROVIDER",
  documents: [{ id, kind, originalName, sizeBytes, createdAt }],   // REQUEST_FORM and SUPPORTING only
  providerResponse: null | {                                       // only when myRole is PROVIDER
    ropaDocument: { id, originalName, sizeBytes, createdAt },
    position, objectionReason, createdAt
  }
}
```
For the requester, `providerResponse` is always omitted (§2.2).

**Files:** PDF or DOCX only, each up to `MAX_UPLOAD_MB`. Downloads use `Content-Disposition: attachment` with the original filename.

## §5 Foundation

### §5.1 Monorepo scaffold
- npm workspaces with `apps/api` (NestJS) and `apps/web` (Next.js App Router, TypeScript, Tailwind, shadcn/ui initialised, Geist and Geist Mono via `next/font`).
- Next.js rewrites `/api/*` to `http://localhost:${API_PORT}/api/*`.
- `GET /api/health` returns 200 `{ status: "ok" }`.
- Root scripts exactly as named in AGENTS.md → Commands. `.env.example` as in AGENTS.md. `uploads/` and `.env` gitignored.
- **Done when:** `npm run dev` starts both apps; the web app's home page fetches `/api/health` through the rewrite and shows "ok"; `npm run lint` and `npm test` pass.

### §5.2 Database and Prisma schema
- Prisma in `apps/api`, connected via `DATABASE_URL` (PostgreSQL). Schema exactly as §3. First migration created with `npm run db:migrate`.
- A `PrismaService` module used by all other modules.
- A separate test database URL for e2e tests.
- **Done when:** migrations run against an empty database and create every table in §3; the API starts and connects.

### §5.3 Seed script
- Entity list in `apps/api/prisma/seed/entities.json`: `[{ name, slug }]`, roughly 40–60 Saudi ministries and main authorities. A human must verify official names before the sprint review.
- For each entity: `dataOfficeEmail = dmo@<slug>.example`, and one active DPO user `dpo@<slug>.example`.
- Demo requests (slugs indicative; adjust if the list uses different ones):

| From → To | Title | State |
|---|---|---|
| `moh` → `zatca` | Supplier tax compliance verification | Awaiting provider response |
| `zatca` → `gosi` | Employer contribution records | Awaiting provider response |
| `hrsd` → `moh` | Occupational health records for labour inspections | Provider responded (endorsed) |

  This lets the `moh` DPO show a sent request, a received request, and a completed one.
- Each demo request gets a placeholder request-form PDF marked "SYNTHETIC — DEMO DATA"; the responded one also gets a placeholder RoPA PDF.
- Idempotent: running it twice gives the same result. Refuses to run in production.
- **Done when:** `npm run db:seed` on a freshly migrated database creates all entities, users and demo requests; a second run changes nothing.

## §6 Login (US-01, US-03)

### §6.1 Auth API and temporary login form
- Implement the auth endpoints in §4 and the session guard, following AGENTS.md → Authentication invariants and Email.
- Mail module: Nodemailer over SMTP, Ethereal config, `MAIL_REDIRECT_TO` switch, dev console fallback. OTP email subject "Your COMPEL login code"; body contains the code, its validity in minutes, and nothing else.
- A **temporary, unstyled** `/login` page (email field → code field) so everyone can log in before §6.2 exists. §6.2 replaces it.
- Next.js middleware: redirect to `/login` when there is no `compel_session` cookie, except on `/login` itself.
- **Done when** these API tests pass:
  - an unknown email gets exactly the same response as a known one
  - a correct code logs in and sets the cookie; `GET /auth/me` then returns the user and entity
  - a wrong code returns 401 "Invalid or expired code."
  - an expired code is rejected
  - after `OTP_MAX_ATTEMPTS` wrong attempts, the correct code is rejected
  - a used code cannot be reused
  - requesting a new code invalidates the previous one
  - an idle session returns 401 (use a short `SESSION_IDLE_MINUTES` in tests)
  - logout makes the session unusable
  - code requests beyond the limit return 429

### §6.2 Login screen design
**Layout.** Full-screen dark page. Background: React Bits **Pattern Waves**, white/grey on black, slow, click effects off, loaded client-side only after the card renders. Under `prefers-reduced-motion`: a static frame or plain dark gradient. Centred card with a solid or frosted dark surface; text contrast must not depend on the background.

**Card contents.** "COMPEL" wordmark (Geist, semibold) and the line "PDPL compliance verification".

**Email step**
- Label "Work email", shadcn `Input`, button **Send code**.
- Client-side check for a valid email format before sending.
- While sending: button shows a spinner and is disabled.
- On 200: transition in place to the OTP step (Motion `AnimatePresence`, about 250 ms; instant under reduced motion).
- On 429: inline message from the API.

**OTP step**
- Text "Code sent to" + the email in Geist Mono, and a **Change email** link back to the email step.
- shadcn `Input OTP`, 6 slots, Geist Mono, `inputmode="numeric"`, `autocomplete="one-time-code"`, paste fills all slots, auto-submits on the 6th digit.
- While verifying: slots disabled, small spinner.
- On 401: shake the slots once (skipped under reduced motion), clear them, show "Invalid or expired code." below.
- **Resend code** link, disabled for 60 seconds after each send with a visible countdown.
- On success: go to the `next` query parameter if it is a relative path, otherwise `/requests`.

**Session expired.** When redirected with `?reason=expired`, show "Your session expired, please log in again." above the email field.

**Done when:** the full flow works at desktop and phone widths, keyboard-only, and with reduced motion on; the temporary form from §6.1 is gone.

## §7 App shell
Applies to every page except `/login`. Light theme.

- **Header:** "COMPEL" wordmark (links to `/requests`), the user's entity name, a **Demo data** badge, the user's email in Geist Mono, and **Log out**.
- **Status badge** (shared component): `AWAITING_PROVIDER_RESPONSE` → amber, label "Awaiting provider response"; `PROVIDER_RESPONDED` → green, label "Provider responded".
- **Reference** (shared component): Geist Mono, with a copy-to-clipboard button.
- **Toasts:** shadcn Sonner for success and error messages.
- **Session handling:** any 401 from the API redirects to `/login?reason=expired&next=<current path>`.
- **Loading and errors:** skeletons while loading; a plain error state with **Try again** if a request fails.
- **Done when:** every inner page uses the shell; log out returns to `/login`; an expired session redirects with the message.

## §8 Requests list (`/requests`)
- Tabs **Sent** and **Received**, each with a count. Active tab kept in the URL (`?tab=received`); default **Sent**.
- **Sent** columns: Reference, Title, To, Submitted, Status.
- **Received** columns: Reference, Title, From, Received, Status. Rows awaiting this entity's response show a small "Action needed" marker.
- Newest first. Whole row clickable → `/requests/[id]`. Dates as e.g. "22 Oct 2026", tabular figures.
- **New request** button (top right) → `/requests/new`.
- Empty states: Sent: "You haven't sent any requests yet." with a **New request** button. Received: "No requests have been sent to your entity yet."
- **Done when:** the seeded `moh` DPO sees one sent, one received (marked "Action needed") and no other entity's requests.

## §9 Submit a request (US-02, `/requests/new`)

**Form fields**
1. **Providing entity:** shadcn Combobox fed by `GET /entities`, searchable by name. Required.
2. **Title:** text, 5–120 characters, required.
3. **Data-sharing request form:** one PDF or DOCX file, required.
4. **Supporting documents:** 0–5 PDF or DOCX files, optional. Each selected file shows name, size and a remove button.

**Behaviour**
- Validation messages appear under each field. **Submit** stays disabled until the form is valid.
- While submitting: button disabled with spinner; fields locked.
- On 201: redirect to `/requests/[id]` with a toast "Request CMP-… submitted".
- On 400: show the API message at the top of the form.
- **Cancel** returns to `/requests`.

**Done when** these API tests pass:
- a valid submission creates the request with status `AWAITING_PROVIDER_RESPONSE`, a correct reference and its documents
- the reference format is `CMP-YYYY-NNNNNN`, and concurrent submissions get unique references
- naming one's own entity as provider returns 400
- a missing request form, a wrong file type, an oversized file or more than 5 supporting documents returns 400

## §10 Request detail and provider response (US-04, US-05, `/requests/[id]`)

**For both parties**
- Header: reference (shared component), title, status badge.
- Facts: From (requesting entity), To (providing entity), Submitted date.
- **Documents:** the request form and supporting documents, each with name, size and download.

**For the requester**
- A line under the status: "Waiting for <providing entity> to respond." or "<providing entity> has responded."
- No RoPA document or position is shown.

**For the provider, before responding:** a **Your response** panel
- **RoPA entry:** one PDF or DOCX file, required.
- **Position:** radio group, **Endorse** or **Object**.
- **Reason for objection:** textarea shown only for **Object**, required, 10–1000 characters.
- **Submit response** opens a confirmation dialog: "Your response can't be changed after submission." → **Submit** / **Cancel**.
- On 201: toast "Response submitted", the page refreshes into the read-only state.

**For the provider, after responding:** read-only summary showing the RoPA document (downloadable), the position, the reason if any, and the response date.

**Done when** these API tests pass:
- the provider's response stores the RoPA document and position, and sets status `PROVIDER_RESPONDED`, in one transaction
- an objection without a reason returns 400
- a second response returns 409
- the requester gets 403 when submitting a response
- the requester's detail view contains no `providerResponse`, and downloading the RoPA document as the requester returns 404

## §11 Entity isolation tests (US-20)
Rules are in AGENTS.md → Access rules. Sprint 1 is done only when these e2e tests pass, using three entities A, B and C with a request from A to B:

- C gets 404 on the request's detail, its documents, and its response endpoint
- C's `sent` and `received` lists do not include it
- A's `sent` list and B's `received` list include it; A's `received` and B's `sent` do not
- changing `providingEntityId` or any entity ID in a request body cannot grant access to another entity's requests
- `GET /entities` never includes the caller's own entity

## §12 Sprint review demo script
1. Two browser windows: a regular one and a private one.
2. Window 1: log in as `dpo@moh.example`; open the Ethereal inbox to read the code.
3. Show **Sent** and **Received**; open the completed request from `hrsd`.
4. Submit a new request from `moh` to another entity with a synthetic document; show the reference and status.
5. Window 2: log in as that entity's DPO; find the request under **Received** with "Action needed".
6. Upload a RoPA document, choose **Object** with a reason, submit.
7. Back in window 1: refresh; the status is "Provider responded", with no RoPA or position visible.
8. Window 2: log out, log in as a third entity's DPO, and paste the request's URL: "Not found".

Log in just before presenting, so the 15-minute idle timeout doesn't log anyone out mid-demo.

## §13 Change log
| Date | Section | Change |
|---|---|---|
| 2026-10-22 | All | First version |
