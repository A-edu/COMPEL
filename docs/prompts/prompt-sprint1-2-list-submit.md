# Task 2: Entity list, requests list and submitting a request (§5.5, §8, §9)

Read `AGENTS.md` in full, then in `specs/sprint-1.md`: the Progress checklist, §2, §3 (especially **Reference generation**), §4, §5.4, §5.5, §8, §9 and §11. Two other people are building §7 (Task 1) and §10 and §11 (Task 3) at the same time; see **Coordination** before you plan.

Work on feature branches off the latest `main`. Do not push without asking.

This task has four parts. **Stop and wait for my approval at each ⏸.**

1. Plan ⏸
2. PR 1: §8 requests list (`/requests`) ⏸
3. PR 2: §9 submit a request (`/requests/new`) ⏸
4. PR 3: §5.5 entity list (research can start on day one, in parallel) ⏸

---

## Coordination

| Owner | Spec | Routes | API and shared code |
|---|---|---|---|
| 1 | §7 | `app/(app)/layout.tsx` (the shell) | Requests module skeleton and the **scoping helper**; documents module **upload check and storage helper**; `lib/api.ts`; `StatusBadge`, `Reference`, toasts, loading and error states; e2e fixtures and `loginAs` |
| **2 (you)** | §5.5, §8, §9 | `/requests`, `/requests/new` | `entities.json`; `GET /requests`; `GET /entities`; reference generation (the only migration); `POST /requests` |
| 3 | §10, §11 | `/requests/[id]` | `GET /requests/:id`; document download endpoint; `POST /requests/:id/response`; §11 isolation tests |

- Start PR 1 and PR 2 after Task 1's PR is merged: you need the shell, the scoping helper, the upload check and storage helper, and the test helpers. Use them; do not write second versions. Changes to them go through Task 1.
- §5.5 is research: the person can start collecting and checking entity names straight away.
- Task 3's §11 tests use your `GET /requests` and `POST /requests`, so merge PR 1 and PR 2 as soon as they are ready.
- Rows on `/requests` and the redirect after submitting link to `/requests/[id]`, which is Task 3's page. Until it exists, a 404 there is expected.

In the API, put your code in your own files inside `apps/api/src/requests/` (for example `requests-list.service.ts`, `request-submission.service.ts` and their controllers) and an `entities` module for `GET /entities`. Never query requests except through Task 1's scoping helper.

---

## Plan ⏸

Reply with a short plan and wait. Include:

1. Files to create or change, per PR.
2. Every shadcn component to add (expected: `tabs`, and the Combobox pieces `popover` and `command`; check `components/ui/` first). Multipart support should already be in place from Task 1; list anything else needed. Approval of the plan counts as permission to install exactly what it lists.
3. **The schema change for reference generation**: a per-year counter row or a Postgres sequence, used inside the same transaction that creates the request, so concurrent submissions can never get the same reference. It is the sprint's only planned migration, must be additive, goes in its own commit and must be flagged in your summary.
4. What happens to already-stored files if a submission's database transaction fails.
5. Anything in §4, §8 or §9 you find ambiguous. List it; do not resolve it by inventing behaviour.

---

## PR 1: §8 requests list ⏸

Branch `feat/requests-list`, after Task 1's PR is merged.

- `GET /requests?direction=sent|received` exactly as §4: `{ id, reference, title, status, createdAt, counterpartEntity: { id, name } }`, newest first, through the scoping helper; 400 for a missing or invalid `direction`.
- `/requests` exactly as §8, replacing Task 1's placeholder: **Sent** and **Received** tabs, active tab in the URL (`?tab=received`, default Sent); rows show only the title with the reference beneath it (`Reference`), the other entity's name and the status badge (`StatusBadge`); whole row clickable to `/requests/[id]`; **New request** top right to `/requests/new`; empty states "No requests sent yet." (with a **New request** button) and "No requests received yet.". No dates, counts or other columns.
- E2e tests with at least three entities: the counterpart is the provider in `sent` and the requester in `received`; newest first; other entities' requests never appear; invalid direction returns 400.

**Done when** the seeded `moh` DPO sees one sent request, one awaiting and one responded received request, and no other entity's requests. Tick §8. Stop with the AGENTS.md summary. ⏸

---

## PR 2: §9 submit a request ⏸

Branch `feat/submit-request`.

**API**
- `GET /entities`: `[{ id, name, slug }]`, sorted by name, **excluding the caller's own entity** (from the session).
- `POST /requests` (multipart, exactly as §4): `providingEntityId`, `title` (5–120 characters), `requestForm` (exactly 1 file, required), `supportingDocuments` (0–5 files), all files through Task 1's upload check and storage helper. Requesting entity and submitter from the session. Own entity as provider returns 400 (AGENTS.md → Access rules 4); an unknown provider returns 400. Generates `CMP-YYYY-NNNNNN` inside the transaction that creates the request and its `Document` rows; status `AWAITING_PROVIDER_RESPONSE`; 201 `{ id, reference, status }`.
- The migration in its own commit, as agreed in the plan.

**Web: `/requests/new`**, exactly as §9
- Combobox of `GET /entities`, searchable by name; title; one request form file; up to 5 supporting documents, each listed with its name and a remove button.
- Validation messages under each field; **Submit** disabled until the form is valid; while submitting, button spinner and fields locked.
- On 201: go to `/requests/[id]` with the toast "Request submitted". On 400: the API message at the top of the form. **Cancel** returns to `/requests`.

**Tests:** every test in the §9 Done-when list, as e2e, plus `GET /entities` excluding the caller's entity. For concurrent submissions, send several at once and assert every reference differs and matches the format.

**Done when** those tests pass, plus lint, type checks and build. Tick §9. Stop with the summary, flagging the migration. ⏸

---

## PR 3: §5.5 entity list ⏸

Branch `chore/entity-list`. Mostly research by the person, not code.

- Replace `apps/api/prisma/seed/entities.json` with roughly 40–60 Saudi ministries and main authorities. Keep the four demo slugs (`moh`, `zatca`, `gosi`, `hrsd`) and their names unchanged, because the seeded demo requests depend on them.
- `name`: the official English name, checked against the entity's own website. **Do not invent or guess names.** Produce a table of every name with the source URL the person checked; flag any not confirmed.
- `slug`: short, lowercase, letters and digits only, unique; the common abbreviation where one exists.
- A test that checks the file: slugs unique and valid, names unique, the four demo slugs present.

**Done when** the checks pass and `npm run db:seed` runs cleanly with the full list twice, the second run changing nothing. Tick §5.5. Stop with the summary and the source table. ⏸

---

## Workspace notes (learned in §6)

- Run the app with the **Dev** workflow (Run button). Do not also run `npm run dev` in a Shell tab; two copies fight over ports 3000 and 3001.
- Secrets added after a Shell opened are not visible in it. Open a new Shell before running tests. E2e tests need every variable in `.env.example`, including `OTP_RATE_*`.
- E2e files run one at a time against the shared test schema, and `database.e2e-spec.ts` expects it empty between files: clean up every row you create, and remove test files from `UPLOAD_DIR` one by one, never by prefix. Tests use the `local` storage driver only.
- Migrations: `npm run db:migrate` for additive changes only. The published app runs `prisma migrate deploy` and the seed on every start, so your migration and your entity list will run against its data.
- To update `main` locally without disturbing the running dev server: `git fetch origin main:main`, then check it out. Do not check out a stale `main` and pull afterwards.
- If `git push` fails with an authentication error, run `gh auth setup-git` once.
