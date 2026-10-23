# Brief 2: The entity list, the requests list and sending a request

*For the team member taking Task 2. This is a plain-language summary; the step-by-step instructions for your coding agent are in `docs/prompts/prompt-sprint1-2-list-submit.md`.*

## Your part

1. **The requests list** (`/requests`, spec §8). The home screen after login. Two tabs, **Sent** and **Received**. Each row shows the title, the reference, the other entity's name and the status, and opens the request when clicked. A **New request** button sits top right.

2. **Sending a request** (`/requests/new`, spec §9, user story US-02). Pick the providing entity from a searchable list (every entity except your own), type a title, attach one request form and up to five supporting documents (each removable before sending). **Submit** only works once everything is valid. Each request gets a reference like `CMP-2026-000123`: the year plus a running number. Two people submitting at the same moment must never get the same number. This needs the sprint's only database change, so take care with it.

3. **The full entity list** (spec §5.5). Replace the four starter entities with roughly 40–60 Saudi ministries and authorities. This is research, not code: every name must be the official English name, checked on the entity's own website, with the link recorded. The four demo entities stay exactly as they are.

## Order of work

- Start the **entity research** on day one; it doesn't depend on anyone.
- Build the **list** and then **sending a request** once Person 1's shell and shared pieces are merged. Use their access rule and upload checks rather than writing your own.
- Person 3 needs your list and submission for the final isolation tests, so merge them as soon as they're ready.
- Clicking a request opens Person 3's request page. Until it exists, you'll see "Not found" there, which is expected.

## When you're done

- Logged in as `dpo@moh.example`, you see one sent request and two received ones (one awaiting, one responded), and nothing belonging to other entities.
- A valid submission creates the request as "Awaiting response", with a correct reference and its documents. Several submissions at the same time all get different references.
- The form refuses: your own entity as the provider, a missing request form, the wrong file type, a file that's too big, or more than five supporting documents.
- The seed runs cleanly with the full entity list, twice in a row, without duplicating anything.
- All tests pass.

## Good to know

- Run the app with the **Run** button (the Dev workflow), not by typing `npm run dev` in a Shell.
- After anyone adds a Secret, open a new Shell tab before running tests.
- Your database change and your entity list both reach the published app on its next start, so the database change must only add things, never remove or rename them.
- Your agent stops to ask you to approve its plan before writing code, and again before each pull request.
