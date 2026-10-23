# AGENTS.md — COMPEL

Standing rules for any coding agent working in this repository. They apply in every sprint. Read this whole file before starting a task.

## What COMPEL is

COMPEL verifies data-sharing requests between Saudi government entities against the Personal Data Protection Law (PDPL). A **requesting entity** submits a data-sharing request to a **providing entity**; the providing entity responds with its Record of Processing Activities (RoPA) entry and a position on the request. Later sprints add AI agents that extract fields from the documents and check them against PDPL.

This is a graduation project (KSU, Software Engineering). The app is a realistic demo, not a production system: it must never contact real people or real government addresses.

**The published Replit app is the official demo** and is submitted with the repository link at the end of each sprint. Every environment, including the published one, holds demo data only. "Production" in this repository means the published Replit deployment, not a real government system.

## Specs: what to build

- What to build lives in one spec per sprint: `docs/specs/sprint-<n>.md`. **The current sprint is `docs/specs/sprint-1.md`.**
- Tasks reference spec sections by number (e.g. "implement §6.1"). Read the referenced section, plus §2 (decisions), §3 (data model) and §4 (API contract) of the same spec, before writing code.
- The spec's **Progress** checklist shows what exists. Tick items in the same commit that completes them.
- If the spec and this file disagree, this file wins for rules; the spec wins for features. If a task contradicts the spec, stop and ask.
- Never renumber spec sections. Other documents reference them.

## Terminology

Use these terms exactly, in code and UI.

- **Entity**: a government body, with a name, a short slug and a data office email.
- **DPO**: a user. Belongs to exactly one entity.
- **Data-sharing request** ("request"): has a requesting entity and a providing entity. Whether an entity is the requester or the provider is decided **per request**; the same entity sends some requests and receives others. Users have no requester/provider role.
- **Reference**: the request's unique, human-readable ID.
- **RoPA entry**: the providing entity's Record of Processing Activities document for a request.
- **Position**: the providing entity's endorsement of, or objection to, a request.

## Access rules (enforce on every query)

1. A user can see a request only if their entity is its requesting or providing entity. Otherwise respond **404 Not Found**, never 403, so the request's existence is not revealed.
2. Only the providing entity's DPO can respond to a request (RoPA entry and position). A party to the request who is not the provider gets 403.
3. The requesting entity sees a request's status, but **not** the provider's RoPA document or position.
4. A DPO cannot create a request whose providing entity is their own entity.
5. All request queries go through one scoping helper in the API that filters by the current user's `entityId`. Never query requests directly from a controller, and never trust an entity ID sent by the client for authorization.

## Architecture

- **Monorepo** with npm workspaces:
  - `apps/api`: NestJS (default Express adapter), TypeScript, Prisma, PostgreSQL.
  - `apps/web`: Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui.
- **One origin.** Next.js rewrites `/api/*` to the NestJS server. The browser only talks to the Next.js origin, so the session cookie is first-party. Do not set up CORS for cookies; use the rewrite.
- **Database:** PostgreSQL via `DATABASE_URL` only. Prisma is the only way the API touches the database. Replit gives the workspace a development database and the published app a separate production database; both are reached through `DATABASE_URL`. Schema changes reach production only through Prisma migrations (`prisma migrate deploy`), never by hand.
- **File storage:** behind a `StorageService` interface with two drivers, chosen by `STORAGE_DRIVER`:
  - `replit`: Replit App Storage. Used in the workspace and the published app, because a deployment's filesystem does not persist across redeploys. The workspace and published app share one bucket and, for now, one prefix: every key starts with `STORAGE_PREFIX`, set to `demo` in both. Real uploaded documents get generated, unique keys, so the two environments never collide there; seed data is the deliberate exception — it uses fixed keys (e.g. `seed/<slug>-<slug>/request-form.pdf`) so the workspace and published app share one copy instead of each uploading a redundant one. **Never delete files in bulk or by prefix**, since that would remove the published app's documents too.
  - `local`: writes to `UPLOAD_DIR` (gitignored). Used by tests only.
  - Store files under generated keys, never the user's filename. Accept PDF and DOCX only, checked by content type and extension, up to `MAX_UPLOAD_MB`.
- **API modules:** `auth`, `entities`, `requests`, `documents`, `mail`, `storage`, `prisma`. Controllers stay thin; logic lives in services. Validate every request body with DTOs.
- **NestJS runs as ESM.** `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `@nestjs/testing` and `@nestjs/config` ship ESM-only from Nest 12 onward, so `apps/api/package.json` sets `"type": "module"`: relative imports use explicit `.js` extensions, `main.ts` uses a top-level `await bootstrap()`, and tests run on Vitest rather than Jest because of this (see Testing). If a *different* dependency turns out to be CommonJS-only and breaks under ESM, stop and report it instead of rewriting the build setup.

## Authentication invariants

Email OTP with server-side sessions. Endpoints and screens are in the sprint spec; these rules never change:

- No passwords, no JWTs, no sign-up. Accounts exist only through the seed script.
- OTP codes: 6 digits from `crypto.randomInt`; stored only as an HMAC-SHA256 hash keyed by `OTP_HASH_SECRET`; single-use; expire after `OTP_TTL_MINUTES`; locked after `OTP_MAX_ATTEMPTS` wrong attempts; compared in constant time.
- Responses never reveal whether an account exists or which part of a login failed.
- Sessions: random 32-byte token, stored only as a SHA-256 hash, sent as cookie `compel_session` (`httpOnly`, `Secure` except on localhost, `SameSite=Lax`, `Path=/`). Rejected after `SESSION_IDLE_MINUTES` idle or `SESSION_ABSOLUTE_HOURS` total. Logout deletes the session server-side.
- The session guard attaches `{ userId, entityId }` to each request. This shape is a contract; do not change it.
- Rate-limit code requests with `@nestjs/throttler`.
- Record login successes, failures, logouts and expiries in `AuthEvent`.
- Never store or log codes or tokens in plain text, except the dev-only console fallback under Email.
- **Never add a fixed code, master code or login bypass**, in any environment, including for tests.
- The Next.js `proxy.ts` (called middleware before Next.js 16) only redirects to `/login` when no session cookie exists. It is a convenience, not security; the API decides who is logged in.

## Email

- Send through Nodemailer over SMTP. **No email service provider (Resend, SendGrid, etc.).**
- The workspace and the published app both use **Ethereal**, a fake SMTP inbox that accepts every message and delivers none. The team shares one Ethereal account; set its `SMTP_*` values in the workspace Secrets and in the deployment's Secrets.
- **Safety switch:** whenever `MAIL_REDIRECT_TO` is set, in any environment, every outgoing email goes to that address regardless of recipient.
- If SMTP is not configured, log the OTP to the API console in development only, and refuse to start when `NODE_ENV=production`.
- All seeded addresses use the reserved `.example` domain. **Never** put a real email address (especially `.gov.sa`) in code, seed data, fixtures or tests.

## Seed data rules

- The seed script must **refuse to run unless `DEMO_MODE=true`**. It runs in the workspace and on every start of the published app, so it must be idempotent: running it again never duplicates or deletes data.
- Real Saudi government entity names are allowed; their addresses must be on `.example`. Flag any official name you are unsure of rather than guessing.
- Seeded documents are placeholder files clearly marked **"SYNTHETIC — DEMO DATA"**.
- Seed contents for the current sprint are defined in its spec.

## Design system

- **Identity:** black and white, simple and straight. Dark login screen; light inner screens.
- **Fonts:** Geist (UI) and Geist Mono via `next/font`. Geist Mono for request references, OTP digits and email addresses. Tabular figures in tables and dates. Weights: regular, medium, semibold only.
- **Colour exception:** red, amber and green only for status and errors, used small and only where they carry meaning.
- **Components:** shadcn/ui first. Do not hand-build what shadcn provides.
- **Motion:** animated backgrounds only on the login screen. Respect `prefers-reduced-motion` everywhere.
- **Minimal inner screens:** every screen after login shows only what the user needs to act. No dates, counts, IDs or metadata unless the spec lists them. When in doubt, leave it out.

## Environment variables

Keep `.env.example` complete and in sync. Never commit `.env`.

```
NODE_ENV=development
DEMO_MODE=true
DATABASE_URL=
TEST_DATABASE_URL=
OTP_HASH_SECRET=
OTP_TTL_MINUTES=5
OTP_MAX_ATTEMPTS=5
SESSION_IDLE_MINUTES=15
SESSION_ABSOLUTE_HOURS=8
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM="COMPEL <no-reply@compel.example>"
MAIL_REDIRECT_TO=
STORAGE_DRIVER=replit
STORAGE_PREFIX=demo
UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=10
API_PORT=3001
```

## Commands

All scripts below exist and are functional as of §5.4. `db:seed` requires a built `apps/api/dist` (it runs the compiled `dist/seed/seed.js`, not the `.ts` source directly — NestJS's decorator syntax isn't supported by Node's native TypeScript stripping) and refuses to run unless `DEMO_MODE=true`.

- `npm run dev`: start API and web together, in development mode
- `npm run build`: build both apps
- `npm start`: start the built API and web together (used by the published app)
- `npm run lint`
- `npm test`: unit and API e2e tests
- `npm run db:migrate`: `prisma migrate dev` (workspace only)
- `npm run db:deploy`: `prisma migrate deploy` (published app)
- `npm run db:seed`
- `npm run db:reset`: destructive, workspace only, see working rules

## Testing

- API: Vitest (Nest default, since Nest 12's core packages are ESM-only — see Architecture) for services; Supertest e2e for endpoints against a separate test database.
- Each spec section lists the tests that define "done" for it. A section is not done until they pass.
- E2e tests use `TEST_DATABASE_URL` (a separate Postgres schema in the development database) and the `local` storage driver. They must refuse to run if `TEST_DATABASE_URL` equals `DATABASE_URL`, and never touch the production database or App Storage.
- Tests read OTP codes from a mocked mail transport.
- Do not run Playwright or other browser automation inside Replit.

## Working rules for agents

- Work on a feature branch, never directly on `main`. Keep commits focused.
- **Ask before:** installing or upgrading any dependency, running `db:reset` or any migration that drops data, pushing to a remote, changing the deployment configuration, or changing auth or access-rule behaviour.
- Migrations must be additive where possible. A migration that drops or renames a column or table will run against the published app's data on its next start; flag it explicitly.
- **Run without asking:** lint, tests, build, type checks, `db:migrate` for additive changes.
- Schema changes go in their own commit and must be mentioned explicitly in your summary.
- Never weaken or delete a test to make it pass. If a test seems wrong, say so and explain why.
- Never invent requirements. If something is unspecified and matters, stop and ask.
- End every task with a short summary: what changed, how to try it, what is left, and any assumptions.
