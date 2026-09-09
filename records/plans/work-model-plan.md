# Orbit work-model plan — 2026-09-09

The study behind this plan: every source file was read (8 subsystem maps, 34 to 64 files
each), six bug lenses ran over the task, assignment, permission, notification and data
layers, and each finding was re-checked against the code by a second reader. Type-check
and lint are clean at `f799af1`. Numbers come from the local prod clone
(`orbit_clone`, port 5433): 20 users, 9 departments, 8 projects, 15 milestones,
159 live tasks (36 to do, 1 doing, 119 done; 91 of them steps; 41 unassigned roots;
24 roots in no milestone), 11 comments, 13 meetings, 161 bell rows.

Sections 1 to 8 describe what exists. Sections 9 to 14 are the proposal.

---

## 1. Current architecture

One Next.js 14 (app router) deployment does everything: React pages under `app/(app)`,
route handlers under `app/api/**`, Prisma over PostgreSQL (Neon in prod, an embedded
PG 18 clone locally). There is no separate Node service; "backend" means the route
handlers plus the `lib/` modules they call.

```
Browser (React 18, React Query, dnd-kit)
  components/app-frame.tsx      5 tabs: Today · Projects · Calendar · People · Well Being
  components/today/*            Today (your tasks + meetings + a one-line summary)
  components/projects/*         Departments → projects
  components/project/*          Project page: milestone boxes, task rows, drag and drop
  components/task/task-drawer   The task record (?task=<id> in the URL)
  components/notes/notes-thread One Comment thread for project / milestone / task
  components/people/*           People, invite, person sheet, reset queue
  lib/hooks/*                   React Query hooks; lib/task-cache.ts optimistic writes
        │  lib/api.ts (typed fetch, 401 → /login)
        ▼
Route handlers app/api/**  (runtime nodejs, force-dynamic)
  lib/session.ts      requireUser / requireProjectAuthority / requireAdmin … + route()
  lib/permissions.ts  assertCanAssign, account-admin rank rules
  lib/project-visibility.ts  visibleProjectIds / canSeeProject / canAccessTask
  lib/project-people.ts      projectPeople, isOnProject, ensureMember, reviewAttendeeIds
  lib/meetings.ts     review meetings follow milestones (syncReviewMeeting)
  lib/notify.ts       bellUsers / notifyUsers / sendMessage (bell, push, email, WhatsApp)
  lib/messages.ts     exactly three messages: task_given, tomorrow, review_result
  lib/tomorrow.ts     the 18:00 IST digest (cron)
  lib/validation.ts   zod schemas; lib/serialize.ts DTOs
        ▼
PostgreSQL via Prisma (prisma/schema.prisma, 30 hand-authored migrations)
middleware.ts   edge walls: PERSON → /person only, ADMIN → /people, /routine CEO only
```

Auth is a 30-day HS256 JWT cookie (jose) re-validated against the User row on every
request (`lib/session.ts:24-31`), so disabling an account is instant. There are no unit
tests; verification is a set of API rigs run against the clone (`scripts/perm-matrix.ts`
114 checks, `scripts/flows.ts` 39, `scripts/e2e-restructure.ts`), screenshot rigs, an
integrity hash of live data, and a jargon gate (`scripts/jargon.ts`) that fails the build
if screen copy contains words like backlog, sprint, kanban.

## 2. Current database schema (the work half)

| model | role today | key columns |
|---|---|---|
| User | one row per login | role (FOUNDER, HOD, MANAGER, TEAM_LEAD, RESOURCE, ADMIN, PERSON), status ACTIVE/PENDING (string), departmentId?, emailOptIn, phone, whatsappOptIn |
| Department | company-wide grouping | name, hodId?, description; projects[]; members[] via User.departmentId |
| Project | a piece of work with a team | departmentId?, ownerId?, leadId?, status, priority, deadline, progressManual?, members[] (ProjectMember with canManage) |
| Milestone | a box on the project page | projectId, name, reviewDate, reviewEventId? (its review meeting), outcome?, outcomeNote |
| Task | the only work record | projectId? (null only for private), milestoneId?, parentId? (steps, one level), title, descriptionMd, status TODO/DOING/STUCK/DONE, dueDate?, dueProvisional, important, archived, assigneeId?, givenById?, completedAt/ById, deletedAt, isPrivate/ownerId/personalProjectId (My notes) |
| Comment | notes on PROJECT / MILESTONE / TASK | targetType, targetId (no FK), authorId (Restrict), body, attachmentUrl/Name/Type |
| CalendarEvent + EventAttendee | meetings and reviews | isMeeting, projectId?, milestoneId?, createdById (Restrict), attendee response YES/NO |
| Notification | the bell | userId, type (free string), title, body, data {url}, readAt, snoozedUntil |
| EmailLog / WhatsAppLog | send ledgers | unique dedupeKey |
| Invite, PasswordResetRequest, LoginAttempt, PushSubscription | accounts | |
| PersonalDepartment / PersonalProject | My notes | caller-scoped |
| Person + routine tables | Well Being | fully isolated from work |

What is missing for the target model: no assignment group, no group membership, no
category, no requester, no department on a task, no priority beyond a star, no state
beyond four statuses, no waiting reason, no resolution fields, no activity or history
table, no task number. `Comment.targetId` and `Notification.data.url` are unlinked
strings, so deletes sweep them by hand (`app/api/projects/[id]/route.ts:116-132`).

## 3. Current task workflow

Four statuses with no transition rules. Any status may be written from any status by
`PATCH /api/tasks/:id {status}` (`app/api/tasks/[id]/route.ts:159-167`) and by
`POST /api/tasks {status}` (`app/api/tasks/route.ts:176`). The only rule is the owner's
"the tick is a lead's to give": a non-lead may not flip DONE on a root project task
(`[id]/route.ts:149-157`). Everything server-side distinguishes only DONE from not-DONE
(`lib/projects.ts:34-53`, `app/api/today/route.ts:38`, `lib/tomorrow.ts:30-35`): STUCK
changes a pill colour and nothing else; `CLOSED_STATUSES` in `lib/status.ts:19` has no
callers. DONE stamps completedAt/completedById; reopening wipes both, so nothing records
that a task was ever done. Milestone outcomes (On track / Needs work) are recorded on the
box and do not touch its tasks.

## 4. Current assignment workflow

Task → Person, directly. `assertCanAssign` (`lib/permissions.ts:60-91`) is the one rule:
anyone on the project may name anyone on the project; a lead or above may name anyone
active in the company and that person is added to the project as a side effect
(`ensureMember`). There is no group layer and no department check. The giver is stored in
`givenById` and overwritten on every reassignment; the previous holder is never told and
no history survives. Five different predicates decide who "holds" a task or is "on" a
project and they disagree on archived tasks and account status
(`lib/project-people.ts:28,73,111`, `lib/notify.ts:124`, `lib/project-visibility.ts:39`).
Reparenting a task (`PATCH {parentId}`) silently unassigns it outside the rule
(`[id]/route.ts:189-191`).

## 5. Current dashboard behaviour

`GET /api/today` (`app/api/today/route.ts`) returns: the caller's own open root tasks
(overdue first), today's and tomorrow's meetings, and, for the CEO and HODs only, one
summary line (projects · behind · reviews this week). There are no counters, no
unassigned view, no team view, no department drill-down, no search, no filters beyond
"assigned to me". Unassigned tasks appear on nobody's Today. `Projects` is a department
list with project cards (open/done counts, % done, behind flag). The People page places
people in departments. Cmd+K searches projects and the tasks of the project you are on.

## 6. Current notification behaviour

Three tiers in `lib/notify.ts`: `bellUsers` (row only), `notifyUsers` (row + push),
`sendMessage` (row + push + email + WhatsApp, email and WhatsApp deduped by a unique key).
Exactly three messages exist (`lib/messages.ts`): task_given (on give/reassign),
tomorrow (18:00 IST digest by cron), review_result (when the CEO records an outcome).
Meetings created/moved/cancelled and "can't make it" write a bell row only. Notes on a
task notify nobody. Sends are scattered in eleven route files (16 call sites); there is no
event layer. Bell and push are not deduped, task_given and review_result set
`keyExtra = Date.now()` which disables their email/WhatsApp dedupe, and the review sync
that puts a new holder on a review meeting is fired after the response without await
(`app/api/tasks/route.ts:207`), which serverless may freeze.

## 7. Current user and department model

Roles are a rank ladder in `lib/roles.ts` (FOUNDER 6 › HOD 4 › MANAGER 3 › TEAM_LEAD 2 ›
RESOURCE 1; ADMIN and PERSON outside). A user sits in one department (`User.departmentId`)
and a department has one head (`hodId`). Visibility (`lib/project-visibility.ts`): the CEO
sees everything; everyone else sees every project filed in their own department, in the
departments they head, and any project they own, lead, belong to or hold a task in.
Account administration is rank-only and company-wide: an HOD or MANAGER may create,
disable, re-role, re-place and set the password of any lower-rank account in any
department. Invites: People → Invite (name, email, role, department) issues a set-password
link; a second invite path exists inside project members. There are no teams.

## 8. Bugs and conflicts found

63 findings survived verification. The ones that matter for this refactor, grouped. Full
text with repro steps: `records/evidence/work-model/findings.md`.

Critical / high (fix in Step 2, they are all in the assignment and permission layer the
refactor rewrites anyway):

| # | where | what |
|---|---|---|
| B1 | `app/api/users/[id]/route.ts:103` | PATCH role never bounds the NEW role by the actor's rank: a MANAGER can make a RESOURCE an HOD. |
| B2 | `lib/permissions.ts:134` | Account admin is rank-only, not department-scoped: an HOD of A can set the password of any manager in B and log in as them. |
| B3 | `app/api/projects/[id]/members/route.ts:42` | Any member with canManage (any role) can mint TEAM_LEAD accounts through the members invite, bypassing `assertCanCreateUserWithRole`. |
| B4 | `app/api/tasks/route.ts:176`, `[id]/route.ts:152` | The lead-only tick is bypassed by POST `{status:"DONE"}` and by marking a step DONE then promoting it to a root in one PATCH. |
| B5 | `app/api/tasks/[id]/route.ts:78,244` | Task write authority equals project visibility: anyone in the department can rename, re-date, archive, move or soft-delete every task in every department project. Step creation skips the on-project check. |
| B6 | `app/api/tasks/[id]/route.ts:190` | PATCH parentId unassigns the holder outside `assertCanAssign`, with no message and no review re-sync. |
| B7 | `app/api/tasks/[id]/route.ts:37` | `subtreeIds` has no visited set; a parent cycle (reachable by a race) hangs DELETE/PATCH forever. |
| B8 | `lib/projects.ts:36`, `app/api/today/route.ts:22` | Overdue/behind use server-local midnight while clients store IST midnight; on a UTC host every hand-dated task is "overdue" from 05:30 IST on its due day. |
| B9 | `lib/tomorrow.ts:134` | Reschedule deletes "Moved:" bell rows by TITLE only, across all users and meetings. |
| B10 | `app/api/milestones/[id]/route.ts:38` | Moving a review from the project page clears every reply and sends nothing. |
| B11 | `app/api/users/[id]/route.ts:159-165` | Deleting a user hard-deletes every note they wrote and every meeting they organised (review meetings included). |
| B12 | `app/api/tasks/route.ts:207` (+4 sites) | `syncProjectReviews` is fire-and-forget after the response; on serverless the new holder may never be invited. |
| B13 | `lib/notify.ts:64` | Bell rows and push are not deduped; a second cron run doubles every digest. |
| B14 | `app/api/auth/bootstrap/route.ts:73` | A fresh install mints a MANAGER, who cannot create a department, so nothing can be created. |

Medium (design gaps the target model closes by construction):

- No history of assignment, status, priority or deletion anywhere (schema has no audit
  table). Reopen wipes completedAt/By. `givenById` is overwritten.
- STUCK and PAUSED/PLANNED have no server meaning; a finished project keeps a stale
  hand-set %.
- Five "who holds it" predicates disagree; `canActAsProjectOwner` duplicates
  `canManageProject`.
- Standalone tasks (projectId null, not private) are impossible: POST refuses them,
  `canAccessTask` denies them to everyone, Today/lists filter by project id set,
  `taskScope` would match every private task, message templates require a project slug,
  the digest drops them, the drawer cannot show their steps or people.
- Reassign of a DONE/archived/untitled task sends the four-channel "gave you a task";
  the person who lost it is never told; `ensureMember` runs before later validation, so a
  400 still adds someone to a project; disabling a user leaves their tasks held by a ghost.
- Notifications keep pointing at deleted projects/tasks/meetings (no link column).
- Two concurrent syncs create two review meetings; a review edit via `/api/events` is
  reverted by the next sync; PATCH `/api/events/:id` lets any manager cancel the CEO's
  company-wide meeting; signed-in "Can't" bells the organiser on every submit.
- PERSON accounts pass every account-admin check; `GET /api/users` returns phone numbers
  to every lead; password change does not revoke sessions; note `attachmentUrl` accepts
  any scheme; Vercel Blob uploads are public URLs.
- Department delete unplaces members and the HOD silently; a demoted HOD stays `hodId`.
- Undo before the DELETE lands is a silent no-op; an older PATCH response can overwrite a
  newer optimistic state; project-people cache is not invalidated after auto-add.
- `npm run db:migrate`, `db:seed`, `integrity` read `.env` (production). `flows.ts`
  teardown deletes the real CEO's comments, private notes and meetings.

Everything else found is low severity (copy drift, dead code, cosmetic mismatches) and is
listed in the evidence file.

---

## 9. Target architecture

Same deployment, same auth, same shell. The change is one new layer under `lib/work/`
that every task write goes through, one new record surface, and additive schema.

```
React
  Today            counters + My work / Team work / Department work / Everything (links)
  Work             the queue: filters, search, rows → /work/<number>
  Work record      record · ownership · state · activity · resolution
  Projects/Project unchanged (boxes, rows, drag and drop); drawer gains "Open record"
  People           unchanged + Teams (assignment groups) per department
  Calendar, Well Being, My notes  untouched
        ▼
lib/work/  (the services; routes are thin)
  access.ts       who may see / edit / assign / transition / read internal notes
  workflow.ts     the state machine (states, transitions, legacy status projection)
  assignment.ts   department → group → person, rules, membership check
  activity.ts     activity stream writer (comment, work note, field change, system, attachment)
  events.ts       WorkEvent → recipients → tier (bell / bell+push / full message)
  query.ts        list/filter/search/counters for queues and dashboards
  numbering.ts    W-number formatting
        ▼
lib/notify.ts, lib/messages.ts (extended, not replaced), lib/meetings.ts (awaited)
        ▼
PostgreSQL: Task (extended) · AssignmentGroup · AssignmentGroupMember · TaskCategory
            · AssignmentRule · TaskActivity · Notification (+taskId, +dedupeKey)
```

Principles, in the brief's order:

- The task is the record. Project and milestone stay as optional context fields on it.
- Ownership is Department → Team → Person. When a task carries a team, the person must be
  in that team. Legacy project tasks with no team keep today's project rule.
- The state machine lives in `lib/work/workflow.ts` and is the only writer of `state`.
  The old `status` column becomes a projection of `state` that the project page, Today,
  progress, milestone counts and rigs keep reading unchanged, so nothing regresses.
- Every write produces activity rows (field changes are structured metadata), and every
  activity that matters produces a WorkEvent, and every WorkEvent is routed by one table
  in `events.ts`. Routes never call `sendMessage` directly.
- Authorization is decided server-side in `access.ts`; the client mirrors only for hiding.
- Vocabulary on screen stays Orbit's: task, team, department, note, team note, requested
  by. "Ticket", "incident", "SLA", "queue", "assignment group" never appear in copy (the
  jargon gate is extended with them). The record number reads `T-1024`, `I-1025`, `R-1026`
  by type.

Type-dependent workflow (kept minimal): PROJECT_TASK keeps the owner's rule that only a
lead or above resolves it; every other type lets the assignee resolve and the requester
(or a lead) close. Waiting always carries a reason. Resolution always carries a code.

## 10. Proposed database changes

One additive migration, `20260909120000_work_model`, hand-authored SQL, rehearsed with a
BEGIN…ROLLBACK dry-run that prints audit counts, applied to the clone only. Nothing is
dropped. Production stays untouched until the owner's word (runbook updated).

New enums: `WorkType` (GENERAL, ISSUE, REQUEST, PROJECT_TASK, APPROVAL, SUPPORT),
`WorkState` (NEW, ASSIGNED, IN_PROGRESS, WAITING, RESOLVED, CLOSED, CANCELLED, ESCALATED,
REOPENED), `WorkPriority` (CRITICAL, HIGH, MEDIUM, LOW), `WaitingReason` (REQUESTER,
APPROVAL, OTHER_TEAM, VENDOR, PARTS, OTHER), `ResolutionCode` (FIXED, COMPLETED,
WORKAROUND, CANNOT_REPRODUCE, DUPLICATE, NOT_NEEDED), `ActivityType` (COMMENT, WORK_NOTE,
FIELD_CHANGE, SYSTEM, ATTACHMENT, EMAIL, MENTION), `ActivityVisibility` (PUBLIC, INTERNAL).

Task, new columns (all nullable or defaulted, backfilled):

| column | backfill |
|---|---|
| number Int unique autoincrement | in createdAt order |
| type WorkType default GENERAL | PROJECT_TASK where projectId is set |
| state WorkState default NEW | TODO → ASSIGNED if assignee else NEW; DOING → IN_PROGRESS; STUCK → WAITING (reason OTHER); DONE → CLOSED (resolvedAt = closedAt = completedAt, code COMPLETED); archived DONE → CANCELLED |
| priority WorkPriority default MEDIUM | HIGH where important |
| categoryId → TaskCategory (SetNull) | null |
| requesterId → User (SetNull) | givenById, else assignee, else project owner |
| departmentId → Department (SetNull) | the project's department, else the assignee's |
| assignmentGroupId → AssignmentGroup (SetNull) | null (teams do not exist yet) |
| waitingReason, waitingNote | OTHER for STUCK |
| resolutionCode, resolutionNotes, rootCause, resolvedById (SetNull), resolvedAt, closedAt, closedById | from completedAt/By for DONE |
| escalatedAt | null |

Indexes: (state), (assignmentGroupId, state), (departmentId, state), (assigneeId, state),
(requesterId), (priority), (dueDate). The existing `status` column stays and is rewritten
by the workflow service on every state change.

New tables:

- `AssignmentGroup` (id, name, departmentId FK Cascade, leadId? SetNull, description,
  active, orderKey, createdAt) unique (departmentId, name).
- `AssignmentGroupMember` (groupId Cascade, userId Cascade, createdAt) unique (groupId,
  userId).
- `TaskCategory` (id, name, parentId? for subcategory, departmentId?, assignmentGroupId?
  the deterministic default route, active, orderKey) unique (parentId, name).
- `AssignmentRule` (id, name, order, active, match Json {type?, categoryId?,
  departmentId?, priority?}, set Json {departmentId?, assignmentGroupId?, assigneeId?,
  priority?, escalate?}). Evaluated in order at create; first match wins per field.
- `TaskActivity` (id, taskId FK Cascade, authorId? SetNull (null = system), type,
  visibility, body, metadata Json, attachmentUrl/Name/Type, createdAt) indexes (taskId,
  createdAt), (taskId, type). Field changes store {field, oldValue, newValue, oldLabel,
  newLabel}; mentions store {mentions: [userId]}. The 6 existing TASK comments are moved
  here as PUBLIC comments (the Comment table keeps project and milestone notes).

Changed tables:

- `Notification` + `taskId?` (FK SetNull, index), `eventId?`, `dedupeKey? unique`
  (idempotent cron and event fan-out; sweeps on delete).
- `Comment.authorId` becomes nullable SetNull and `CalendarEvent.createdById` SetNull, so
  deleting a person no longer deletes their notes and meetings (B11).
- `User.sessionVersion Int default 0` so a password set/reset revokes sessions.
- `Task.parentId` cycle guard becomes transactional with a visited set (B7); a CHECK
  `parentId <> id`.

Not built yet (kept as later phases): SLA definitions and timers, TaskRelation
(related/duplicate/blocks), configurable NotificationRule/preferences, Approval records,
email-in.

## 11. Proposed API changes

Existing endpoints keep their shapes; new fields are optional on input and present on
output. Old clients keep working.

Tasks (all through `lib/work`):

| method + path | change |
|---|---|
| POST /api/tasks | projectId optional; accepts type, categoryId, departmentId, assignmentGroupId, assigneeId, requesterId, priority, descriptionMd. Runs routing rules. Creates the SYSTEM "created" activity. |
| GET /api/tasks | unchanged for `projectId=` / `scope=private`; new `view=work` with filters: q, state[], priority[], type[], departmentId, assignmentGroupId, assigneeId, requesterId, projectId, milestoneId, unassigned, overdue, dueFrom/dueTo, createdFrom/createdTo, mine=assigned|requested|team|department, sort, cursor. |
| GET/PATCH/DELETE /api/tasks/:id | access via `canSeeTask` / `canEditTask` (not visibility); `status` in PATCH is translated to a transition; `assigneeId` in PATCH routes through assignment; field changes recorded. |
| POST /api/tasks/:id/assign | {assignmentGroupId?, assigneeId?} |
| POST /api/tasks/:id/transition | {to, waitingReason?, waitingNote?, resolution?} the generic move |
| POST /api/tasks/:id/start · /wait · /resolve · /close · /reopen · /cancel · /escalate | sugar over transition |
| POST /api/tasks/:id/comments · /work-notes | {body, attachmentUrl?, mentions?} |
| POST /api/tasks/:id/attachments | {attachmentUrl, name, type, body?} (file goes through /api/uploads first, as notes do today) |
| GET /api/tasks/:id/activity | ?type= &visibility= &order=asc|desc ; work notes stripped for non-staff |
| GET /api/tasks/:id/history | FIELD_CHANGE rows only |
| GET /api/tasks/:id/notifications | the caller's bell rows for this task |

Organisation:

| method + path | purpose |
|---|---|
| GET/POST /api/assignment-groups, GET/PATCH/DELETE /api/assignment-groups/:id | teams (CEO anywhere, HOD in own department) |
| POST/DELETE /api/assignment-groups/:id/members | membership |
| GET /api/assignment-groups/:id/tasks, /api/departments/:id/tasks, /api/users/:id/tasks | queues (delegate to the work list with a preset filter) |
| GET/POST/PATCH /api/task-categories | categories with default team |
| GET/POST/PATCH/DELETE /api/assignment-rules | CEO/HOD |
| POST /api/users (invite) | accepts groupIds; the members-invite path calls the same rule (B3) |

Dashboard:

| method + path | returns |
|---|---|
| GET /api/dashboard/today | counters scoped to the caller (open, unassigned, high priority, due today, overdue, waiting, resolved today) + my work + team work + department work + the existing meetings and summary |
| GET /api/dashboard/departments | per-department open / in progress / waiting / overdue / unassigned, then per team, then per person (CEO all; HOD own) |

Removed behaviours: `POST /api/tasks {status}` no longer sets DONE directly (B4);
`PATCH {parentId}` no longer unassigns silently (B6); `/api/comments` refuses
targetType TASK once the drawer reads activity.

## 12. Proposed React component changes

New:

- `components/work/work-page.tsx` `/work` — filter row (Mine · My team · My department ·
  Everything, then state, priority, type, unassigned, overdue, search), rows
  (`components/work/work-row.tsx`: number, title, type chip, team, face, state chip, due),
  a "By department" segment that renders department cards → teams → people using the
  dashboard endpoint.
- `components/work/work-record.tsx` `/work/[number]` — header (number, title, state,
  priority), fields panel (Requested by, Department, Team, Assigned to, Type, Category,
  Due, Project, Milestone, Parent), action bar (Start · Waiting… · Resolve · Close ·
  Reopen · Assign · Cancel, each shown only when the transition is allowed for this role),
  `components/work/activity-stream.tsx` (filter chips All · Notes · Team notes · Changes ·
  Files · Mentions; newest/oldest), `components/work/activity-composer.tsx` (Note ↔ Team
  note mode, attach, @mention picker), `components/work/resolution-card.tsx`.
- `components/work/assign-sheet.tsx` (department → team → person, people constrained to
  the team), `components/work/wait-sheet.tsx` (reason), `components/work/resolve-sheet.tsx`
  (code, notes, root cause).
- `components/people/teams-section.tsx` + `team-sheet.tsx` — teams per department on the
  People page; invite sheet gains a Teams field.
- `components/today/counters.tsx` — the Today strip for leads and above.

Changed:

- `components/app-frame.tsx` — sixth tab "Work" (`/work`), hidden for ADMIN.
- `components/today/today-page.tsx` — reads `/api/dashboard/today`; counters + the four
  work links above the existing "Your tasks" and "Meetings".
- `components/task/task-drawer.tsx` — Notes section reads the activity API (comments;
  team notes for staff); "Open record" link to `/work/<number>`; Who sheet reuses the
  give-task FaceRow with "No one" and "Someone else" (finding).
- `components/notes/notes-thread.tsx` — unchanged for projects and milestones.
- `components/sheets/give-task-sheet.tsx` — project becomes optional; type/team fields
  collapsed under "More" so the two-tap path stays.
- `lib/hooks/use-work.ts`, `use-activity.ts`, `use-groups.ts`, `use-dashboard.ts` — new
  hooks; `lib/task-cache.ts` gains a `work` list scope; `lib/types.ts` gains WorkDTO fields
  on TaskDTO, ActivityDTO, AssignmentGroupDTO, DashboardDTO.
- Copy: `scripts/jargon.ts` gains ticket, incident, SLA, queue, assignment group, catalog.

Untouched: projects page, project page boxes/rows/drag-drop, milestone sheets, calendar,
people rows, settings, My notes, Well Being.

## 13. Migration strategy

1. Evidence first: `scripts/prod-backup.ts` style dump of Task, Comment, Notification to
   `records/snapshots/work-model-dump-<stamp>/` (clone now, prod on apply day).
2. `scripts/work-model-dryrun.ts` runs the migration inside BEGIN…ROLLBACK and prints:
   tasks numbered, tasks per state, per type, requester filled / null, department filled /
   null, comments moved, notifications linked. Only when the counts match expectation is
   `prisma migrate deploy` run (through `scripts/db-deploy.sh`, which refuses non-local
   URLs).
3. Backfill order inside the migration: enums → columns → number → type → priority →
   state and resolution from status/completedAt → requester → department → activities
   from TASK comments → Notification.taskId from `data.url` (`?task=<id>`), then
   `Comment.authorId`/`CalendarEvent.createdById` nullability.
4. Old code paths keep working during the rollout because `status` is still written by
   the workflow projection; the project page, Today, milestone counts, progress, the
   tomorrow digest and every rig read it as before.
5. Teams are not invented by the migration. `scripts/dev-seed-teams.ts` seeds a dev set on
   the clone (Development → Software / Network; Operations → Ops; etc. following the
   owner's whiteboard departments). In production the CEO creates teams from People.
6. Apply-to-prod stays on the owner's word: `records/plans/apply-to-prod.md` gets the new
   migration list, the dry-run step and the rollback (the migration is additive, so
   rollback is `DROP` of the new tables/columns with the dumped data kept).

## 14. Implementation phases

Each step ends with: `npx tsc --noEmit`, `npm run lint`, `npx tsx scripts/jargon.ts`,
the API rigs (`perm-matrix`, `flows`, `e2e`) and the new `scripts/check-work-model.ts`
against the clone, one commit, no open defect row.

- Step 1 — Schema and migration (section 10), dry-run, apply to the clone, Prisma types,
  DTOs, serializers.
- Step 2 — Services in `lib/work/` (access, workflow, assignment, activity, events,
  numbering) and the existing task routes rewired through them. This step also closes
  B1–B7, B12 and the reassign/notify gaps because those paths are replaced.
- Step 3 — Organisation APIs: assignment groups, members, categories, rules; invite gains
  teams; People page Teams section.
- Step 4 — Work APIs: list/filter/search, transitions, comments/work notes/attachments,
  activity/history; dashboard endpoints; Notification dedupe and task link (B13); the
  timezone fix (B8); review-move message and the title-only sweep (B9, B10); awaited
  review sync.
- Step 5 — UI: Work tab, work record page, activity stream and composer, Today counters
  and links, drawer link and activity, assign/wait/resolve sheets. Screenshots at phone
  and desktop widths.
- Step 6 — Records: findings evidence, defects ledger rows closed, README, apply-to-prod
  runbook, verdict file, tags `work-model-s1` … `work-model-s5`.

Later phases (not in this pass): @mention email/push preferences per kind, email-in,
SLA definitions and timers with At risk / Breached on the dashboard, approval records,
escalation policies, TaskRelation, configurable workflows per type.
