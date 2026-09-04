# Defect ledger — restructure (2026-09-04)

One line per bug found while building or verifying, with the commit that fixed
it. No landing closes with an open row; never report green with a known red.

| # | found in | what | fix (commit) | status |
|---|---|---|---|---|
| 1 | L1 server | `app/api/tasks/route.ts` and `app/api/milestones/route.ts` exported helper functions from route modules (Next refuses non-handler exports); `enrichProjects` / `milestoneRows` / `assertCanSeeTarget` moved to `lib/projects.ts`, `lib/milestones.ts`, `lib/comments.ts` | restructure: server layer WIP | fixed |
| 2 | L1 server | `app/api/projects/[id]/members/route.ts` invite path called `findUnique` with `{ id: undefined, email }` (invalid where) | restructure: server layer WIP | fixed |
| 3 | L1 shell | `useMe()` was typed as `UserDTO`, so `me.hasFamily` (the Family tab) did not type-check | restructure: shell + hooks | fixed |
| 4 | L1 tree | My notes' outline engine referenced dropped fields (gates, pins, tags, priority, group colours) and the seven-status enum | restructure: My notes tree trim | fixed |
| 5 | L1 Projects shot | Face initials kept punctuation: "Rahul (Director)" rendered "R(" in the top bar | restructure: Face initials strip punctuation | fixed |
| 7 | L1 Project shot | Deleting a milestone (or a project) left its notes behind — Comment has no FK to cascade from | restructure: comments swept on milestone/project delete | fixed |
| 6 | L1 rig | Three phase-21 account probes still expected a manager to mint/administer a fellow manager (phase 48 moved that up the chain); the snooze probe hard-coded its cron secret; the WhatsApp probe tested the meeting-created message the restructure removed | restructure: regression probes adapted | fixed |
| 8 | L1 People shot | The app frame (route title, task drawer host) asked `/api/projects` for every role, so the admin logged two 403s per page; `useProjects` now skips the request for ADMIN and PERSON | restructure: L1/L3 close-out | fixed |
