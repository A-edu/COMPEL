# Task: §6.2 revision — login screen

The §6.2 login screen works, but it is not acceptable visually: the Threads background does not render, and the card is shadcn defaults with no design. This task fixes both. The §6.1 behaviour and API stay exactly as they are.

Read `AGENTS.md` → Design system, and `docs/specs/sprint-1.md` §6.2. Stay on the `feat/login` branch. Do not push without asking.

Three parts. **Stop and wait for my approval at each ⏸.**

---

## Part 0 — Spec edits (one commit, no code)

In `docs/specs/sprint-1.md` §6.2:

1. Replace the **Card contents** paragraph with:
   > **Card contents.** "COMPEL" wordmark (Geist, semibold), then the heading **Sign in**. On the email step, below the heading: "Use your entity's DPO email. We'll send you a 6-digit code." On the OTP step, that line is replaced by "Code sent to" + the email (see OTP step). The heading stays on both steps.
2. In **Email step**, after the label bullet, add:
   > - Placeholder `name@entity.example`.
3. In **OTP step**, after the `Input OTP` bullet, add:
   > - Slot styling is adapted from Watermelon UI `input-otp-7` (MIT): two groups of three slots with a dash separator, raised slots with an inset highlight, and a ring and slight scale on the active slot (no scale under reduced motion). Slots are at least 44 px square.
4. Add a new paragraph at the end of §6.2, before **Done when**:
   > **Design latitude.** Copy, behaviour, components and constraints in this section and in AGENTS.md → Design system are fixed. Within them, the implementer decides the visual details (spacing, sizes, surfaces, borders, shadows, hover, focus and pressed states, and a subtle card entrance) and should produce a finished, production-quality screen, not component defaults.
5. In **Done when**, add: "the Threads background is visible behind the card."
6. Append to §13:

   | Date | Section | Change |
   |---|---|---|
   | 2026-10-23 | §6.2 | Tagline replaced by a "Sign in" heading and guidance line; email placeholder `name@entity.example`; OTP slots styled after Watermelon UI `input-otp-7` (MIT); design latitude added; Threads visibility added to Done when. |

Commit as `docs: §6.2 revision`.

---

## Plan ⏸

Reply with a short plan and wait:

1. **Threads diagnosis**: what you found in the current code and the fix (see Part 1).
2. **Install**: from `apps/web`, run `npx shadcn@latest add https://registry.watermelon.sh/r/input-otp-7.json` (npm, not pnpm). Its registry dependencies `input-otp` and `label` already exist: if the CLI asks to overwrite any existing file, answer **no**. No other packages.
3. **Visual direction** in a few sentences: card, type scale, spacing, input and button treatment, OTP slots, states, entrance. Use the direction under Part 1 as a starting point; you may deviate where you have a reason, and say what it is.
4. Files you will change.

---

## Part 1 — Build ⏸

### Fix the Threads background

The page currently shows only the plain `#0a0a0a`, which §6.2 allows only until Threads loads. Find the cause in the code. Likely candidates:

- The Threads layer uses a negative z-index and ends up behind the body's or a wrapper's own background.
- The layer or its parent has no height, so the canvas is 0 px.
- The dynamic import never renders, or the `ssr: false` wrapper is not mounted.

Use this stacking and nothing negative: page root (`#0a0a0a` background, `relative`, `isolate`, `min-h-dvh`) → Threads layer (`fixed inset-0 z-0 pointer-events-none`) → card (`relative z-10`).

The component renders nothing when `getContext('webgl2')` fails. Keep that as the fallback (the plain background), and add a development-only `console.warn` in your wrapper when WebGL2 is unavailable, so a blank background can be told apart from a bug. Do not edit the Threads source, and keep its props exactly `speed={0.3}` and `enableMouseInteraction={false}`.

### OTP slots from Watermelon UI

The installed `components/watermelon/input-otp-7.tsx` is a demo: it imports from `@/components/base-ui/…` (paths this project doesn't have), hard-codes a label, and has no `value`, `onChange`, `onComplete` or `pattern`. Do not use it as-is.

- Port its slot styling into the login OTP step: the 3–3 groups, dash separator, `bg-muted/50`, inset highlight, and active ring and scale. Keep every existing behaviour from §6.2 (digits only, `inputMode`, `autoComplete`, paste, auto-submit, disabled while verifying, shake, `aria-invalid`).
- Make the slots at least 44 px square with larger digits in Geist Mono. Wrap the active scale in `motion-safe:`.
- Check that Tailwind's `dark:` variant is class-based in this project, so the dark inset highlight applies under the login wrapper's `dark` class.
- Add a one-line comment where the styling lives: `Slot styling adapted from Watermelon UI input-otp-7 (MIT), https://ui.watermelon.sh`. Then delete the unused demo file.

### Copy

- Remove "PDPL compliance verification".
- Add the **Sign in** heading, the guidance line, and the placeholder `name@entity.example`, exactly as the revised §6.2 states.

### Visual direction (starting point)

- **Card:** about 400 px wide, generous padding. Solid near-black surface slightly lighter than the page, with a 1 px white border at low opacity and a faint inset top highlight that echoes the OTP slots. Larger radius than the default, and a soft shadow that separates it from the threads.
- **Type:** the wordmark is small and confident, with tight tracking, as a brand mark above the heading, not the largest text. **Sign in** is the clear heading. The guidance line is muted and comfortable to read. Use only the three allowed weights.
- **Fields:** taller inputs (about 44 px), subtle fill, a clear `focus-visible` ring, and a quieter placeholder than the input text.
- **Button:** white fill, black text, full width, with visible hover, pressed and disabled states. The spinner replaces the label without the button changing size.
- **Rhythm:** consistent spacing on a 4 px scale. **Change email** and **Resend code** are quiet text links, still keyboard-reachable with visible focus.
- **Entrance:** the card fades in and rises a few pixels, about 300 ms, instant under reduced motion. Nothing else animates besides the step transition and the shake.
- **Colour:** black and white only; red only for the error text.

### When done

Lint, type checks, tests and build pass. Do not run browser automation. End with the AGENTS.md summary: what caused the missing background, what you changed, and a manual checklist I can run:

- Threads visible in a normal browser tab (not only Replit's preview pane)
- both steps at desktop and phone widths
- keyboard-only
- reduced motion on (Threads shows as a still frame; no entrance, scale or shake)
- wrong code, paste, resend countdown ⏸
