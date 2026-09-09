# Work model — verdict (2026-09-09)

Built on the local clone (`orbit_clone`, port 5433), tags `work-model-s1` …
`work-model-s8`. Production untouched. Plan: `records/plans/work-model-plan.md`;
study evidence: `records/evidence/work-model/findings.md`; screens:
`records/evidence/work-model/shots/`.

## What landed

| step | what | proof |
|---|---|---|
| 1 | Additive schema: Task gains number, type, state, priority, requester, department, team, category, waiting and resolution fields; TaskActivity, AssignmentGroup (+members), TaskCategory, AssignmentRule; Notification.taskId/eventId/dedupeKey; User.sessionVersion; Comment.author nullable | `scripts/work-model-dryrun.ts` (BEGIN…ROLLBACK, audit counts: 0 status/state disagreements, requester and department filled on every live task, task notes moved) |
| 2 | `lib/work/` services: workflow (the one state machine, status as its projection), access (see / staff / edit / assign / delete / transition), activity (field changes with old → new words, notes, team notes, files, system lines), events (recipients + tier per event, deduped per activity row), assignment (category default team, rules, who-may-hold-it). Task and comment routes thin over them | perm-matrix 115/115, e2e 37/37, flows 40/40 |
| 3–4 | Teams, categories, rules, the work list (filters, search by words or number, cursor), transitions, notes, team notes, files, activity, history, dashboards; IST day boundaries; moved reviews tell their people; the Moved sweep per meeting | `scripts/check-work-model.ts` 61/61 |
| 5 | Work tab (list · by department), the task record (who → moves → details → outcome → activity), Today counters and the four ways in, teams under each department on People, the drawer's "Open the full record" and "No one" | screenshots at 390 and 1280 px; tsc, lint, jargon 0 |

| 6 | The developer's asks (mid-build): a project is made with people AND emails in one go (`POST /api/projects` takes memberIds + invites; the sheet lists the department's people first, "More people…", and an email box); a new task can name a holder from the team or department, or invite someone not on Orbit yet (a pending account that already holds the task, its message waiting in their bell); attachments in every ordinary format up to 25 MB (only files that would run are refused); the stream reads like a chat (bubbles, mine on the right, team notes tinted, changes as centred lines, the composer stuck to the bottom, camera on a phone); a bell row opens the record | check-work-model 66/66; screenshots `lead-phone-chat-viewport.png`, `lead-phone-new-task.png`, `ceo-desktop-new-project.png`, `ceo-desktop-bell.png` |

| 7 | Redone to match the service desk (developer, mid-build): the list is a full-width table — Number, Short description, State, Priority, Assignment group, Assigned to, Requested by, Due, Updated — under "Your work / Requested by you / Your team's work / Department / All" tabs, a Show filter, search and paging; the record is a two-column form (Number, Requested by, Type, Category, Department · State, Priority, Assignment group, Assigned to, Due date, Opened, Updated), Short description, Description, then Notes / Resolution Information / Attachments tabs; the activity stream has the Work notes and Additional comments boxes with Post, a filter, and entries with coloured bars and "Field: new was old" lines; attachments open beside the record without downloading; Assignment Rules screen with the conditions builder ("Category is X AND Priority is 1 - Critical") and Assign To; ServiceNow words (1 - Critical … 4 - Low; New, Assigned, In Progress, On Hold, Resolved, Closed, Canceled; TASK0000153); no stats on Today; the four empty extra departments removed from the clone | check-work-model 70/70 (adds the invited-employee join path); screenshots `sn-list.png`, `sn-record.png`, `sn-rules.png`, `sn-record-phone.png` |

| 8 | Developer's corrections: the four departments are back on the clone (a task is raised inside a project inside a department — the New form asks for the Project first, grouped by department, and the list has a Project column); the chat under the form is the WhatsApp shape again (yours on the right, theirs on the left, changes as centred lines), with files opening beside the record. Frames of the ServiceNow video in `servicenow-video/` confirm the form layout (Number, Caller, Category… · State, Priority, Assignment group, Assigned to; Notes with Additional comments + Work notes + Post; Resolution Information) | check-work-model 70/70; `sn-record-chat.png`, `sn-list-project.png`, `sn-new-task.png` |

## Bugs closed (from the study, `findings.md`)

B1 role ceiling on PATCH role · B2 department-scoped account admin · B3 members
invite side door · B4 POST-DONE and step-promotion tick bypasses · B5 write
authority = visibility · B6 silent unassign on reparent · B7 parent cycles ·
B8 IST overdue/Today · B9 title-only Moved sweep · B10 silent review move ·
B11 user delete taking notes and meetings · B12 review sync fire-and-forget ·
B13 bell/push not deduped · the reassign message on done/archived/untitled
tasks · the previous holder never told · ensureMember before validation ·
PERSON targets in account admin · phone numbers on the people list · sessions
surviving a password reset · the flows rig sweeping the real CEO.

Still open (later phases, listed in the plan §14): B14 fresh-install
bootstrap mints a MANAGER; meeting edit/cancel organiser scope; snooze-wake
cadence; public Blob URLs; Undo racing DELETE; older-PATCH-wins in the cache.

## Deviations from the brief, stated

1. Vocabulary: the service desk's field names are on screen now, at the
   developer's ask (Number, Short description, State, Priority, Assignment
   group, Assigned to, Work notes, Additional comments); "ticket", "incident",
   "SLA" and "queue" still are not. The jargon gate keeps those four.
2. PROJECT_TASK keeps the owner's rule that only a lead or above resolves it;
   every other type lets the holder resolve and the requester close.
3. Numbers read `T-1024` / `I-` / `R-` / `P-` / `A-` / `S-` by type, one
   sequence across the company.
4. Notification rules live in code (`lib/work/events.ts`), not a table, until
   there is a screen to edit them. SLA, approvals, parent/child beyond steps,
   email-in: later phases.
5. The project page, milestones, quick-add, drag and drop, calendar, My notes
   and Well Being are untouched; the old drawer keeps working through the
   status projection.

## Incident

The clone was reset by a drift check on 2026-09-09 (defect #16). Rebuilt from
the 2026-09-08 production backup with `scripts/dev-restore-backup.ts`; every
clone password is `orbit123`. The owner's clone-only additions after
2026-09-04 (their Test project, milestones, meetings) are gone.
