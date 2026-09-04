# Owner feedback, round 2 — 2026-09-04 afternoon

The owner checked the dev server and sent three screenshots with six
complaints, then two more messages. Their words win over the written brief.
Everything below is built, proven on the clone, and green (tsc 0 · lint
clean · jargon 0 · tokens PASS · flows 37/37 · perm-matrix 112/112 · zero
console errors · no overflow at 390 / 1440).

| the owner said | what changed | proof |
|---|---|---|
| "why does it look like a profile — it's departments" | Department rows lost the initials circle; every department wears the same folder mark (rounded square, muted icon), name, "4 projects · 2 behind" / "No projects yet", chevron. | `projects-founder-{390,1440}.png` |
| "why those dots — arrange them by priority; add P1, P2, P3 and they arrange themselves" | The red "behind" dot is gone. Every project has a priority shown as a **P1 / P2 / P3** chip (P1 tinted). Within a department: P1 above P2 above P3, behind ones first at the same level, finished projects last. New project sheet has a P1/P2/P3 picker (P2 by default); the chip on the project header opens a three-row "Priority" sheet for people who run the project (P1 "Do first" · P2 "Normal" · P3 "When there is time"), saved on tap with the toast "Priority set to P1". Legacy CRITICAL reads as P1. The jargon rig no longer bans P1–P3 (the owner asked for exactly those). | `projects-dept-founder-{390,1440}.png`, `project-planned-390.png` (chip in the header) |
| "milestones are top to bottom, new ones added at the bottom" | Boxes come from the API in creation order and are never re-sorted by date; "MILESTONE n" numbers follow that order; a new box lands at the bottom and its suggested review date is a week after the last box. Current = first box in order without an outcome whose day has not passed. | `project-planned-{390,1440}.png` |
| "only tasks go in them, assigning a person is optional" | Kept from round 1 (Add a task, who optional). Plus **quick-add**: tap "+ Add a task" in any box, type, Enter — the next line is ready; twenty tasks in twenty Enters; nobody is assigned; the task takes the box's review date. | `project-quick-add-390.png`; rig: 6 lines typed → 6 tasks, 0 assignees |
| "make the percentage based on the tasks that are done" | Nobody types a percentage any more. `progress` = tasks done ÷ tasks in the project, worked out by the server (100 when the project is DONE). The Set-progress sheet is deleted; PATCH ignores a typed value; the review card shows "N% of tasks done · x of y tasks" read-only; the review-result message says "N% of tasks done". | flows F1 "% is tasks done over tasks (computed)", "a typed % is ignored"; perm-matrix; `projects-dept-founder-1440.png` (13% · 83% · 100%) |
| "project note is different from task notes — task notes are just text, no attachments" | `NotesThread` gained `attachments` (default on). The task drawer's section is now **Comments**, plain text (no camera, no paper-clip), placeholder "Add a comment…"; step notes likewise. Milestone and project notes keep photos and files. | `task-drawer-{390,1440}.png`, `task-drawer-comment-1440.png` |
| "remove Put away — if I put it away it disappears" | "Put away" / "Bring back" removed from the task drawer. Delete stays. | `task-drawer-390.png` |
| "I add 20 tasks, say 3 milestones, they divide equally, timelines automatic, meetings on the calendar, message before, people see their tasks that day" | **Plan into milestones** (`POST /api/projects/:id/plan { count }`, `lib/plan.ts` shared by the sheet's preview and the server): every task not yet in a box is split equally in order into N new boxes appended after the existing ones; review dates spread evenly from the last box (or the project start, never before today) to the deadline, on working days, strictly increasing, never past the deadline; each task takes its box's review date (provisional); every box gets its review meeting (11:00 IST, founder + lead + task holders) — so the day-before message and each person's Today follow on their own. The button appears under "Not in a milestone yet" when two or more tasks are loose; the sheet shows "How many milestones?" 2–6 and the exact split and dates before "Plan it". | `project-plan-sheet-390.png`, `project-planned-{390,1440}.png`; rig `plan-check.ts`: 7 tasks → 3 / 2 / 2, dates 13 Sep → 23 Sep → 1 Oct inside a 4 Oct deadline, every box with a meeting, every task dated, member → 404, nothing loose → 400 |

## Files

`lib/plan.ts` (new), `app/api/projects/[id]/plan/route.ts` (new),
`components/sheets/plan-milestones-sheet.tsx` (new),
`components/sheets/priority-sheet.tsx` (new), `components/sheets/set-progress-sheet.tsx` (deleted);
`lib/projects.ts` (computed progress, milestone order), `lib/milestones.ts`,
`lib/types.ts` (priority labels/ranks), `lib/validation.ts`, `lib/messages.ts`,
`lib/email-templates.ts`, `app/api/projects/[id]/route.ts`,
`app/api/milestones/[id]/outcome/route.ts`; `components/projects/*`,
`components/project/{project-page,project-header,milestone-box}.tsx`,
`components/sheets/{new-project,add-milestone}-sheet.tsx`,
`components/today/needs-ok-card.tsx`, `components/task/task-drawer.tsx`,
`components/notes/notes-thread.tsx`, `lib/hooks/{use-projects,use-today}.ts`;
`scripts/{flows,perm-matrix,jargon}.ts`.

## Not exercised

The four parallel builders that wrote most of the screen code were cut off
by the session limit before writing their own verdicts and some captures; the
lead finished the work by hand and re-shot on a throwaway project. Not
re-shot this round: the review card on Today (code path only; the API side
is in flows F3), the new-project sheet with its P1/P2/P3 picker (tsc/lint
only). Perm-matrix dropped from 113 to 112 cases because "manager sets
progress → 403" no longer exists.

## Round 5 (later the same day) — logins for every level, the CEO's own number, Well Being for the CEO alone, department logos

| the owner said | what changed | proof |
|---|---|---|
| "give me ids and passwords from Rahul to team member" | Every level on the clone has the password `orbit123`: founder@orbit.local (Rahul, CEO) · hod-dev@ / hod-ops@ / hod-rnd@ (heads) · test-manager@ and manager@ (managers) · lead@ (team lead) · dev@ (team member) · admin@ (accounts) · arjun@gmail.com (the tracked person). | `clone-logins.ts` output |
| "Rahul only can mark manually how much is done, percentage" | `Project.progressManual` (migration `20260904160000_progress_manual`). The bar keeps counting tasks; the CEO alone taps the bar → "How far along?" number + slider, "Counting the tasks says N%"; Save shows their number everywhere with the caption "Set by the CEO"; "Count the tasks instead" hands it back. HOD/manager get 403 (404 when not on the project). | `ceo-rules.ts`: 13/13; `project-set-progress-390.png`, `project-progress-by-hand-390.png` |
| "Well Being is only for Rahul to track someone" | The routine guard admits FOUNDER only; the Family tab shows for the CEO always (it is where a Person is set up); managers and heads get 403; the tracked person's own login is untouched. On the clone Arjun (the tracked person) now belongs to Rahul. | `ceo-rules.ts`; manager `/api/routine` → 403 |
| "cool logos for every department, regarding their names" | `components/ui/department-mark.tsx`: an icon picked from the department's name (Development → code, R&D → beaker, Accounts → coins, HR → people, Operations → cog, Network Admins → network, ERM → shield, Administration → briefcase, Self → person, else folder) on a pastel square tinted from the name; used on the Projects list, the department page and the People section headers. | `projects-founder-{390,1440}.png` |

## Round 7 — only the CEO sees the whole company

"All the department accounts see every department, even Self; the accounts line shows for everyone — only Rahul should see that." `GET /api/departments` and `GET /api/users` are scoped on the server: the CEO (and a director, and the admin for accounts) see everything; everyone else sees their own department, a department they head, a department holding a project they are on, the CEO row and themselves. "Self" (an empty department) is therefore the CEO's alone. The "Accounts are looked after by…" line shows only to the CEO and the admin. Proven by `scope-check.ts` for CEO / two heads / two managers / a lead / a team member (all passed); captures `projects-hod-390.png`, `people-hod-390.png`.

## Round 8 — the tick is a lead's to give

"Up to team lead only can mark the task done tick marks." `PATCH /api/tasks/:id` refuses a team member who tries to mark a project task done or undo one (403 "Only a team lead or above marks a task done."); they may still say Doing / Stuck, add tasks, comment. On screen the team member sees the tick as a read-only mark (project boxes, Today, the task drawer); leads and above get the live tick. Proven by `tick-check.ts` (5/5) and captures `project-dev-readonly-390.png` (0 tickable, 3 read-only marks) vs the lead (3 tickable).

## Round 9 — a person sees their department, nothing else

"If I am a department head I only see my department; someone invited into a department sees that department only." `lib/project-visibility.ts` now reads: the CEO (and a director) see everything; everyone else sees every project in their own department, any department they head, and the projects they own, lead, belong to or hold a task in — a team lead no longer sees the whole company (they did before). Departments and People follow the same rule (round 7). Proven by `visibility-check.ts` (Dev Head and a Development manager see all 6 Development projects; the Operations head sees none; a manager with no department sees none; a lead with no department who leads one project sees that one; a member sees the project they are on) and `scope-check.ts`.

## Round 10 — the projects section made good-looking; a project can carry a logo; a way back

"This project section looks bad; keep an option for a project logo; make the projects section good-looking; and a back button — after entering a project we cannot come back." Every project now has a **mark** (`components/ui/project-mark.tsx`): its uploaded logo, else its icon on a tile in its own colour, else its first letter on that tile. The card (`project-card.tsx`) is recomposed: mark · name with the P chip beside it · deadline chip + "Next: … · date" (or "Behind" in red, or "Finished") · faces + a slimmer bar + the number. The project header opens with a **‹ Projects** link back to the department it lives in, then the mark (tap it to change the look — people who run the project), the name, the faces and Add people, then the P chip and deadline, then the bar. **Project look** sheet (`components/sheets/project-look-sheet.tsx`): live preview, "Upload a logo" (a picture, via /api/uploads — Vercel Blob in production, the disk fallback in development), ten colours, 24 named icons or the first letter, Save. `Project.logoUrl` is new (migration `20260904170000_project_logo`); `color` and `icon` already existed and are finally shown. The dev upload fallback returned production URLs (APP_URL) — fixed to a relative path. Proven by `shoot-look.ts`: colour + icon saved, a logo uploaded and shown in the header, removed again, the back link lands on the department; captures `projects-dept-founder-{390,1440}.png`, `project-header-look-390.png`, `project-look-sheet-390.png`, `project-1440.png`; zero console errors, no overflow.

## Round 11 — the deadline (and the rest) can be changed after creation

"While creating the project we set the deadline — make sure we can change that also." The project header's deadline chip (and a pencil at the right of that row) opens **Project details** (`components/sheets/project-details-sheet.tsx`): Name · Lead · Start · Deadline (the same fields as New project) · a Finished switch · Delete project (confirm) — for the people who run the project. Proven by `shoot-details.ts` on a throwaway project: deadline moved (chip reads the new day), name changed, Finished → DONE at 100%, Delete → back to the department, the project gone (404); zero console errors. Capture `project-details-sheet-390.png`.
