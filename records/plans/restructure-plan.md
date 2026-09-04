# Orbit restructure plan — 2026-09-04

Built on the LOCAL prod clone (`orbit_clone`, embedded Postgres 18 on :5433,
started from the scratchpad `pgrunner`), production untouched. Baseline tagged
`baseline-phase49b` in the fresh local git repo (the zip copy had no VCS; a
repo was initialised so landings can be tagged and fix commits named).

Session note: this run is autonomous. The owner asked for everything to be
finished in one pass, so the STOP points after step 0 and after each landing
are reported here and in `records/verdicts/` rather than waited on. Every
deviation from the brief is listed at the end of this file.

## 0. What exists, in numbers (prod dump `records/snapshots/prod-dump-2026-09-03T17-48-30-301Z`)

| table | rows | notes |
|---|---|---|
| User | 16 | DEVELOPER 8 · MANAGER 3 · TEAM_LEAD 2 · ADMIN 2 · PERSON 1 (prod is pre-phase-48; phase 48 renames DEVELOPER→RESOURCE) |
| Department | 5 | Accounts, Operations, Research and Development, Administration, Development (all 4 projects in Development) |
| Project | 4 | 3 ACTIVE, 1 SHIPPED; 0 deadlines; all owned by `manager@orbit.local`, all led by `sudeep@gmail.com` |
| ProjectMember | 12 | |
| ProjectManager | 1 | PENDING (never accepted) |
| Task | 153 | 116 live / 37 soft-deleted · 10 private (My Space) · 143 project |
| Task.status | | DONE 99 · BACKLOG 49 · IN_PROGRESS 2 · PLANNED 2 · CANCELLED 1 |
| Task.priority | | P2 147 · P1 4 · P0 2 |
| Task depth | | root 51 · depth1 76 · depth2 24 · depth3 2 |
| Task extras | | gates non-empty 143 · tags 3 · links 0 · pinned 3 · color 4 · groupColor 11 · description 1 · deliverableUrl 0 |
| TaskNote | 1 | |
| ProjectNote | 2 | |
| CalendarEvent | 2 | both `isMeeting` (Anvi Careers meeting, Recruiter Dashboard meeting, 2026-08-04) |
| EventAttendee | 3 | |
| Notification / EmailLog / WhatsAppLog / PushSubscription / Invite | 115 / 78 / 2 / 8 / 4 | untouched |
| Person + routine tables | 1 person, 6 segments, 12 habits, 57 marks, 1 NN, 1 NN mark, 2 weights, 5 routine tasks, 0 collaborators | untouched |
| PersonalDepartment / PersonalProject | 1 / 2 | untouched (My notes) |

## 1. Reuse map — feature → new home → action → concrete file(s)

### Accounts
| feature | new home | action | files |
|---|---|---|---|
| Login, rate limit, session, bootstrap | unchanged | keep | `app/api/auth/route.ts`, `app/api/auth/bootstrap/route.ts`, `lib/auth.ts`, `lib/session.ts`, `lib/login-attempts.ts`, `components/login-form.tsx` |
| Invite → set password, resend, pending | People "+ Invite" | keep + department field | `app/api/users/route.ts` (+`departmentId`), `app/api/users/[id]/route.ts` (+`departmentId` patch), `app/api/users/[id]/resend/route.ts`, `app/api/invite/[token]/*`, `lib/invite.ts`, `components/set-password-form.tsx`; form UI moves from `components/settings/users-page.tsx` into `components/people/invite-sheet.tsx` |
| Forgot password → admin queue | unchanged | keep | `app/api/password-reset/*`, `app/forgot/page.tsx`; queue UI moves into `components/people/reset-requests.tsx` |
| Role ladder, rank rules, admin cap, last-authority guard | unchanged | keep | `lib/roles.ts`, `lib/permissions.ts` (assignment rule replaced, gates removed), `lib/account-guards.ts` |
| Account settings, notification toggles | Settings (profile → Account / Notifications) | keep; WhatsApp phone already lives here | `components/settings/account-page.tsx`, `components/settings/notifications-row.tsx`, `app/api/users/me/*` |
| Org chart | People | adapt: group by `User.departmentId` + "Not placed yet" | `components/org-chart.tsx` → `components/people/people-page.tsx` |

### Structure
| feature | new home | action | files |
|---|---|---|---|
| Departments (company-wide, hodId, description) | Projects page headers | keep | `app/api/departments/*`, `lib/hooks/use-departments.ts` |
| department-manage-modal | ⋯ on a header | keep (rename/description/HOD) | `components/department-manage-modal.tsx` → `components/sheets/department-sheet.tsx` (Sheet chrome, + HOD picker) |
| Projects (lead, members, dept, priority, deadline, color) | project cards | keep; +startDate +progress; health→status | `prisma/schema.prisma`, `app/api/projects/route.ts`, `app/api/projects/[id]/route.ts`, `lib/serialize.ts`, `lib/types.ts` |
| tool-create-modal | "+ New project" sheet: Name·Lead·Start·Deadline | adapt; members + invite-new move to "Add people" | `components/tool-create-modal.tsx` → `components/sheets/new-project-sheet.tsx` + `components/sheets/add-people-sheet.tsx` |
| tool-header / tool-about-panel | project header | adapt: name·faces·deadline·% only | `components/tool-header.tsx` + `components/tool-about-panel.tsx` (MembersManager section) → `components/project/project-header.tsx` |
| ProjectMember | project people | keep; +canManage | schema + `app/api/projects/[id]/members/route.ts` (any active work role may be added; response includes names/roles for faces) |
| ProjectManager (collab invites) | — | drop; ACCEPTED rows → members.canManage (prod: 0 ACCEPTED, 1 PENDING dropped) | delete `app/api/projects/[id]/managers/*`, `app/api/collaboration-invites/*`, `app/collab-invite/*`, `lib/collab-invite.ts` (pattern reused for reply links in `lib/meeting-reply.ts`), `components/collab-invite-card.tsx`, `components/home/collaboration-invites.tsx` |
| project-visibility.ts | unchanged | keep (collab branch reads `ProjectMember.canManage`/membership instead of ProjectManager) | `lib/project-visibility.ts` |

### Tasks
| feature | new home | action | files |
|---|---|---|---|
| Task model | rows/drawer | keep; +milestoneId +important +archived +givenById (needed for the "giver Face" on Today) | `prisma/schema.prisma` |
| Subtasks (infinite) | "Steps" in the drawer | adapt: one level; deeper flattened ON READ to the root (26 prod tasks at depth 2-3) | `app/api/tasks/route.ts` (`flattenToOneLevel` in `lib/steps.ts`) |
| tree/task-row.tsx | rows in a box | adapt: checkbox·title·Face·date | `components/ui/task-row.tsx` (new, small); old file deleted in L3 |
| tree-view, board-view | — | drop | `components/tree/tree-view.tsx`, `components/board/board-view.tsx`, `components/tool-tree.tsx`, `lib/projection.ts` |
| detail-panel-body.tsx | task drawer | adapt: title·Face·date·status·★·Steps·Result link·Notes | `components/detail-panel-body.tsx` → `components/task/task-drawer.tsx` (host stays `components/detail-panel.tsx`, adapted) |
| status.ts (7) | 4 statuses | adapt: TODO/DOING/STUCK/DONE labelled To do/Doing/Stuck/Done | `lib/status.ts`, `lib/types.ts`, `lib/validation.ts` |
| gates.ts, gate-chips | — | drop (dumped first: `records/snapshots/restructure-dump-*/task.json` keeps every gate array) | `lib/gates.ts`, `components/tree/gate-chips.tsx`, `assertCanToggleGates` |
| priority P0–P3 | ★ Important | adapt: P0/P1 → important=true (prod: 6 tasks), then drop the enum | migration |
| tags, links, color, groupColor, pinned | — | drop (dumped) | migration, `lib/group-tints.ts`, `lib/tool-colors.ts` (unused after) |
| assertCanSetAssignee "claim unassigned" | one rule | replace: anyone on the project assigns anyone on it (MANAGER+ may assign anyone active; that person is auto-added as a member) | `lib/permissions.ts` `assertCanAssign` + `lib/project-people.ts` |
| notes-thread.tsx | Notes everywhere | adapt: one `Comment` model (PROJECT/MILESTONE/TASK) + photo/file attachment | `components/notes-thread.tsx` → `components/notes/notes-thread.tsx`; `app/api/comments/route.ts`, `app/api/comments/[id]/route.ts`; `app/api/uploads/route.ts` (Vercel Blob; dev fallback under `.localdb/uploads`) |
| quick-add / command palette | desktop search (Cmd+K) | keep palette as search-only | `components/command-palette.tsx` (quick-add mode removed), `lib/quick-add.ts` + `components/quick-add-input.tsx` dropped |

### Home / views
| feature | new home | action | files |
|---|---|---|---|
| focus-view (overdue/today/pinned) | Today "Your tasks" | adapt: reuse the queries, drop pinned | `components/focus-view.tsx` → `components/today/your-tasks.tsx`; server side `app/api/today/route.ts` |
| review-queue | Today "Needs your OK" | adapt: source = milestone reviews | `components/review-queue.tsx` → `components/today/needs-ok.tsx`; `app/api/milestones/[id]/outcome/route.ts` |
| portfolio-dashboard, lead-home, my-work, company-home, charts/*, progress-ring, sparkline, odometer, role-home, command-center | — | drop | `components/home/*`, `components/charts/*`, `components/command-center.tsx`, `app/api/overview/route.ts`, `lib/hooks/use-overview.ts` |
| changelog-view | — | drop | `components/changelog-view.tsx`, `app/(app)/changelog` |
| help-sheet, first-run-hint | keep | rewrite copy | `components/help-sheet.tsx`, `components/first-run-hint.tsx` |

### Time
| feature | new home | action | files |
|---|---|---|---|
| CalendarEvent + EventAttendee + events API | reviews + meetings | keep; +milestoneId; +response/respondedAt | schema, `app/api/events/*`, `lib/serialize.ts` |
| calendar-view, chips, day-panel, project-filter | Calendar | keep; +deadline/review chips, +replies in the day panel | `components/calendar/*` |
| schedule-meeting-modal | "+ Schedule meeting" from Calendar | keep; gains a project picker (project → faces → time) | `components/meetings/schedule-meeting-modal.tsx` → `components/calendar/schedule-meeting-sheet.tsx` |
| event-modal (plain all-hands events) | — | drop (prod has 0 plain events; Calendar chips are deadline/review/meeting only) | `components/calendar/event-modal.tsx` |
| meetings-home/department/project pages | — | drop | `app/(app)/meetings/*`, `components/meetings/meetings-*.tsx`, `components/meetings/meeting-breadcrumb.tsx`, `app/api/meetings/route.ts`, `lib/hooks/use-meetings.ts` (candidates hook kept) |
| lib/meetings.ts + notify | reviews | keep; add review-meeting sync, reply links, reschedule | `lib/meetings.ts` (+`syncReviewMeeting`, `nextWorkingDays`), `lib/meeting-reply.ts`, `app/api/events/[id]/reply/route.ts`, `app/api/events/[id]/reschedule/route.ts`, `app/r/[token]/page.tsx` |

### Messages
| feature | new home | action | files |
|---|---|---|---|
| notify.ts, email.ts + templates, whatsapp.ts, push.ts | the 3 messages | keep engines; 3 new templates; other templates deleted | `lib/notify.ts` (rewritten around `sendMessage`), `lib/email-templates.ts` (invite + 3), `lib/messages.ts` (new: the three bodies for bell/email/WhatsApp/push) |
| notification-bell + snooze + cron/snooze-wake | unchanged | keep | `components/notifications/notification-bell.tsx`, `app/api/cron/snooze-wake/route.ts` |
| cron/task-due | — | replace with `cron/tomorrow` at 18:00 IST (`30 12 * * *` UTC) | `app/api/cron/tomorrow/route.ts`, `vercel.json` |
| collab-invite signed token | reply links | adapt: same jose pattern, purpose `meeting-reply`, subject = EventAttendee id | `lib/meeting-reply.ts` |
| base-url.ts, PWA | unchanged | keep | |

### Personal / family
| feature | new home | action | files |
|---|---|---|---|
| My Space | profile menu → "My notes" | keep, unchanged inside; route stays `/my-space` | `components/my-space/*`, `app/api/my-space/*` |
| Well Being | rail/tab "Family", shown when the caller owns a Person (or has an accepted collaboration) | keep untouched; entry only | `app/(app)/routine`, `app/person`, `middleware.ts` (literal MANAGER gate unchanged); `app/api/users/me` gains `hasFamily` |

### New (the only new code)
| piece | files |
|---|---|
| Milestone model + box screen + connectors + Add milestone sheet | schema, `app/api/milestones/route.ts`, `app/api/milestones/[id]/route.ts`, `components/project/milestone-box.tsx`, `components/ui/connector.tsx`, `components/sheets/add-milestone-sheet.tsx`, `components/sheets/move-review-sheet.tsx` |
| Give a task sheet (What·Who·By when) | `components/sheets/give-task-sheet.tsx` (reuses `useTaskMutations` + assignee logic) |
| Set progress sheet | `components/sheets/set-progress-sheet.tsx` |
| Reply links + Reschedule (3 slots) + Needs-your-OK card | `lib/meeting-reply.ts`, `app/r/[token]/page.tsx`, `components/today/meetings-today.tsx`, `components/sheets/reschedule-sheet.tsx`, `components/today/needs-ok.tsx` |
| 3 message templates | `lib/messages.ts` (`taskGiven`, `tomorrow`, `reviewResult`) |
| Shared UI kit | `components/ui/{face,card,chip,row,sheet,drawer,button,empty-state,skeleton,connector,segmented,date-word}.tsx` (Toast stays `components/toast.tsx`) |

### Navigation and redirects
- Rail (≥768px, 220px) / bottom tabs (<768px): Today `/` · Projects `/projects` · Calendar `/calendar` · People `/people` · Family `/routine` (when `me.hasFamily`). Top bar: bell + profile Face; menu: My notes `/my-space` · Account `/settings/account` · Notifications `/settings/account#notifications` · Sign out.
- `next.config.mjs` redirects: `/focus`, `/review` → `/`; `/changelog` → `/projects`; `/meetings/:path*` → `/calendar`; `/t/:slug*` → `/project/:slug*`; `/department/:id` → `/projects`; `/settings/users` → `/people`.

## 2. Migration `20260904120000_restructure` (hand-authored SQL, one transaction)

Dump first: `scripts/restructure-dump.ts` writes every affected table to
`records/snapshots/restructure-dump-<stamp>/` (tasks with gates/tags/links/
color/groupColor/pinnedAt/priority/descriptionMd, projects with health/
gateTemplate, taskNote, projectNote, projectManager, eventAttendee). Then the
migration is dry-run (`BEGIN … ROLLBACK`) by `scripts/restructure-dryrun.ts`,
which prints the audit counts, and only then applied with `prisma migrate deploy`.

```sql
-- 1. Users: department placement
ALTER TABLE "User" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL;
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");
-- backfill: HOD → headed department; else the department of most owned/led/member/assigned projects
-- (weights 1000/10/5/2/1); nulls reported. Prod preview: 8 placed (all → Development), 8 null
-- (jhon, Manager…no: see the dry-run output for the exact list).

-- 2. Milestones
CREATE TYPE "MilestoneOutcome" AS ENUM ('ON_TRACK','NEEDS_WORK');
CREATE TABLE "Milestone" (
  "id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL, "reviewDate" TIMESTAMP(3) NOT NULL, "orderKey" TEXT NOT NULL,
  "reviewEventId" TEXT UNIQUE, "outcome" "MilestoneOutcome", "outcomeNote" TEXT, "outcomeAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "Milestone_projectId_reviewDate_idx" ON "Milestone"("projectId","reviewDate");
ALTER TABLE "CalendarEvent" ADD COLUMN "milestoneId" TEXT REFERENCES "Milestone"("id") ON DELETE SET NULL;
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_reviewEventId_fkey" FOREIGN KEY ("reviewEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL;

-- 3. Tasks
CREATE TYPE "TaskStatus" AS ENUM ('TODO','DOING','STUCK','DONE');
ALTER TABLE "Task" ADD COLUMN "status2" "TaskStatus" NOT NULL DEFAULT 'TODO',
  ADD COLUMN "milestoneId" TEXT REFERENCES "Milestone"("id") ON DELETE SET NULL,
  ADD COLUMN "important" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "givenById" TEXT REFERENCES "User"("id") ON DELETE SET NULL;
UPDATE "Task" SET "status2" = CASE "status"
  WHEN 'BACKLOG' THEN 'TODO'::"TaskStatus" WHEN 'PLANNED' THEN 'TODO' WHEN 'IN_PROGRESS' THEN 'DOING'
  WHEN 'ON_HOLD' THEN 'STUCK' WHEN 'BLOCKED' THEN 'STUCK' WHEN 'DONE' THEN 'DONE' WHEN 'CANCELLED' THEN 'DONE' END;
UPDATE "Task" SET "archived" = true WHERE "status" = 'CANCELLED';          -- prod: 1
UPDATE "Task" SET "important" = true WHERE "priority" IN ('P0','P1');      -- prod: 6
ALTER TABLE "Task" DROP COLUMN "status"; ALTER TABLE "Task" RENAME COLUMN "status2" TO "status";
DROP TYPE "Status";
ALTER TABLE "Task" DROP COLUMN "priority", DROP COLUMN "gates", DROP COLUMN "tags", DROP COLUMN "links",
  DROP COLUMN "color", DROP COLUMN "groupColor", DROP COLUMN "pinnedAt", DROP COLUMN "descriptionMd";
DROP TYPE "Priority";
CREATE INDEX "Task_milestoneId_idx" ON "Task"("milestoneId");

-- 4. Projects
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED','ACTIVE','PAUSED','DONE');
ALTER TABLE "Project" ADD COLUMN "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "startDate" TIMESTAMP(3), ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0;
UPDATE "Project" SET "status" = CASE "health" WHEN 'ACTIVE' THEN 'ACTIVE'::"ProjectStatus"
  WHEN 'PAUSED' THEN 'PAUSED' WHEN 'SHIPPED' THEN 'DONE' WHEN 'IDEA' THEN 'PLANNED' END;   -- prod: 3 ACTIVE, 1 DONE
UPDATE "Project" SET "startDate" = "createdAt";
ALTER TABLE "Project" DROP COLUMN "health", DROP COLUMN "gateTemplate";
DROP TYPE "Health";

-- 5. Comments ← TaskNote (1) + ProjectNote (2) + Task.descriptionMd (1, authored by the task's assignee, else the project owner)
CREATE TYPE "CommentTarget" AS ENUM ('PROJECT','MILESTONE','TASK');
CREATE TABLE "Comment" ("id" TEXT PRIMARY KEY, "targetType" "CommentTarget" NOT NULL, "targetId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL REFERENCES "User"("id"), "body" TEXT NOT NULL,
  "attachmentUrl" TEXT, "attachmentName" TEXT, "attachmentType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "Comment_targetType_targetId_createdAt_idx" ON "Comment"("targetType","targetId","createdAt");
INSERT INTO "Comment" SELECT id,'TASK',"taskId","authorId",body,NULL,NULL,NULL,"createdAt" FROM "TaskNote";
INSERT INTO "Comment" SELECT id,'PROJECT',"projectId","authorId",body,NULL,NULL,NULL,"createdAt" FROM "ProjectNote";
DROP TABLE "TaskNote"; DROP TABLE "ProjectNote";

-- 6. Members ← accepted collaborators (prod: 0), drop ProjectManager (prod: 1 PENDING dropped)
ALTER TABLE "ProjectMember" ADD COLUMN "canManage" BOOLEAN NOT NULL DEFAULT false;
INSERT INTO "ProjectMember" (id,"projectId","userId","createdAt","canManage")
  SELECT id,"projectId","userId","createdAt",true FROM "ProjectManager" WHERE status='ACCEPTED'
  ON CONFLICT ("projectId","userId") DO UPDATE SET "canManage" = true;
DROP TABLE "ProjectManager";

-- 7. Meeting replies
ALTER TABLE "EventAttendee" ADD COLUMN "response" TEXT, ADD COLUMN "respondedAt" TIMESTAMP(3);
```

Audit counts printed by the dry-run and again after apply: users placed/null,
tasks per new status, important, archived, comments (task/project/description),
members with canManage, milestones (0 until the founder adds them), and the
integrity hashes before and after (both the 6-field and the full hash).

## 3. Role × action matrix (server-enforced; the UI only hides)

| action | FOUNDER | DIRECTOR | HOD (own dept) | HOD (other) | MANAGER (owner/canManage) | MANAGER (other) | TEAM_LEAD | RESOURCE (on project) | RESOURCE (not on) | ADMIN | PERSON |
|---|---|---|---|---|---|---|---|---|---|---|---|
| See project | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✗ | 403 | 403 |
| New project (in a dept) | ✓ | ✓ | ✓ | ✗ | ✓ any dept | ✓ any dept (becomes owner) | ✗ | ✗ | ✗ | ✗ | ✗ |
| Edit project name/lead/dates/status | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Set progress % | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Add people (members, invite-new) | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Add / move / delete milestone | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Give a task (to anyone on the project) | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Give a task to someone NOT yet on it | ✓ (auto-adds) | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ (auto-adds) | ✗ 400 | ✗ | ✗ | ✗ |
| Edit / reassign / complete / archive a task | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | 404 | ✗ | ✗ |
| Notes (project/milestone/task) + attachments | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | 404 | ✗ | ✗ |
| Delete own note | author only | | | | | | | | | | |
| Review outcome (Needs your OK) | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Schedule meeting (Calendar) | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Reply I'll be there / Can't | attendee only (in-app or signed link) | | | | | | | | | | |
| Reschedule after a "Can't" | organiser (creator) or FOUNDER/DIRECTOR | | | | | | | | | | |
| Departments create/edit/HOD | ✓ | ✓ | description only | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Invite accounts (below own rank) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ (≤ manager) | ✗ |
| Administer accounts (rank rule) | unchanged phase 48 | | | | | | | | | | |
| People page (read) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ |
| Family (Well Being) | literal MANAGER owning/collaborating on a Person | | | | | | | | | | |
| My notes | own rows only, every role but PERSON | | | | | | | | | | |
| Any work endpoint | | | | | | | | | | 403 | 403 |

"On the project" = lead, owner, ProjectMember, or holder of a live task in it.

## 4. Screens (copy in quotes is the copy)

See the brief; the only additions are (1) a paper-clip "Attach a file" beside
the camera in every note composer (PDF/images/docs up to 8 MB via Vercel Blob;
hidden when `BLOB_READ_WRITE_TOKEN` is unset; a dev-only disk fallback under
`.localdb/uploads` keeps the flow testable locally), and (2) the giver's Face
on Today comes from `Task.givenById`.

## 5. Messages (exactly three)

| key | to | when | channels |
|---|---|---|---|
| `task_given` | the assignee | instant, on give/reassign | bell + push + email + WhatsApp |
| `tomorrow` | one per person | 18:00 IST cron; only if they have tasks due tomorrow, overdue tasks, or a review/meeting tomorrow | bell + push + email + WhatsApp; signed [I'll be there] [Can't] links |
| `review_result` | project people | when the founder/director records an outcome | bell + push + email + WhatsApp |

Meeting create/move/cancel keep a quiet bell row only (the in-app record), no
email/WhatsApp/push. Invite / password-reset emails are account mail, kept.
"Can't" → organiser bell row + Today shows the reply; Reschedule → 3 next
working days → meeting moves, responses clear, `tomorrow`-style message re-sent
to attendees immediately.

## 6. Landings

- L1 `restructure-l1`: schema + migration + UI kit + nav + Today + Projects + Project + Give a task + drawer + People + Settings; flows F1, F4, F5.
- L2 `restructure-l2`: review meetings + Calendar + 3 messages + reply links + Reschedule + Needs your OK; F2, F3.
- L3 `restructure-l3`: Family entry; delete every "drop" row; jargon grep 0; checklist all widths; walls; defect ledger closed.
- Apply to prod only on the owner's word.

## 7. Deviations from the brief (stated, reversible)

1. `Task.givenById` added (the brief's Today row shows a giver Face; nothing in the model carried it).
2. `Task.descriptionMd` is KEPT for My notes (the private-task Notes box depends on it); project tasks had theirs migrated into their first Comment and blanked.
3. Comment attachments generalised from `photoUrl` to `attachmentUrl/Name/Type` so the owner's PDF request rides the same column.
4. Plain all-hands events (`isMeeting=false`) lose their create UI; existing rows still render on the Calendar. Prod has none.
5. Meeting create/move/cancel keep an in-app bell row (no email/WhatsApp/push) — the bell is the record, not a reminder.
6. `Project.priority` column is kept but no longer shown (the brief did not ask to drop it; "P1–P4" would be jargon on screen).
7. STOP points are reported, not waited on (autonomous run at the owner's request).
8. `components/tree/tree-view.tsx` (+ task-row, status-checkbox, status-menu, description-field, lib/tree, lib/projection, lib/order) are RETAINED as My notes' outline engine only (My Space is "keep, unchanged inside" and is built on them), trimmed of the dropped fields. No project screen uses them.
9. The "drop" rows' code is deleted at L1 rather than L3: it referenced dropped columns and could not compile once the model changed. L3 verifies nothing is left (grep) instead of deleting.
