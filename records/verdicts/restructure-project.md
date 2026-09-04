# Restructure verdict — the Project screen (`/project/<slug>`)

Date: 2026-09-04. Shot as `founder@orbit.local` (a DIRECTOR) on **Anvi Careers** (`anvi-careers`, 57 tasks, 12 root tasks — the project with the most tasks). The rig created three throwaway milestones (`RS- Past` review yesterday, `RS- Milestone 1` review in 4 days, `RS- Milestone 2` review in 14 days), moved 6 root tasks into them, posted one note, and put everything back at the end.

Files: `components/project/project-page.tsx`, `project-header.tsx`, `milestone-box.tsx`, `task-row.tsx`, `note-bubble.tsx`, `can-manage.ts`; `components/sheets/add-milestone-sheet.tsx`, `move-review-sheet.tsx`, `set-progress-sheet.tsx`. Rig: scratchpad `shoot-project.ts`.

## The 10-second test — PASS

Looking at `project-390.png` cold: the project name, four faces and "+4", "Add people", "Due Mon", a bar at 0%. Then **PROJECT START · July 23**, an arrow, and boxes down the page — each one says MILESTONE n, its name, a review date with REVIEW under it, ticks with task names and a face, and "+ Give a task" in blue. A note sits beside (1440/768) or under (390) each box. "+ Add milestone" at the end, then "Project notes". Nothing needs explaining; the sketch is on the screen.

## LOOK — line by line

| Rule | Verdict | Where |
| --- | --- | --- |
| Warm off-white page, white cards | pass | all three widths |
| No borders except the current box's accent | pass | `RS- Milestone 1` carries the only ring (`Card accent`); bubbles, loose box, project-notes card have none; inputs in sheets keep the kit's hairline edge |
| One accent | pass | primary blue: the ring, "+ Give a task", the progress bar, Save |
| One soft shadow | pass | `.card` only; the drag overlay lifts with `shadow-lift` while in the hand |
| Radius 16 | pass | cards, bubbles, sheets |
| Gutters 16 | pass | `px-4` shell |
| Content `max-w-content` | pass | 760px column at 1440 |
| Text ≥ 13px | pass | the smallest is `text-micro` (13px): MILESTONE n, REVIEW, "n of m steps", date words, note author line |
| Sentence case except the two small-caps labels | pass | "Give a task", "Add milestone", "Project notes", "Not in a milestone yet"; small caps: MILESTONE n, REVIEW (and PROJECT START, as the brief asked) |
| No jargon | pass | words on screen: milestone, review, task, steps, note, progress, "Due Mon", "On track" / "Needs work" / "not recorded yet" |
| No charts / tables / tree lines | pass | the one bar is the 12px progress bar the brief asked for |
| No role words | pass | none on the screen; the note thread shows the author's account name, which in the seed data is "Rahul (Director)" — that is the person's display name, not a role chip |
| 390 first, then 768 / 1440 | pass | `project-390.png`, `project-768.png`, `project-1440.png` |
| Motion 150–200 ms, reduced motion honoured | pass | expand/collapse 150 ms via framer with `useReducedMotion`; drag overlay drop animation off under reduced motion; hover tint 150 ms |
| Dates as words | pass | "Tue", "18 Sep", "3 Sep", "5 Aug", "Today", "July 23", "Due Mon" |

## The three box states — all shown

- **PAST** — `RS- Past` (review yesterday, no outcome): one line "Review 3 Sep · not recorded yet · 1 task", chevron. Tapping it opens the rows (`project-past-open-390.png`). With an outcome it reads "Reviewed 3 Sep · On track · 1 task".
- **CURRENT** — `RS- Milestone 1` (earliest review ≥ today, no outcome): accent ring, every row (Check · title · "n of m steps" · date word only when it differs from the review day · Face), "+ Give a task".
- **FUTURE** — `RS- Milestone 2`: name · date · "2 tasks", collapsed; tap expands to rows plus "+ Give a task".
- **Not in a milestone yet** — the 6 loose root tasks with their own "+ Give a task" (milestoneId null). Hidden when empty.

## Give a task from a box — 3 taps

From the current box: **(1)** "+ Give a task" → sheet opens with "Anvi Careers · RS- Milestone 1", the title field focused, "Review · Tue" preselected; type the title; **(2)** a face ("Me" is preselected, so the second tap is the face you want); **(3)** Save. `project-give-390.png`. The API then showed the task in the box (`milestoneId` = the box id), toast "Added to your list · Add steps?". The task was deleted afterwards.

## Drag and drop — PASS

At 1440: hover the first row of box 1, press the grip (`[data-drag-grip]`, 16 px to the left of the row, shown on hover), move 20 px (PointerSensor, distance 6), move to box 2, release. `GET /api/tasks?projectId=…` showed the task's `milestoneId` changed from `RS- Milestone 1` to `RS- Milestone 2`; the toast "Moved to RS- Milestone 2" was on screen. The task was moved back by PATCH. `project-drag-1440.png` is the mid-drag frame: the source row dimmed, the row in the hand, the target tinted; `project-after-drag-1440.png` is after the drop.

Mechanics: `useDraggable` per row, `useDroppable` per box (including the loose box), `pointerWithin` with a `rectIntersection` fallback, `DragOverlay`, optimistic move through `updateTask` (rolls back on error with a red toast). Reordering inside a box is not offered, as asked. The first rig run failed only because box 2 sat below the 900 px fold and the pointer was released off-screen; the rig now scrolls both boxes into view first.

## Console and overflow per width

| Width | `console.error` | `pageerror` | `scrollWidth ≤ innerWidth` |
| --- | --- | --- | --- |
| 390 × 844 | 0 | 0 | 390 ≤ 390 |
| 768 × 1024 | 0 | 0 | 768 ≤ 768 |
| 1440 × 900 | 0 | 0 | 1440 ≤ 1440 |

Also 0 / 0 after the 390 flows (Give a task, note drawer, Add milestone, Move the review, Set progress, past box expanded) and after the 1440 drag.

## Type-check and lint

`npx tsc --noEmit -p tsconfig.json` filtered to the owned files: nothing. `npx next lint --dir components/project --dir components/sheets`: no warnings or errors.

## Put back

After the rig: 0 `RS-` milestones left; all 6 moved tasks back to `milestoneId: null`; the throwaway task deleted; the throwaway note deleted. (The first two runs left their note behind because deleting a milestone does not delete its notes — those two orphaned notes were removed by hand; the rig now deletes its own.)

## Other screens captured

`project-note-390.png` (the note drawer, "RS- Milestone 1 notes", composer focused), `project-add-milestone-390.png` ("Starts after 18 Sep"), `project-move-review-390.png` (date input, "This moves the review meeting too.", the quiet red "Delete milestone"), `project-progress-390.png` (number + slider, "10 of 13 tasks done").

## Not verified here

- Long-press drag on a real touch screen (TouchSensor, 200 ms delay, tolerance 6): wired, not exercised by the rig.
- The HOD-of-department branch of `useCanManage`, `Add people` (the sibling `AddPeopleSheet`), the camera/paper-clip attachments in the note bubble, the "Reviewed … · On track" wording (needs a recorded outcome) — rendered from the same code paths but not driven by this rig.
- Observation, not a failure: at 768 the box column is 480 px, so long titles truncate once a date word and a face share the row; the 240 px note column is per the brief.

## Owner feedback, same day — tasks are lines in a box

The owner: "don't keep personally assigning every task to a person; it's milestones with tasks inside" (the sketch). The sheet is now "Add a task": What needs doing? → Add (two taps). "Give it to someone? (optional)" defaults to No one; project faces follow; "Someone else…" reveals everyone in the company for leads and above (they join the project with the task). Unassigned rows show no face; task_given goes out only when someone is picked. Proven by a rig: a task added with no person lands in the box (`assigneeId` null, `milestoneId` set), zero console errors; captures project-add-task-390, project-add-task-after-390, today-add-task-390. "+ Give a task" in boxes and the Today + now read "Add a task".
