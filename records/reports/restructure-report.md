# Orbit restructure — report (2026-09-04)

Built and proven on the local clone of production. Production is untouched.
Tags: `baseline-phase49b` → `restructure-l1` → `restructure-l2` → `restructure-l3`
(local git in the project folder). Dev server left running on http://localhost:3000.

## Owner feedback, round 2 (afternoon) — see records/verdicts/restructure-owner-round-2.md

- Departments no longer look like people (one folder mark, no initials).
- Projects carry **P1 / P2 / P3** and arrange themselves (P1 on top, behind first
  within a level, finished last); picker in New project, chip on the project
  header opens the Priority sheet. The red dots are gone.
- Milestones run top to bottom in the order added; new ones land at the bottom.
- The percentage is **computed** (tasks done ÷ tasks); nobody types it; the
  Set-progress sheet is gone; the review card and message say "N% of tasks done".
- Task notes are plain **Comments** (no attachments); milestone/project notes keep files.
- "Put away" removed. Quick-add: tap "+ Add a task" in a box, type, Enter, next line.
- **Plan into milestones**: N boxes, tasks split equally in order, review dates
  spread to the deadline on working days, every review a meeting on the calendar
  with the day-before message; each task dated with its box's review day.

## Owner feedback, round 3 — the reschedule loop and the brief audit

- A "Can't" after a move now gets three **new** dates, all after the moved day
  (proven twice in a row: `records/evidence/restructure/reschedule-loop.txt`).
- A moved meeting stays on Today while it still needs you (no reply yet, or a
  Can't the organiser must act on), so the loop never disappears (defect #10).
- The brief's offline state was missing; built (defect #11).
- Brief audit: every screen, rule, message, redirect and model item in the brief
  is present, except the ones the owner reversed on purpose (manual %, faces on
  every task, attachments on task notes, Put away). What cannot work anywhere
  until credentials exist: **email and WhatsApp** — `.env` has no SMTP or Twilio
  variables (bell and push work; VAPID keys are present).

## Owner feedback, round 4 — one CEO

- The top role reads **CEO** (FOUNDER's label), and People shows a **Company**
  section above the departments holding the CEO (and any director), so the
  ladder reads CEO → heads of department → managers → leads → members.
- The clone had two test directors and no CEO; founder@orbit.local is now
  "Rahul", CEO, and the extra test accounts are gone. For production the real
  CEO's email goes into `scripts/promote-founder.ts` at apply time.
- Meetings: whoever can move a meeting sees **Postpone** at all times; their own
  "Can't" opens the three dates straight away. Deleting a project now sweeps
  its meetings (defect #12). A kept "Test project" sits in Development.

## Owner feedback, round 5 — the CEO's own number, Well Being for the CEO, department logos

- **Percentage:** Orbit counts the tasks; the CEO alone can tap the bar and set
  a number by hand ("Set by the CEO" under the bar) or hand it back to the
  count. Heads and managers cannot (403). Migration `20260904160000_progress_manual`.
- **Well Being** belongs to the CEO alone: the Family tab shows for the CEO,
  every other role is walled off (403); the tracked person's own login is untouched.
- **Department logos:** an icon matched to each department's name on a pastel
  tile — Projects list, department page, People headers.
- **Logins for every level on the clone** (all `orbit123`): founder@orbit.local
  (Rahul, CEO) · hod-dev@ / hod-ops@ / hod-rnd@ · test-manager@ / manager@ ·
  lead@ · dev@ · admin@ · arjun@gmail.com (tracked person).

## Owner feedback, round 6 — Family did not open for Rahul

- The edge guard in `middleware.ts` still sent everyone but a literal manager
  away from `/routine`, and the page's own guard agreed, so the CEO landed on
  Today. Both admit the CEO alone now (defect #13). Rahul's Family shows Arjun's
  tracker and weekly summary at 390 and 1440 with zero console errors; Arjun's
  own screen works and stays walled from work; "Monitoring managers" is hidden.

## Owner feedback, round 7 — only the CEO sees the whole company

- Departments and people are scoped on the server: the CEO (and a director,
  and the admin for accounts) see everything; everyone else sees their own
  department, a department they head, a department holding a project they are
  on, the CEO row and themselves. "Self" is the CEO's alone. The accounts line
  on People shows only to the CEO and the admin.

## Owner feedback, round 8 — the tick is a lead's to give

- A team member cannot mark a project task done (or undo one): the server
  refuses it, and on screen they see the tick as a read-only mark on project
  boxes, Today and the task drawer. Team leads and above tick. Members can
  still say Doing / Stuck, add tasks and comment.

## Owner feedback, round 9 — a person sees their department, nothing else

- Project visibility follows the department: the CEO sees everything; everyone
  else sees every project in their own department, any department they head,
  and what they own, lead, belong to or hold a task in. A team lead no longer
  sees the whole company. Departments and People follow the same rule.

## Owner feedback, round 10 — project logos, a better projects section, a way back

- Every project has a mark: its uploaded logo, or its icon on a tile in its
  own colour, or its first letter. Cards are recomposed around it (mark ·
  name + P chip · deadline + next / Behind · faces + bar + number).
- The project header opens with **‹ Projects** (back to its department), the
  mark (tap to open **Project look**: upload a logo, ten colours, 24 icons),
  the name, faces, P chip and deadline, then the bar.
- `Project.logoUrl` added (migration `20260904170000_project_logo`).

## Where things stand

| landing | what | state |
|---|---|---|
| L1 | model + migration, UI kit, nav, Today, Projects, Project, Give a task, task drawer, People, Settings | closed — `records/verdicts/restructure-l1.md` |
| L2 | review meetings, Calendar, the three messages, reply links, Reschedule, Needs your OK | closed — `records/verdicts/restructure-l2.md` |
| L3 | Family entry, drop rows deleted, jargon 0, all widths, walls, defect ledger closed | closed — `records/verdicts/restructure-l3.md` |
| prod | migration + deploy | **waiting on the owner's word** — `records/plans/apply-to-prod.md` |

What the owner has to give before prod: the founder's email (there is no FOUNDER
account yet; `scripts/promote-founder.ts <email>` makes one) and the word
"apply to prod". Vercel needs `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN` (for photo/PDF
notes; the camera and paper-clip hide without it) and `APP_URL` (for the reply
links) on top of the existing SMTP / Twilio / VAPID variables.

## 1. The map — what was touched

370 files since the baseline: 167 added, 131 deleted, 72 changed
(`git diff --stat baseline-phase49b..restructure-l3`).

| area | files | notes |
|---|---|---|
| Model | `prisma/schema.prisma`, `prisma/migrations/20260904120000_restructure/migration.sql`, `prisma/seed.ts` | Milestone, Comment, 4-status Task, ProjectStatus, User.departmentId, ProjectMember.canManage, EventAttendee.response |
| Server | `lib/types.ts` `serialize.ts` `validation.ts` `permissions.ts` `project-people.ts` `project-visibility.ts` `projects.ts` `milestones.ts` `comments.ts` `meetings.ts` `meeting-reply.ts` `messages.ts` `email-templates.ts` `notify.ts` `tomorrow.ts` `uploads.ts` `dates.ts` `status.ts` `steps.ts` | one source per set, compile-time assertions kept |
| Routes | `app/api/tasks`, `tasks/[id]`, `projects`, `projects/[id]`, `projects/[id]/members`, `projects/[id]/attendees`, `milestones`, `milestones/[id]`, `milestones/[id]/outcome`, `comments`, `comments/[id]`, `uploads`, `uploads/[name]`, `today`, `events`, `events/[id]`, `events/[id]/reply`, `events/[id]/reschedule`, `cron/tomorrow`, `calendar`, `users`, `users/[id]`, `users/me`, `app/r/[token]` | `/r` added to the public paths in `middleware.ts` |
| UI kit (new) | `components/ui/` — face, card, chip, row, sheet, drawer, button, empty-state, skeleton, connector, segmented | the only components screens are built from |
| Shell | `components/app-frame.tsx`, `help-sheet.tsx`, `command-palette.tsx`, `detail-panel.tsx`, `login-form.tsx` | tabs / rail, bell + Face menu, redirects in `next.config.mjs` |
| Screens | `components/today/*`, `projects/*`, `project/*`, `calendar/*`, `people/*`, `settings/*`, `task/task-drawer.tsx`, `notes/notes-thread.tsx`, `sheets/*` (give-task, new-project, add-people, department, add-milestone, move-review, set-progress, schedule-meeting, invite, person) | |
| My notes | `components/tree/*`, `lib/tree.ts` | trimmed to the 4-status model; My Space unchanged |
| Rigs | `scripts/flows.ts`, `perm-matrix.ts`, `jargon.ts`, `overlay-check.ts`, `contrast.ts`, `tokens.ts`, `integrity.ts`, `restructure-dump.ts`, `restructure-dryrun.ts`, `promote-founder.ts`; probes adapted: `check-phase21-accounts`, `check-phase23-snooze`, `check-phase32-whatsapp` | 19 rigs of dropped screens deleted (listed in the L3 commit) |
| Records | `records/plans/restructure-plan.md`, `apply-to-prod.md`, `records/verdicts/restructure-*.md` (9), `records/defects.md`, `records/evidence/restructure/` (65 files), `records/snapshots/`, `records/integrity-ledger.txt`, `README.md` (rewritten), `TRACKER_PRODUCT.md` (marked superseded) | |

Reuse (from the plan's map): kept — accounts, invites, password reset, rank rule,
admin cap, push, email and WhatsApp engines, bell + snooze, calendar engine,
My notes, Well Being. Adapted — tasks (one level of steps), projects (status from
health, manual %), notes (one Comment table with attachments), meetings (replies,
reschedule). Dropped — gates, priorities, tags/links/colours/pins, Focus, Review
queue, Changelog, department dashboards, tool tree on project pages, project
collaborators (→ `canManage` members), the task-due cron, all-hands event UI.

## 2. Migration — SQL and counts

`prisma/migrations/20260904120000_restructure/migration.sql`: 54 statements, one
transaction. Order: dump (`scripts/restructure-dump.ts`) → rehearse with rollback
(`scripts/restructure-dryrun.ts`) → `prisma migrate deploy` → audit → integrity.

1. `User.departmentId` + backfill (HOD → headed department; else the department
   of the projects a person owns / leads / belongs to / holds tasks in, weighted
   1000 / 10 / 5 / 2 / 1).
2. `Milestone` table + `CalendarEvent.milestoneId` + `Milestone.reviewEventId`.
3. `Task`: `TaskStatus` enum via a `status2` column swap (BACKLOG, PLANNED → TODO;
   IN_PROGRESS → DOING; ON_HOLD, BLOCKED → STUCK; DONE, CANCELLED → DONE);
   `important` from P0/P1; `archived` from CANCELLED; `milestoneId`, `givenById`;
   drop priority, gates, tags, links, color, groupColor, pinnedAt.
4. `Project`: `ProjectStatus` from health (ACTIVE, PAUSED, SHIPPED → DONE, IDEA →
   PLANNED); `startDate` = createdAt; `progress` 0; drop health, gateTemplate.
5. `Comment` ← TaskNote + ProjectNote + project tasks' descriptions (then blanked;
   My notes keep `descriptionMd`); drop the two note tables.
6. `ProjectMember.canManage` ← ACCEPTED ProjectManager; drop ProjectManager.
7. `EventAttendee.response`, `respondedAt`.

Counts on the clone (= prod data, 2026-09-03 dump):

| what | before | after |
|---|---|---|
| users / placed in a department | 16 / — | 16 / 12 |
| projects ACTIVE · DONE | 3 ACTIVE, 1 SHIPPED | 3 ACTIVE, 1 DONE |
| tasks by status | 41 BACKLOG · 2 IN_PROGRESS · 100 DONE · 1 CANCELLED (+ private) | 51 TODO · 2 DOING · 0 STUCK · 100 DONE |
| important (was P0/P1) | 6 | 6 |
| archived (was CANCELLED) | 1 | 1 |
| comments | 1 task note, 2 project notes, 1 description | 2 TASK · 2 PROJECT |
| members with canManage (was ACCEPTED ProjectManager) | 0 | 0 |
| milestones | — | 0 (the founder adds them) |

## 3. Role × action matrix (server-enforced; the UI only hides)

| action | FOUNDER / DIRECTOR | HOD (own dept) | MANAGER (owner or canManage) | TEAM_LEAD | RESOURCE on the project | anyone not on it | ADMIN / PERSON |
|---|---|---|---|---|---|---|---|
| See a project | ✓ | ✓ | ✓ | ✓ (led) | ✓ | 404 | 403 |
| New project (in a department) | ✓ | ✓ | ✓ any dept | ✗ | ✗ | ✗ | ✗ |
| Edit name / lead / dates / status | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Set progress % | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Add people / invite new | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Add / move / delete a milestone | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Give a task to anyone on the project | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Give a task to someone not yet on it | ✓ (auto-adds) | ✓ | ✓ | ✓ (auto-adds) | 400 | ✗ | ✗ |
| Edit / reassign / finish / put away a task | ✓ | ✓ | ✓ | ✓ | ✓ | 404 | ✗ |
| Notes + attachments | ✓ | ✓ | ✓ | ✓ | ✓ | 404 | ✗ |
| Record a review outcome (Needs your OK) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Schedule a meeting | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| I'll be there / Can't | attendees only, in-app or by signed link | | | | | | |
| Reschedule after a Can't | organiser, FOUNDER, DIRECTOR | | | | | | |
| People page | every work role; RESOURCE sees it read-only | | | | | | ADMIN ✓ |
| Family | a MANAGER who owns or monitors a Person | | | | | | |

"On the project" = lead, owner, member, or holder of a live task in it. Proven
by `records/evidence/restructure/perm-matrix.txt` (113/113).

## 4. Screens and copy

- **Nav** — bottom tabs / rail: Today · Projects · Calendar · People · Family
  (only with a Person). Top bar: bell + Face → "My notes", "Account",
  "Notifications", "How Orbit works", "Sign out". Admins land on People.
- **Today** — executive summary line ("2 projects behind · 1 review this week");
  "Your tasks" (round check, ★, date chip, giver's Face); "Meetings" with
  [I'll be there] [Can't], "You said…" + "Change", [Reschedule] → "Move this
  meeting" with three days as words → toast "Moved · everyone will get a new
  message"; "Needs your OK" ("<Milestone> review · <Project>", "You set N%. x of
  y tasks done.", "How far along?", [On track] [Needs work] → "Sent to the
  project"); empty "Nothing waiting on you."; floating + = Add a task.
- **Add a task** (owner's feedback the same day: tasks are lines inside a
  milestone, not things handed to a person one by one) — "What needs doing?" →
  "Add". **Two taps.** "Give it to someone? (optional)" defaults to "No one";
  the faces on the project follow, and "Someone else…" opens everyone in the
  company (they join the project with the task). "By when?" defaults to the
  box's review date. Toast "Added", or "Sent to <name>" when someone was picked
  (that is the only time the task_given message goes out). A face shows on the
  row only when someone holds the task.
- **Projects** — two levels (owner's feedback the same day: departments
  first). Level 1: "Find a project" and one row per department — the head's
  Face, name, "4 projects · 2 behind" / "No projects yet"; [+ New project].
  Level 2 (tap a department; Back returns): the department name and count,
  [All] [Mine] [Behind], the cards: lead Face +N, 12px bar + %, deadline chip,
  "Next: <milestone> · <date>"; behind first; [+ New project] there (Name ·
  Department · Lead · Start · Deadline). Searching shows matching projects
  across every department at once.
- **Project** — "PROJECT START · <date>", connectors, boxes "MILESTONE n" with
  name, "REVIEW <date>", rows check · title · Face, "+ Give a task", note
  bubble beside/under, current box accented, past boxes folded, "Not in a
  milestone yet", "+ Add milestone"; tasks drag between boxes (long-press on a
  phone) or "Move to…" from the drawer; "Set how far along" (founder/director).
- **Task drawer** — title, done, ★, Who / When / Status sheets, Steps checklist,
  Notes (text · photo · file), "Put away", "Delete".
- **Calendar** — month grid (desktop) / strip + agenda (phone); chips "11:00
  <milestone> review", meetings, deadline marks, task dates; day panel with
  replies ("2 coming · 1 can't · 1 no reply yet"); [+ Schedule meeting] →
  "Which project?" "Who?" "When?" "What's it about?"; reviews say "Move it from
  the project page".
- **People** — "Find a person", [+ Invite] (name, email, role, department),
  department sections with "Head of department", "Not placed yet", person sheet
  (department, role, disable, reset), "Accounts are looked after by …".
- **Account / Notifications** — name, email, password; push / email / WhatsApp
  switches, number, "Send test".

## 5. Messages and crons

| key | to | when | channels |
|---|---|---|---|
| `task_given` | the assignee | on give / reassign | bell · push · email · WhatsApp |
| `tomorrow` | one per person | 18:00 IST, only if they have a meeting, review, or task due tomorrow (or overdue) | bell · push · email · WhatsApp, with signed [I'll be there] [Can't] links |
| `review_result` | the project's people | when the founder/director records an outcome | bell · push · email · WhatsApp |

`vercel.json`: `/api/cron/tomorrow` at `30 12 * * *` (18:00 IST) and
`/api/cron/snooze-wake` hourly. `cron/task-due` is gone. Meeting create / move /
cancel write a bell row only. Bodies built on the clone:
`records/evidence/restructure/message-b-email.html`, `.txt`, `message-b-whatsapp.txt`.

## 6. Screenshots (records/evidence/restructure)

Today: today-founder-{390,768,1440}, today-dev-{390,768,1440}, today-give-390,
today-meeting-390, today-reschedule-390, today-ticked-390, today-founder-empty-390.
Projects: projects-founder-{390,768,1440}, projects-dev-{390,768,1440},
projects-rahul-390, projects-new-390, projects-rahul-new-390, projects-dept-390.
Project: project-{390,768,1440}, project-give-390, project-add-milestone-390,
project-move-review-390, project-progress-390, project-note-390,
project-past-open-390, project-drag-1440, project-after-drag-1440.
Calendar: calendar-{390,768,1440}, calendar-day-{390,768,1440}, calendar-day-dev-390,
calendar-schedule-390, calendar-tasks-1440, calendar-day-tasks-1440,
calendar-task-drawer-1440, calendar-review-1440, calendar-review-day-1440.
People: people-{390,768,1440}, people-invite-390, people-person-390, people-admin-390.
Settings: settings-{390,768,1440}, settings-notifications-390.
Family: family-tab-{390,1440}, family-routine-{390,1440}.
Every capture: zero console errors, zero page errors, no horizontal overflow.

## 7. Suites and flows

`npm run flows` (`records/evidence/restructure/flows.txt`), verbatim:

```
── F1 founder → project → milestone → task → member → 25% ────────────
PASS  F1 new project  (status 201)
PASS  F1 add milestone creates its review meeting  (status 201)
PASS  F1 give a task (one request = 3 taps)  (status 201)
PASS  F1 message (a) task_given reached the member's bell  (Flow director gave you a task)
PASS  F1 member sees it on Today
PASS  F1 member checks it
PASS  F1 founder/director sets 25%
PASS  F1 manager cannot set the %  (status 403)
PASS  F1 manager who runs it can rename it  (status 200)
PASS  F1 review meeting invites the task holder

── F2 18:00 the day before → (b) → Can't → Reschedule → (b) again ────
PASS  F2 schedule a meeting for tomorrow  (status 201)
PASS  F2 cron/tomorrow runs with the secret  (status 200, people 3)
PASS  F2 cron/tomorrow without the secret → 401
PASS  F2 message (b) reached the member's bell  (Tomorrow: 1 meeting · 1 due)
PASS  F2 (b) built for the member with a meeting + a task
PASS  F2 (b) carries a signed Can't link
PASS  F2 Can't link lands (public, no session)
PASS  F2 Can't recorded on the attendee row
PASS  F2 organiser told (bell)
PASS  F2 three working-day slots  (["2026-09-07T00:00:00.000Z","2026-09-08T00:00:00.000Z","2026-09-09T00:00:00.000Z"])
PASS  F2 reschedule moves it and re-sends (b)  (resent 2)
PASS  F2 (b) re-sent after the move (bell)

── F3 review date → Needs your OK → On track → (c) ────────────────────
PASS  F3 Needs your OK lists the review
PASS  F3 member does NOT get Needs your OK
PASS  F3 manager cannot record an outcome  (status 403)
PASS  F3 On track recorded
PASS  F3 outcome note beside the box
PASS  F3 % set with the outcome
PASS  F3 message (c) reached the project people  (FLOW Milestone due: On track)
PASS  F3 next box is current (M1 has no outcome)

── F4 walls ───────────────────────────────────────────────────────────
PASS  F4 PERSON walled on 20 work endpoints  (20/20)
PASS  F4 ADMIN walled on project endpoints  (403,403,403,403,403)
PASS  F4 member creates a private note
PASS  F4 My notes 404 cross-user (lead, director)  (404/404/404)

── F5 invite with department → set password → placed on People ─────────
PASS  F5 invite with a department  (status 201)
[email] SMTP env not set (SMTP_HOST/PORT/USER/PASS, EMAIL_FROM) — email disabled
PASS  F5 set password via the invite link
PASS  F5 placed on People under the department  (ACTIVE · Development)

── teardown ──────────────────────────────────────────────────────────
removed 6 throwaway accounts and their artefacts

37 passed, 0 failed
```

`npm run perm-matrix` — 113 passed, 0 failed, sections: departments · new
project · seeing a project · add people · edit project · give a task · reassign /
edit a task · steps · milestones · review outcome · notes · meetings · accounts ·
walls: admin · walls: person · cron · My notes isolation · cleanup (0 residue).

Regression (`regression.txt`, 306 PASS / 0 FAIL):

| probe | pass |
|---|---|
| check-phase21-accounts (login, invite, reset, rank rule, admin cap) | 27 |
| check-last-manager-guard | 1 |
| check-password-change | 8 |
| check-phase23-snooze (bell + snooze) | 24 |
| check-phase32-whatsapp (task_given via Twilio mock) | 26 |
| check-phase33-personal (My notes isolation) | 53 |
| check-phase35-routine (Well Being) | 42 |
| check-phase36-weight | 22 |
| check-phase37-person-habits (PERSON wall) | 33 |
| check-phase38-summary | 17 |
| invite-lifecycle | 14 |
| check-phase39-collab (routine collaborators) | 34 |
| check-phase23-migration (additive audit) | 5 |

Static gate: `tsc` 0 errors · `next lint` clean · `npm run tokens` PASS ·
`npm run contrast` 36/36 · `npm run jargon` 0 hits (98 files) · `npm run
overlays` 10/10 · `npx next build` passed.

## 8. Defect ledger (records/defects.md)

| # | where | what | status |
|---|---|---|---|
| 1 | server | route modules exported helpers (Next forbids) → moved to lib | fixed |
| 2 | server | members invite path used an invalid `findUnique` where | fixed |
| 3 | shell | `useMe()` typed without `hasFamily` (Family tab) | fixed |
| 4 | My notes | tree engine referenced dropped fields and the seven statuses | fixed |
| 5 | Projects | Face initials kept punctuation ("R(") | fixed |
| 6 | rigs | three probes expected pre-phase-48 rules / a removed message / a hard-coded secret | fixed |
| 7 | Project | deleting a milestone or project orphaned its notes | fixed |
| 8 | People | the frame fetched projects and Today for the admin (403s in the console) | fixed |
| 9 | integrity | 13 `RS-` rig rows left on the clone by two screen rigs | fixed |

## 9. Integrity (both hashes, clone)

| snapshot | tasks | 6-field sha256 | full sha256 |
|---|---|---|---|
| restructure-baseline-clone (before) | 143 | ad31c267… | (in integrity-full-2026-09-04T07-14-26-553Z.json) |
| restructure-final-clone (after, rig rows removed) | 143 | ec9cc47b… | b3013309… |

Row-by-row: 0 added, 0 removed; only `status` moved, exactly per the map
(BACKLOG→TODO 39, PLANNED→TODO 2, IN_PROGRESS→DOING 2, CANCELLED→DONE 1, also
archived). No assignee, due date, parent, order or completion changed. The
interim 156-row snapshot is defect #9's evidence.

## 10. Deviations (all stated, all reversible)

1. `Task.givenById` added (Today's giver Face needed it).
2. `Task.descriptionMd` kept for My notes; project tasks' descriptions moved into their first note.
3. Note attachments are `attachmentUrl/Name/Type` (PDF and files, not just photos).
4. Plain all-hands events lose their create UI (prod has none); existing rows still render.
5. Meeting create / move / cancel are bell-only, never email or WhatsApp.
6. `Project.priority` kept in the table, never shown.
7. STOP points were reported, not waited on (autonomous run).
8. The tree engine is retained for My notes only, trimmed.
9. Drop-row code was deleted at L1 (it could not compile against the new model); L3 verified nothing is left.
10. Three probes retired rather than adapted (phase-17 team popover shape, phase-31 invites-on-create, phase-22 "no meetings exist") and 16 rigs of dropped screens deleted; the unused `/api/projects/[id]/team` route went with them.
11. README rewritten; the old product spec marked superseded rather than deleted.

## 11. What was not exercised end to end

- Live email, WhatsApp and push delivery (no SMTP / Twilio / VAPID on this Mac): the
  engines, dedupe and bodies are proven; delivery is not.
- The FOUNDER role as an actor (no FOUNDER account exists; DIRECTOR carries the same rights).
- In the browser rigs, the Reschedule / On track / Needs work submissions were
  exercised through the API flows, not by clicking (they would have moved real
  clone meetings mid-shoot).
- Photo/PDF upload against real Vercel Blob (the dev disk fallback was used).

## Simpler versions worth considering

- Today's summary line could be dropped for everyone but the founder; it is the one
  line on the page that is not a thing to do.
- The project card's "Next: milestone · date" could replace the deadline chip
  entirely once every project has boxes.
- "Needs work" could set the project status to PAUSED automatically; today it
  only leaves the note and the message.
