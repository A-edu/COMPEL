# COMPEL

**PDPL compliance verification for data-sharing between Saudi government entities.**

COMPEL is a graduation project (King Saud University, Software Engineering). A requesting entity submits a data-sharing request to a providing entity; the providing entity responds with its Record of Processing Activities (RoPA) entry and a position on the request. Later sprints add AI agents that extract fields from the submitted documents and check them against the Personal Data Protection Law (PDPL).

## Status

**Sprint 1 — in progress.** The workspace is being scaffolded. See the Progress checklist at the top of [`specs/sprint-1.md`](specs/sprint-1.md) for what exists today.

Sprint 1 delivers:

- **Login** by email and a 6-digit one-time code, with sessions that expire after inactivity
- **Submitting a request** to another entity, with documents, and receiving a unique reference
- **Responding as the provider**: uploading the RoPA entry and endorsing or objecting to the request
- **Entity isolation**: each user sees only requests their entity is a party to

## How it works

There is one kind of user in Sprint 1: a **DPO** (data protection officer) belonging to one entity. Whether an entity is the requester or the provider is decided per request, so the same DPO sends some requests and receives others.

| Screen | What happens there |
|---|---|
| `/login` | Enter work email, then the 6-digit code from the inbox |
| `/requests` | **Sent** and **Received** tabs |
| `/requests/new` | Choose the providing entity, give a title, upload the request form and supporting documents |
| `/requests/[id]` | Request details; on a received request, the provider submits the RoPA entry and position |

## Tech stack

| Area | Choice |
|---|---|
| Monorepo | npm workspaces: `apps/api`, `apps/web` |
| API | NestJS (TypeScript), Prisma, PostgreSQL |
| Web | Next.js (App Router), Tailwind CSS, shadcn/ui |
| Auth | Email OTP with server-side sessions (no passwords, no JWTs) |
| Email | Nodemailer over SMTP through the team mailbox; every login code is redirected to it, whichever account it is for |
| Design | Black and white; Geist and Geist Mono; React Bits background on the login screen |
| Environment | Replit, with Claude Code |

## Repository layout

```
apps/
  api/          NestJS API, Prisma schema and seed
  web/          Next.js app
specs/
  sprint-1.md   What to build in Sprint 1 (sections are referenced by number)
AGENTS.md       Standing rules for coding agents and contributors
CLAUDE.md       Claude Code entry point (imports AGENTS.md)
.env.example    Every environment variable, with defaults
```

## Getting started

> The scripts below are **planned** and are created by the scaffold (§5.1 of the spec). Until then they will not run.

**Prerequisites:** Node.js LTS, a PostgreSQL database, and access to the team mailbox.

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure the environment**
   ```bash
   cp .env.example .env
   ```
   Then set at least:
   - `DATABASE_URL` — your PostgreSQL connection string
   - `OTP_HASH_SECRET` — any long random string
   - `SMTP_USER` and `SMTP_PASS` — the team mailbox's credentials
   - `MAIL_FROM` and `MAIL_REDIRECT_TO` — addresses on the team domain (see AGENTS.md → Email)

   - `TEST_DATABASE_URL` — the same connection string with a separate `schema=` parameter, for tests

   On Replit, put these in **Secrets** instead of a `.env` file.
3. **Create the database and demo data**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
4. **Start the app**
   ```bash
   npm run dev
   ```
   The web app serves everything, including the API under `/api`.

### Logging in

Every seeded entity has one DPO account:

```
dpo@<entity-slug>.example
```

The four demo entities, which own the seeded demo requests:

| Login email | Entity | Demo requests |
|---|---|---|
| `dpo@moh.example` | Ministry of Health | Sent one to `zatca` (awaiting); received one from `hrsd` (responded) |
| `dpo@zatca.example` | Zakat, Tax and Customs Authority | Received one from `moh` (awaiting); sent one to `gosi` (awaiting) |
| `dpo@gosi.example` | General Organization for Social Insurance | Received one from `zatca` (awaiting) |
| `dpo@hrsd.example` | Ministry of Human Resources and Social Development | Sent one to `moh` (responded) |

Any other entity in `apps/api/prisma/seed/entities.json` follows the same pattern. After entering the email, open the team mailbox to read the code. Every code arrives addressed to `otp@`, whichever DPO it is for, so request one code at a time and use the newest. If SMTP isn't configured in development, the code is printed in the API console instead.

To act as two entities at once, use a regular browser window and a private one, since they keep separate sessions.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the API and web app together, in development mode |
| `npm run build` | Build both apps |
| `npm start` | Start the built apps (used by the published app) |
| `npm run lint` | Lint both apps |
| `npm test` | Unit and API end-to-end tests |
| `npm run db:migrate` | Create and apply Prisma migrations (workspace) |
| `npm run db:deploy` | Apply existing migrations (published app) |
| `npm run db:seed` | Load entities, DPO accounts and demo requests; safe to re-run (requires `DEMO_MODE=true`) |
| `npm run db:reset` | **Destructive:** drop and recreate the workspace database |

## Published app

The published Replit app is the official demo and is submitted with this repository at the end of each sprint. It has its own production database and stores files in Replit App Storage. On every start it applies migrations and re-runs the seed, which never deletes data. Deployment settings are in §5.6 of the spec.

## Contributing

- Read [`AGENTS.md`](AGENTS.md) first. It holds the rules that apply in every sprint: access rules, auth security, email safety, design system and how agents should work.
- Work from the sprint spec. Tasks and handovers refer to its sections by number, such as "implement §9". Each section ends with the tests that define "done".
- Work on a feature branch and merge to `main` through a reviewed pull request.
- If a decision changes, update the spec (and its change log, §13) **before** writing the code for it.


