# Task: Login — §6.1, then §6.2

Read `AGENTS.md` in full, then in `specs/sprint-1.md`: the Progress checklist, §2, §3, §4, §6.1 and §6.2. Work on a new feature branch (`feat/login`). Do not push without asking.

This task has four parts. **Stop and wait for my approval at each ⏸.**

1. Stage 0 — doc edits (one commit, no code)
2. Plan for Stage 1 and Stage 2 ⏸
3. Stage 1 — §6.1 auth API, tests, temporary form ⏸
4. Stage 2 — §6.2 designed login screen ⏸

---

## Stage 0 — Doc edits

Make these edits in a single commit (`docs: login prep`) before any code. Edit the repo copies; do not touch anything else in them.

**`specs/sprint-1.md`**

1. §7, Header bullet: remove the Demo badge. It becomes:
   > **Header:** "COMPEL" wordmark (links to `/requests`), the user's entity name, and **Log out**. Nothing else.

   Then search the whole repo (docs and code) for any other mention of a Demo badge and remove it.
2. §6.1, after the `proxy.ts` bullet, add:
   > - Rate limits on `otp/request` and `otp/verify` come from the rate-limit variables already set in Secrets and listed in `.env.example`.
3. §6.1, Done-when list: replace "an idle session returns 401 (use a short `SESSION_IDLE_MINUTES` in tests)" with:
   > - an idle session returns 401 (simulate time by backdating `lastSeenAt` in the test database, or use a short `SESSION_IDLE_MINUTES`)

   and replace "an expired code is rejected" with:
   > - an expired code is rejected (backdate `expiresAt` in the test database)
4. §13: append these rows (and if the table still has a row glued onto the previous one with `||`, split it onto its own line and put the rows in date order):

   | Date | Section | Change |
   |---|---|---|
   | 2026-10-23 | §5.6 | First publish verified: Replit did not offer to apply schema changes to production. Prisma migrations remain the only path. |
   | 2026-10-23 | §7 | Demo badge removed from the header; the app never reaches a production audience. |
   | 2026-10-23 | §6.1 | Rate limits read from the existing rate-limit variables. Tests may backdate timestamps instead of waiting for real time to pass. |

**`AGENTS.md`**

5. Environment variables block: if the rate-limit variables in `.env.example` are not listed there, add them with the same names and defaults.

**`CLAUDE.md`**

6. If it still points to `specs/sprint-1.md`, change it to `specs/sprint-1.md`.

**Rate-limit variable names.** The values are already in Secrets. Find their names in `.env.example`. If they are not there, list environment variable **names only** (`printenv | cut -d= -f1`; never print values) and identify them. If you cannot identify them unambiguously, stop and ask me before continuing.

---

## Plan ⏸

Before writing any code, reply with a plan for both stages and wait for approval. Approval of the plan counts as permission to install **exactly** the packages it lists; anything else needs a separate ask.

The plan must include:

1. **Every npm package to install**, with workspace, dev or runtime, and why. Check each `package.json` first and mark anything already installed. Expected:
   - `apps/api`: `@nestjs/throttler` (v6: `ttl` is in milliseconds), `nodemailer`, `@types/nodemailer` (dev), `cookie-parser`, `@types/cookie-parser` (dev); `class-validator` and `class-transformer` only if not already present.
   - `apps/web`: `motion` (import from `motion/react`); `input-otp` arrives with the shadcn component.
2. **Every shadcn component to add**: expected `button`, `input`, `label`, `field`, `card`, `input-otp`, `spinner`, and the React Bits Threads item via `npx shadcn@latest add @react-bits/Threads-TS-TW` (verified: no npm dependencies, white by default, mouse interaction off by default, and it freezes its own animation under `prefers-reduced-motion`). Use whichever primitives `components.json` is already configured for; do not change it.
3. The rate-limit variable names you found, and how you will apply them.
4. Files to create or change, per stage.
5. How tests will simulate time and reset rate-limit state.
6. Anything in §4, §6.1 or §6.2 you find ambiguous. Do not resolve those by inventing behaviour; list them.

No schema changes are expected; every model §6 needs exists from §5.2. If you believe one is needed, say so in the plan.

---

## Stage 1 — §6.1 Auth API, tests and temporary form ⏸

Implement exactly the auth endpoints in §4 and every invariant under AGENTS.md → Authentication invariants and Email. Points that are easy to get wrong:

**Requesting a code**
- Normalise the email (trim, lowercase). Always return the §4 message with 200, for unknown, inactive and active accounts alike.
- For an active user: invalidate any earlier unconsumed challenge, create a new one storing only the HMAC-SHA256 hash, then send the email.
- Response time must not reveal whether the account exists: dispatch the email without awaiting SMTP in the request path, and log send failures without the code.
- Record `OTP_REQUESTED` in `AuthEvent` (`userId` null when unknown, email as submitted, IP).

**Verifying a code**
- Only the latest unconsumed, unexpired, unlocked challenge for an active user can succeed. Compare hashes with `crypto.timingSafeEqual`.
- A wrong code increments `attempts` atomically. Once `attempts` reaches `OTP_MAX_ATTEMPTS`, the challenge is dead, even for the correct code.
- Consume the challenge with a conditional update (only where `consumedAt` is null), so two concurrent correct submissions cannot both log in.
- Every failure returns 401 `"Invalid or expired code."` and records `LOGIN_FAILED`. Success records `LOGIN_SUCCEEDED`, creates the session and returns `{ user, entity }` in the same shape as `GET /auth/me`.

**Sessions and guard**
- Token: 32 random bytes; store only its SHA-256 hash. Cookie `compel_session`: `httpOnly`, `SameSite=Lax`, `Path=/`, `Secure` unless the original host is `localhost` or `127.0.0.1` (behind the Next.js rewrite, check `X-Forwarded-Host` before `Host`).
- Make the session guard global, with a `@Public()` decorator for `otp/request`, `otp/verify` and the existing `GET /health`.
- On each request: reject when idle longer than `SESSION_IDLE_MINUTES` or past `expiresAt`; in that case delete the session, record `SESSION_EXPIRED`, return 401. Otherwise update `lastSeenAt` and attach exactly `{ userId, entityId }`.
- Logout deletes the session, clears the cookie with the same attributes, records `LOGOUT`, returns 204.
- Every error body is exactly `{ "message": string }`, including validation errors (use the first message) and 401s. Add a global exception filter if one does not exist.

**Rate limiting**
- Apply `@nestjs/throttler` to the two OTP endpoints only, with the values from the rate-limit variables. Track both the normalised email from the body and the client IP, so the limit holds even when many people share one IP and when one person rotates IPs.
- The 429 body is the exact §4 text.
- The API sits behind the Next.js rewrite (and Replit's proxy in front of that). Check in the workspace what `req.ip` and `X-Forwarded-For` contain for a request that comes through the rewrite, set Express `trust proxy` to match, and report what you found. Do not trust a client-supplied forwarding header beyond the configured hops.
- The throttler's in-memory store is per instance; Autoscale may run more than one. Note this in your summary; do not add a shared store.

**Mail module**
- As AGENTS.md → Email: Nodemailer SMTP from `SMTP_*`, `MAIL_FROM`, the `MAIL_REDIRECT_TO` switch, console fallback in development only, refuse to start in production without SMTP.
- Subject "Your COMPEL login code". Plain-text body: the code and its validity in minutes, nothing else.
- Validate the auth and mail variables at startup.

**Web**
- `proxy.ts` (Next.js 16: the file is `proxy.ts`, next to `app/`, exporting a function named `proxy`). Redirect to `/login` when there is no `compel_session` cookie, except on `/login`. The matcher must exclude `/api` (the OTP calls are made without a cookie), `_next/static`, `_next/image`, `favicon.ico` and other static files.
- A temporary, unstyled `/login` page: email field → code field → on success go to `/requests`. `/requests` returns 404 until §8; that is expected.

**Tests**
- Every test in the §6.1 Done-when list, as Supertest e2e against `TEST_DATABASE_URL` with the `local` storage driver and a mocked mail transport. Read codes from the mock; wait for the message to arrive, since sending is not awaited.
- Simulate time by backdating `expiresAt` and `lastSeenAt` in the test database, as the updated §6.1 allows.
- Reset throttler storage between tests so limits from one test cannot fail another. Do not disable or loosen throttling in the test environment to achieve this.
- Also assert: stored `codeHash` and `tokenHash` never equal the code or token, and the cookie has the attributes above.

**When Stage 1 is done:** run lint, type checks, tests and build; tick §6.1 in Progress in the same commit; then stop with the summary AGENTS.md requires. Include how I can try it in the workspace (`dpo@moh.example`, temporary form, shared Ethereal inbox) and what you found about the forwarded IP. ⏸

---

## Stage 2 — §6.2 Login screen design ⏸

Build §6.2 exactly as written, replacing the temporary form. Implementation notes:

**Layout and background**
- The login route is dark (apply shadcn's `dark` class on the login wrapper) on `#0a0a0a`. Do not change the global theme; inner screens stay light.
- Threads goes in a client wrapper component that loads it with `next/dynamic` and `ssr: false` (App Router only allows `ssr: false` inside a client component). Render `<Threads speed={0.3} enableMouseInteraction={false} />` and no other props, inside a `fixed inset-0 pointer-events-none` layer behind the card. The card must render before Threads loads; until then the plain `#0a0a0a` page shows.
- Card: shadcn `Card` with a solid (or barely translucent) dark surface, so text contrast never depends on the threads behind it.

**Email step**
- Use shadcn `Field`, `Label`, `Input` (`type="email"`, `autoComplete="email"`) and `Button` with `Spinner`. Email addresses, including the input's value, are in Geist Mono per AGENTS.md.
- For any error response §6.2 doesn't name, show the API's `message` inline.

**Transition**
- `AnimatePresence` with `mode="wait"`, about 250 ms; `useReducedMotion()` makes it instant. Move focus to the OTP input when the step appears, and back to the email input after **Change email**, so the flow works keyboard-only.

**OTP step**
- `InputOTP` with `maxLength={6}`, `pattern={REGEXP_ONLY_DIGITS}`, `inputMode="numeric"`, `autoComplete="one-time-code"`, `onComplete` → verify. Slots in Geist Mono.
- On 401: one shake of the slots (Motion keyframes on `x`, skipped under reduced motion), clear the value, set `aria-invalid` on the slots, show "Invalid or expired code." in an `aria-live` region. On 429: the API message.
- **Resend code** starts disabled with a 60-second countdown after every send, including the first.
- On success, go to `next` only if it is a relative path (starts with `/`, not `//` or `/\`); otherwise `/requests`. Use `router.replace`.

**When Stage 2 is done:** the temporary form is gone; lint, type checks, tests and build pass; tick §6.2 in Progress. Do not run Playwright or any browser automation. Instead, end with the summary plus a manual checklist I can run: desktop and phone widths, keyboard-only, reduced motion on, paste of a 6-digit code, wrong code, expired-session message (`/login?reason=expired`), resend countdown, and a `next` parameter (relative and absolute). ⏸
