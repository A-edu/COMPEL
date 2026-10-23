# Brief 1: The app shell

*For the team member taking Task 1. This is a plain-language summary; the step-by-step instructions for your coding agent are in `docs/prompts/prompt-sprint1-1-shell.md`.*

## Your part

**The shell** (spec §7) is the frame around every page after login: a simple header with the COMPEL name (click it to go home), the user's entity name, and **Log out**. If someone's session runs out, any page sends them back to the login screen with a "your session expired" message.

## The groundwork everyone needs

The other two can't really start until your work is merged, so you go first. Alongside the shell, your pull request sets up the shared pieces they build on:

- **The rule that keeps entities apart.** One piece of server code decides which requests a user may see: only those their own entity sent or received. To everyone else, a request simply looks like it doesn't exist. This is the most important thing you write.
- **File upload checks.** Only PDF and Word files, up to the size limit, stored under generated names, never the user's own filename. Person 2 uses this for request forms, Person 3 for RoPA documents.
- **Small shared parts:** the coloured status label ("Awaiting response" in amber, "Responded" in green), the way reference numbers are shown, success and error messages, loading placeholders and a "Try again" error state.
- **Test helpers** for creating test entities and requests and logging in during automated tests.

Keep it focused and get it merged early. Then write a short note for the other two on how to use each piece.

## After that

You become the keeper of the shared parts: if Person 2 or 3 needs a change to the access rule, the upload checks or the shell, they ask you. It's also a good moment to review their pull requests.

## When you're done

- Every inner page sits inside the shell.
- Log out returns you to the login screen.
- An expired session sends you to the login screen with "Your session expired, please log in again."
- All tests pass, and the other two can build on your pieces.

## Good to know

- Run the app with the **Run** button (the Dev workflow), not by typing `npm run dev` in a Shell.
- After anyone adds a Secret, open a new Shell tab before running tests.
- Your agent stops to ask you to approve its plan before writing code, and again before the pull request.
