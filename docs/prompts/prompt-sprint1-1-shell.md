# Task 1: App shell and shared foundations (§7)

Read `AGENTS.md` in full, then in `specs/sprint-1.md`: the Progress checklist, §2, §3, §4, §7, and skim §8–§11 to see what the others will build on your work. Two other people are building §5.5, §8 and §9 (Task 2) and §10 and §11 (Task 3) at the same time; see **Coordination** before you plan.

Work on a feature branch off the latest `main`. Do not push without asking.

This task has two parts. **Stop and wait for my approval at each ⏸.**

1. Plan ⏸
2. PR: app shell and shared foundations (Tasks 2 and 3 are waiting on this; keep it focused and merge it early) ⏸

---

## Coordination

| Owner | Spec | Routes | API and shared code |
|---|---|---|---|
| **1 (you)** | §7 | `app/(app)/layout.tsx` (the shell) | Requests module skeleton and the **scoping helper**; documents module **upload check and storage helper** (no endpoints); `lib/api.ts`; `StatusBadge`, `Reference`, toasts, loading and error states; e2e fixtures and `loginAs` |
| 2 | §5.5, §8, §9 | `/requests`, `/requests/new` | `entities.json`; `GET /requests`; `GET /entities`; reference generation (the only migration); `POST /requests` |
| 3 | §10, §11 | `/requests/[id]` | `GET /requests/:id`; document download endpoint; `POST /requests/:id/response`; §11 isolation tests |

Merge order: **your PR first**. Tasks 2 and 3 then work in parallel. Task 3's §11 tests come last.

In the API, each person puts their code in their own files inside `apps/api/src/requests/` and registers them in `requests.module.ts`, so keep the module file simple.

After your PR is merged, you are the team's reviewer for changes to the shared code above: if Task 2 or 3 needs a change to the scoping helper, the upload check or the shell, it goes through you.

---

## Plan ⏸

Reply with a short plan and wait. Include:

1. Files to create or change.
2. Every npm package and shadcn component to add (expected shadcn: `sonner`, `skeleton`, `badge`; check `components/ui/` first). Tasks 2 and 3 both need multipart uploads: check what `@nestjs/platform-express` already provides, and include any package needed for it here, so only one person installs it. Approval of the plan counts as permission to install exactly what it lists.
3. The shape of the scoping helper: how Tasks 2 and 3 call it, and how it guarantees every request query is filtered by the caller's `entityId` from the session, never from the client.
4. The shape of the upload check and storage helper that Tasks 2 and 3 will call.
5. How `lib/api.ts` handles a 401 and builds `next`.
6. Anything in §7 you find ambiguous. List it; do not resolve it by inventing behaviour.

No schema changes are expected from you.

---

## PR: app shell and shared foundations ⏸

Branch `feat/app-shell`.

**API**
- `apps/api/src/requests/requests.module.ts`, imported in `AppModule`.
- The **scoping helper**: one place that turns the session's `{ userId, entityId }` into a Prisma `where` for requests the caller's entity is a party to (requesting or providing). Every request query in the API goes through it (AGENTS.md → Access rules 1 and 5). Include a way to load one request as a party, or throw `NotFoundException` (404, never 403) when the caller is not a party. Unit-test it.
- `apps/api/src/documents/`: an **upload check** (PDF and DOCX only, checked by content type and extension, up to `MAX_UPLOAD_MB`, 400 with `{ message }` otherwise) and a **storage helper** that saves a file through `StorageService` under a generated, unique key (never the user's filename) and returns what a `Document` row needs (`storageKey`, `originalName`, `mimeType`, `sizeBytes`). No endpoints. Unit-test both with the `local` driver.

**E2e helpers** (in `apps/api/test/`, reusing `createTestApp`)
- A fixture builder that creates N entities, each with one active DPO, and cleans up after itself, including any requests, documents and responses created in the test, and any files written to `UPLOAD_DIR` (one by one, never by prefix).
- A helper that creates a request between two fixture entities directly in the test database (with a placeholder request-form `Document`), so Task 3 can test the request page before Task 2's `POST /requests` exists.
- `loginAs(app, mail, email)`: requests a code, reads it from the mocked transport, verifies it and returns the session cookie string. Move the `login` logic from `auth.e2e-spec.ts` into it without changing what that test checks.

**Web (§7)**
- Route group `apps/web/app/(app)/` with a layout: header with the "COMPEL" wordmark linking to `/requests`, the user's entity name (from `GET /api/auth/me`) and **Log out** (`POST /api/auth/logout`, then `/login`). Light theme. Nothing else in the header.
- `lib/api.ts`: the fetch wrapper every inner page uses, including multipart uploads. Any 401 redirects to `/login?reason=expired&next=<current path and query>`. Errors surface the API's `{ message }`.
- `StatusBadge` (`AWAITING_PROVIDER_RESPONSE` → amber "Awaiting response", `PROVIDER_RESPONDED` → green "Responded") and `Reference` (Geist Mono, small, muted).
- Sonner `Toaster` in the shell (success and error toasts only); a shared loading skeleton; a plain error state with **Try again**.
- A placeholder `/requests` page inside the shell, so the shell can be tried. Task 2 replaces it.

**Done when** lint, type checks, tests and build pass; the shell renders on the placeholder `/requests` page; **Log out** returns to `/login`; an expired session redirects with "Your session expired, please log in again." (simulate by deleting your session row, or backdating its `lastSeenAt`, in the development database). Tick §7. Stop with the AGENTS.md summary, including a short note for Tasks 2 and 3 on how to use each shared piece. ⏸

---

## Workspace notes (learned in §6)

- Run the app with the **Dev** workflow (Run button). Do not also run `npm run dev` in a Shell tab; two copies fight over ports 3000 and 3001.
- Secrets added after a Shell opened are not visible in it. Open a new Shell before running tests. E2e tests need every variable in `.env.example`, including `OTP_RATE_*`.
- E2e files run one at a time against the shared test schema, and `database.e2e-spec.ts` expects it empty between files: clean up every row you create.
- To update `main` locally without disturbing the running dev server: `git fetch origin main:main`, then check it out. Do not check out a stale `main` and pull afterwards.
- If `git push` fails with an authentication error, run `gh auth setup-git` once.
