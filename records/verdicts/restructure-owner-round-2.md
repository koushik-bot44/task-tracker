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
