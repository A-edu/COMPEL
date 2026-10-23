# Brief 3: The request page, the provider's response, and proving entities are kept apart

*For the team member taking Task 3. This is a plain-language summary; the step-by-step instructions for your coding agent are in `docs/prompts/prompt-sprint1-3-detail-isolation.md`.*

## Your part

1. **The request page** (`/requests/[id]`, spec §10). Both entities involved see the title, reference, status, one line saying who it's to (or from), and the attached documents, which download when clicked. The **requester** sees nothing more: never the provider's RoPA document or their position.

2. **The provider's response** (user stories US-04 and US-05). The providing entity's DPO sees a **Your response** panel:
   - upload their RoPA entry (one PDF or Word file);
   - choose **Endorse** or **Object**;
   - if objecting, write a reason (10–1000 characters);
   - confirm in a dialog: "Your response can't be changed after submission."

   Saving is all-or-nothing, and a response can be given only **once**; a second attempt is refused. Afterwards the panel becomes a read-only view of the response.

3. **Proving entities are kept apart** (spec §11, user story US-20). Automated tests with three entities: A sends a request to B, and C must not be able to see it, open its documents or respond to it in any way, even by tampering with IDs. The sprint isn't done until these pass. Finally, walk through the sprint review demo script (§12) by hand and report anything that doesn't match.

## Order of work

- Start once Person 1's shell and shared pieces are merged. Use their access rule and upload checks rather than writing your own.
- You don't need to wait for Person 2: test against requests created directly in the test database, and use the seeded demo requests in the app.
- The isolation tests come last, once Person 2's list and submission are merged. If they reveal a bug in someone else's code, tell them rather than changing their code or weakening the test.

## When you're done

- The provider can respond once; the status becomes "Responded"; a second attempt is refused.
- An objection without a reason is refused.
- The requester can't submit a response, can't see the response, and can't download the RoPA document.
- Entity C gets "Not found" for everything about A's request to B.
- All tests pass, and the demo script runs as written.

## Good to know

- Run the app with the **Run** button (the Dev workflow), not by typing `npm run dev` in a Shell.
- After anyone adds a Secret, open a new Shell tab before running tests.
- To try both sides, use two browser windows (one private). For example, log in as `dpo@zatca.example` to respond to the seeded request from `moh`, and as `dpo@moh.example` to see the requester's side. Login codes arrive in the shared Ethereal inbox. Responding changes the shared demo data, so tell the team which request you used.
- Your agent stops to ask you to approve its plan before writing code, and again before each pull request.
