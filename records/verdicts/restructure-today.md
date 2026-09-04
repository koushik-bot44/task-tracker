# Restructure verdict — Today (`/`)

Date: 2026-09-04. Files: `components/today/today-page.tsx` (exports `TodayPage`), `components/today/task-rows.tsx`, `components/today/meeting-card.tsx`, `components/today/needs-ok-card.tsx`, `components/today/summary-line.tsx`, `components/today/section.tsx`. Nothing outside `components/today/` was edited.

## The 10-second test

**What is this page for?** What is waiting on me today: my tasks (late ones first), today's and tomorrow's meetings with a yes/no reply, and — for the founder or a director — the reviews that need an OK.

**What does the one button do?** The blue + in the corner gives someone a task ("Give a task"). Everything else on the page is an answer, not an action: tick a task, "I'll be there" / "Can't", "On track" / "Needs work".

## LOOK — line by line

| Rule | Result | Evidence |
| --- | --- | --- |
| Warm off-white page (bg token) | Pass | Page background is the frame's `bg-bg`; no page-level colour set here. |
| White cards (`.card` / `<Card>`) | Pass | Task list, each meeting, each review, both empty states are `<Card>` / `.card`. |
| No borders except accent | Pass | No borders on cards or rows. The only hairlines are the shared `inputClass` edges on the two review inputs (the design system's own input treatment) and the sheet's footer line, both from `components/ui`. |
| One accent (primary) | Pass | Primary is used for the +, the one primary button per card, the "Review" chip, the important star and the "Change" link. Red/green appear only as the date chip's lateness tint and the reply dots (status tints, not accents). |
| Text ≥ 13px | Pass | Only `text-micro` (13), `text-sm` (15), `text-row` (17), `text-section` (20) are used. No `text-xs`, no arbitrary sizes. |
| Sentence case | Pass | "Your tasks", "Needs your OK", "How far along?", "A line for the team (optional)", "Move this meeting". The spec's "you set 40%…" was rendered as "You set 40%. 5 of 8 tasks done." to keep the sentence-case rule; noted below. |
| No jargon | Pass | None of backlog / P0 / gate / verified / changelog / focus / tool / kanban / health / sprint appear in copy. |
| No charts/tables | Pass | Lists and cards only. The progress control is a number box plus a range slider, not a chart. |
| No role words | Pass | The summary line is shown or hidden by `summary`, the OK section by `needsOk`; neither names a role. |
| 390 first, then 768 / 1440 | Pass | Captured at all three; content is `max-w-content mx-auto px-4 pt-4`. |
| Motion 150–200 ms, reduced-motion respected | Pass | Row exit is 180 ms with `useReducedMotion` collapsing it to a fade / no layout animation; sheets come from `components/ui/sheet`. |
| Dates as words only | Pass | `DateChip` → `dateWord` on rows; "Today / Tomorrow · 11:00 · Project" on meetings; reschedule slots read "Mon 7 Sep" (weekday + `shortDate`). |

## States checked

- **Loading** — `Skeleton` rows while `useToday` is pending (seen during capture; the rig waits for `.animate-pulse` to clear).
- **Error** — `ErrorState` with Retry → `refetch()`. Verified by code path only (the API did not fail during the run).
- **Your tasks** — overdue first (API order), red "2 days late" chip, amber "Today"/"Tomorrow", neutral "Tue", giver's Face on the right, filled star before an important title, project name in 13 px under the title. Tick → row shows the green check + strike-through, lingers ~1 s (`today-ticked-390.png`), then leaves (`ticked row still present after linger: 0`). Tapping the title opens the drawer via `openTask(id)`.
- **Your tasks empty** — `EmptyState` "Nothing waiting on you."
- **Meetings** — title, "Today · 11:00 · Skyzen Webhooks", "Review" chip when `milestoneId` is set. Attendee with no reply sees [I'll be there] [Can't]; after replying, "You said you can't" with a quiet "Change" (`today-dev-390.png`). With `canReschedule` and one "Can't", the founder sees the four attendee faces with a red dot on the one who can't and grey dots on no-replies, plus [Reschedule] (`today-meeting-390.png`). Reschedule opens the sheet with three working days (`today-reschedule-390.png`); picking one calls `reschedule.mutate({ eventId, date })` and toasts "Moved · everyone will get a new message" (code path; not clicked during capture so the throwaway meeting stayed put).
- **Meetings empty** — `EmptyState` "No meetings today or tomorrow." (dev role, when the review is not on today/tomorrow).
- **Needs your OK** — "RS- Milestone review · Skyzen Webhooks", "You set 0%. 0 of 3 tasks done.", number box + slider (default = project progress), the optional line, [On track] [Needs work] → `useReviewOutcome().mutate(...)` with toast "Sent to the project" (code path; not sent during capture so the throwaway milestone could be deleted cleanly).
- **Whole page empty** — summary line (if any) then a single "Nothing waiting on you." with the + still present (`today-founder-empty-390.png`, captured after the throwaway data was deleted).
- **+ button** — 56 px round primary, `fixed right-4 bottom-[calc(80px+env(safe-area-inset-bottom))] md:bottom-6`, `aria-label="Give a task"`, hidden for ADMIN; opens `GiveTaskSheet` with `projectId={null}` which asks "Which project?" first (`today-give-390.png`).
- **Summary line** — "3 projects · 2 behind · 1 review this week"; singular/plural handled (`1 project`, `1 review`); "2 behind" links to `/projects`, "1 review this week" to `/calendar`.

## Console and overflow per capture

Every capture asserted zero `console` errors, zero `pageerror`, and `scrollWidth <= innerWidth`.

| Capture | Console errors | Horizontal overflow |
| --- | --- | --- |
| today-founder-390 | 0 | none |
| today-meeting-390 | 0 | none |
| today-reschedule-390 | 0 | none |
| today-give-390 | 0 | none |
| today-founder-768 | 0 | none |
| today-founder-1440 | 0 | none |
| today-dev-390 | 0 | none |
| today-ticked-390 | 0 | none |
| today-dev-768 | 0 | none |
| today-dev-1440 | 0 | none |
| today-founder-empty-390 | 0 | none |

`npx tsc --noEmit -p tsconfig.json | grep ^components/today` prints nothing; `npx next lint --dir components/today` is clean.

One fix made from the screenshots: the shared `inputClass` is `w-full`, which beat the number box's `w-24` and squeezed the slider to nothing; the box now sits in a `w-24` wrapper. The page also gained bottom padding so the last card clears the floating +.

## Not verified / notes

- The **error state** and the **Reschedule / On track / Needs work submissions** were exercised by code path and type-check only, not clicked in the rig (clicking them would have moved or closed the throwaway milestone before cleanup).
- **"you set 40%"** — rendered with a capital "You" to satisfy the sentence-case rule; if the lowercase form is wanted, it is one character in `needs-ok-card.tsx`.
- The founder account (`founder@orbit.local`) is a DIRECTOR in this database and was an attendee of its own review meeting, so the founder's meeting card shows both the reply buttons and the reschedule row; an organiser who is not an attendee sees the reschedule row only.
- The `Row` primitive was not used for task rows: it renders a `<button>` and the `Check` is also a `<button>`, which would nest buttons (a React DOM-nesting console error). The task row is the same 56 px shape built from `Check` + a title button instead.
- Throwaway data (five `RS-` tasks and one `RS- Milestone` with its review meeting) was created and deleted by the script; `GET /api/tasks?view=all` shows no `RS-` rows afterwards.

## Owner feedback, same day — tasks are lines in a box

The owner: "don't keep personally assigning every task to a person; it's milestones with tasks inside" (the sketch). The sheet is now "Add a task": What needs doing? → Add (two taps). "Give it to someone? (optional)" defaults to No one; project faces follow; "Someone else…" reveals everyone in the company for leads and above (they join the project with the task). Unassigned rows show no face; task_given goes out only when someone is picked. Proven by a rig: a task added with no person lands in the box (`assigneeId` null, `milestoneId` set), zero console errors; captures project-add-task-390, project-add-task-after-390, today-add-task-390. "+ Give a task" in boxes and the Today + now read "Add a task".
