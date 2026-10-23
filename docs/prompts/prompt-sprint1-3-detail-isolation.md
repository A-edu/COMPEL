# Task 3: Request page, provider response and entity isolation (§10, §11)

Read `AGENTS.md` in full, then in `specs/sprint-1.md`: the Progress checklist, §2 (especially 2 and 7), §3, §4, §10, §11 and §12. Two other people are building §7 (Task 1) and §5.5, §8 and §9 (Task 2) at the same time; see **Coordination** before you plan.

Work on feature branches off the latest `main`. Do not push without asking.

This task has four parts. **Stop and wait for my approval at each ⏸.**

1. Plan ⏸
2. PR 1: the request page `/requests/[id]` and downloads ⏸
3. PR 2: the provider response ⏸
4. PR 3: §11 entity isolation tests (last, once Task 2's list and submission are merged) ⏸

---

## Coordination

| Owner | Spec | Routes | API and shared code |
|---|---|---|---|
| 1 | §7 | `app/(app)/layout.tsx` (the shell) | Requests module skeleton and the **scoping helper**; documents module **upload check and storage helper**; `lib/api.ts`; `StatusBadge`, `Reference`, toasts, loading and error states; e2e fixtures (including a helper that creates a request directly in the test database) and `loginAs` |
| 2 | §5.5, §8, §9 | `/requests`, `/requests/new` | `entities.json`; `GET /requests`; `GET /entities`; reference generation; `POST /requests` |
| **3 (you)** | §10, §11 | `/requests/[id]` | `GET /requests/:id`; document download endpoint; `POST /requests/:id/response`; §11 isolation tests |

- Start after Task 1's PR is merged: you need the shell, the scoping helper, the upload check and storage helper, and the test helpers. Use them; do not write second versions. Changes to them go through Task 1.
- You do not need Task 2's work for PR 1 and PR 2: test against requests created by Task 1's fixture helper, and in the workspace use the seeded demo requests.
- PR 3 needs Task 2's `GET /requests` and `POST /requests` merged.

In the API, put your code in your own files inside `apps/api/src/requests/` (for example `request-detail.service.ts`, `request-response.service.ts` and their controllers) and register them in `requests.module.ts`. Never query requests except through Task 1's scoping helper.

---

## Plan ⏸

Reply with a short plan and wait. Include:

1. Files to create or change, per PR.
2. Every shadcn component to add (expected: `radio-group`, `textarea`, `alert-dialog`; check `components/ui/` first). Multipart support should already be in place from Task 1; list anything else needed. Approval of the plan counts as permission to install exactly what it lists.
3. How the detail endpoint guarantees the requester never receives `providerResponse` (the key omitted, not `null`).
4. How the response is written atomically (RoPA `Document`, `ProviderResponse`, status change in one transaction), how a second response gets 409 even when two arrive at once, and what happens to an already-stored RoPA file if the transaction fails.
5. Which §11 assertions you will cover, and how the test sets up entities A, B and C with a request from A to B.
6. Anything in §4, §10 or §11 you find ambiguous. List it; do not resolve it by inventing behaviour.

No schema changes are expected from you.

---

## PR 1: the request page and downloads ⏸

Branch `feat/request-page`.

**API**
- `GET /requests/:id`: the full §4 detail shape. 404 when the caller is not a party (scoping helper). `myRole` is `REQUESTER` or `PROVIDER`. `documents` lists only `REQUEST_FORM` and `SUPPORTING`. `providerResponse`: for the provider, `null` before responding and the §4 object after; for the requester, **omitted entirely**.
- `GET /requests/:id/documents/:documentId`: download with `Content-Disposition: attachment` and the original filename (safe for non-ASCII names). Only for a party; otherwise 404. A **RoPA** document requested by the **requester** returns 404 (AGENTS.md → Access rules 3).

**Web: `/requests/[id]`**, exactly as §10
- Both parties: title, reference beneath it (`Reference`), status badge (`StatusBadge`); one line "To <providing entity>" for the requester or "From <requesting entity>" for the provider; **Documents:** the request form and supporting documents, each a filename that downloads on click.
- Requester: nothing more.
- Provider after responding: the RoPA document (filename, downloads on click), the position, and the reason if any.
- Provider before responding: leave a clearly marked place for the **Your response** panel (PR 2).
- A non-party sees the shell's "Not found" or error state, never the request. Show only what §10 lists (AGENTS.md → Minimal inner screens).

**Tests** (e2e, Task 1's fixtures and `loginAs`): a party gets the detail; a non-party gets 404; the requester's detail contains no `providerResponse` key and the provider's does; request-form and supporting documents download for both parties; downloading the RoPA document as the requester returns 404 (create the response row directly in the test database for this PR).

**Done when** those tests pass, plus lint, type checks and build. Stop with the AGENTS.md summary. ⏸

---

## PR 2: the provider response ⏸

Branch `feat/provider-response`, after your PR 1 is merged.

**API: `POST /requests/:id/response`** (multipart, exactly as §4)
- `ropaDocument` (1 file, through Task 1's upload check and storage helper), `position` (`ENDORSED` | `OBJECTED`), `objectionReason` (required for `OBJECTED`, 10–1000 characters).
- 404 for a non-party (scoping helper); 403 for the requester (AGENTS.md → Access rules 2); 409 if already responded; 400 for validation.
- On success: 201 `{ status: "PROVIDER_RESPONDED" }`, with the RoPA `Document` (`kind: ROPA`), the `ProviderResponse` and the status change in one transaction. Read-only afterwards (§2.7).

**Web: the Your response panel**, exactly as §10
- **RoPA entry:** one PDF or DOCX file, required. **Position:** radio group, **Endorse** or **Object**. **Reason:** textarea shown only for **Object**, required, 10–1000 characters.
- **Submit response** opens a confirmation dialog: "Your response can't be changed after submission." → **Submit** / **Cancel**.
- While submitting: button disabled with spinner, fields locked. On 400: the API message in the panel.
- On 201: toast "Response submitted", and the page refreshes into the read-only state from PR 1.

**Tests:** every test in the §10 Done-when list, as e2e:
- the provider's response stores the RoPA document and position and sets `PROVIDER_RESPONDED`, in one transaction
- an objection without a reason returns 400
- a second response returns 409 (also with two submitted at once: exactly one succeeds)
- the requester gets 403 when submitting a response
- the requester's detail view contains no `providerResponse`, and downloading the RoPA document as the requester returns 404 (now with a real response)

**Done when** those tests pass, plus lint, type checks and build, and in the workspace a provider can respond once and sees the read-only state while the requester sees only the new status. Tick §10. Stop with the summary and a short manual checklist. ⏸

---

## PR 3: §11 entity isolation tests ⏸

Branch `test/entity-isolation`, after Task 2's PR 1 and PR 2 and your PR 2 are merged.

- One e2e file covering every §11 assertion with entities A, B and C and one request from A to B, created through the real `POST /requests`.
- "Changing `providingEntityId` or any entity ID in a request body cannot grant access": try entity IDs in every body and query string that accepts input (submission, response, list), and assert C still gets 404 and nothing is created or changed for another entity.
- Run the §12 demo script by hand in the workspace and report anything that does not match it.
- If a test fails because of someone else's code, do not change their code or weaken the test: report it with the failing assertion.

**Done when** every §11 assertion passes and the whole suite is green. Tick §11. Stop with the summary. ⏸

---

## Workspace notes (learned in §6)

- Run the app with the **Dev** workflow (Run button). Do not also run `npm run dev` in a Shell tab; two copies fight over ports 3000 and 3001.
- Secrets added after a Shell opened are not visible in it. Open a new Shell before running tests. E2e tests need every variable in `.env.example`, including `OTP_RATE_*`.
- E2e files run one at a time against the shared test schema, and `database.e2e-spec.ts` expects it empty between files: clean up every row you create, and remove test files from `UPLOAD_DIR` one by one, never by prefix. Tests use the `local` storage driver only.
- Responding to a seeded request in the workspace changes the shared demo data in the development database. That is fine for trying it out, but tell the team which request you used.
- To update `main` locally without disturbing the running dev server: `git fetch origin main:main`, then check it out. Do not check out a stale `main` and pull afterwards.
- If `git push` fails with an authentication error, run `gh auth setup-git` once.
