# Restructure verdict — Calendar (`/calendar`)

Shot 2026-09-04 against the local clone as `founder@orbit.local` (DIRECTOR) and
`dev@orbit.local` (RESOURCE), with a throwaway meeting "RS- Sync" on tomorrow
(Skyzen Webhooks, dev attending, dev replied "Can't"); the meeting and dev's
temporary membership were deleted after the shoot. Evidence in
`records/evidence/restructure/calendar-*.png`.

## 10-second test

**Pass.** At every width the first read is: the month, one blue button
("Schedule meeting"), a row of project names, then the days. A day with
something on it shows a coloured capsule with the project's name (deadline)
or a time and a title (meeting). Tap a day → "Tomorrow · Saturday, September
5" and the meeting with the faces and their replies. Nothing to decode: no
legend, no icons that need explaining, no jargon.

## LOOK lines

| Rule | Verdict |
|---|---|
| Warm off-white page | pass — `bg` token behind everything |
| White cards | pass — grid, agenda cards, meeting cards on the panel |
| No borders except accent | pass with note — the grid's cell hairlines are dividers inside one card (allowed by the tokens file); task-date chips are outline chips by spec; inputs keep the kit's hairline edge |
| One accent | pass — the blue is the primary button, the review/meeting capsules, the today dot; deadlines use the soft ok/warn/danger tints with darker ink |
| Text ≥ 13px | pass — grep: no `text-[10px]`/`text-[11px]`; the smallest is `text-micro` (13px) on chips, weekday labels, section labels |
| Sentence case | pass — "Schedule meeting", "All projects", "Nothing this month"; the only uppercase is the 13px weekday row and section labels (kit convention) |
| No jargon | pass — grep of the calendar files for backlog/P0/gate/verified/changelog/focus/tool/kanban/health/all-hands/sprint finds nothing in copy ("All-hands" toggle removed) |
| No charts/tables | pass — the month grid is a grid of buttons, not a table |
| 390 first, then 768/1440 | pass — 390 is the strip + agenda; 768 (next to the 220px rail, 548px left) also gets the strip + agenda because a 7-column grid at ~74px per cell truncated every chip to one letter; the grid starts at `lg` (1024) |
| `max-w-content mx-auto px-4 pt-4` | pass — the page container; the grid widens to `lg:max-w-[1120px]` |
| Motion 150–200ms + `useReducedMotion` | pass — grid/agenda fade 200ms (skipped under reduce), Drawer 180ms / Sheet 180ms from the kit, press tint 160ms CSS, global reduced-motion clamp |
| Dates as words | pass — panel header "Tomorrow", agenda "Saturday 5 · Tomorrow", reschedule days come through `dateWord`; the grid shows day numbers by nature; the schedule sheet's day is a native date input |

## What was built

- Three chip kinds + task dates (`chips.tsx`): DEADLINE (project name, green/amber/red from `deadlineTone`), REVIEW (accent filled, "11:00 <Milestone> review"), MEETING (accent soft, "15:00 Title"), TASK (outline, edge by lateness, dashed + "~" when provisional).
- "All-hands" toggle and the plain-event modal are gone; the filter reads "All projects".
- Day panel is the kit Drawer: Meetings (faces with green/red/grey reply dots and a "3 coming · 1 can't" line, your own [I'll be there] [Can't] or "You said… · Change", Reschedule when someone said no and you may move it, Edit or cancel for a manager, "Move it from the project page" for a review), Deadlines (row → `/project/<slug>` with the DeadlineChip), Task dates grouped by project (chip → task drawer).
- Reschedule sheet: the three working days as words → `reschedule.mutate` → toast "Moved · everyone will get a new message".
- "+ Schedule meeting" (managers only) → `ScheduleMeetingSheet`: Which project? → Who? (faces, all picked) → When? → What's it about? (defaults to "<project> meeting") → Save. Same sheet edits/cancels a non-review meeting. `components/meetings/schedule-meeting-modal.tsx` is now a re-export.

## States checked

| State | Evidence |
|---|---|
| Month with deadlines + a meeting, 390 / 768 / 1440 | `calendar-390.png`, `calendar-768.png`, `calendar-1440.png` |
| Day panel, meeting with a "Can't" reply → red dot, "1 can't", Reschedule + Edit or cancel (founder) | `calendar-day-390.png`, `calendar-day-768.png`, `calendar-day-1440.png` |
| Day panel as the attendee after replying → "You said you can't. Change" | `calendar-day-dev-390.png` |
| Schedule sheet, nothing picked yet ("Pick a project first.", Save disabled) | `calendar-schedule-390.png` |
| Off-month view: "Today" button appears; task chips (provisional dashed "~", overdue red outline, "+9 more") | `calendar-tasks-1440.png` (August) |
| Day panel with task dates grouped by project | `calendar-day-tasks-1440.png` |
| Task chip tap → task drawer opens (`/calendar?task=…`) | `calendar-task-drawer-1440.png` |

## Console / overflow

| Capture | Console errors / page errors | `scrollWidth` ≤ `innerWidth` |
|---|---|---|
| calendar-390 | 0 | 390 / 390 |
| calendar-day-390 | 0 | 390 / 390 |
| calendar-schedule-390 | 0 | 390 / 390 |
| calendar-768 | 0 | 768 / 768 |
| calendar-day-768 | 0 | 768 / 768 |
| calendar-1440 | 0 | 1440 / 1440 |
| calendar-day-1440 | 0 | 1440 / 1440 |
| calendar-day-dev-390 | 0 | 390 / 390 |
| calendar-tasks-1440 / calendar-day-tasks-1440 / calendar-task-drawer-1440 | 0 | 1440 / 1440 |

`npx tsc --noEmit` prints nothing for `components/calendar`, `components/meetings`;
`npx next lint --dir components/calendar` is clean.

## Unverified

- **REVIEW chip visually.** No milestone review sits in this account's window (a sibling agent's "RS- … review" rows were created and removed during the shoot). The chip is the same `EventChip` with `bg-primary` when `milestoneId` is set; the code path is exercised by the meeting chip but the filled look was not captured.
- The [I'll be there] [Can't] pair before a reply — dev's reply was made through the API to put the founder's panel into the Reschedule state, so only the "You said… · Change" state is captured. "Change" re-shows the pair.
- The reschedule slots sheet and its toast, the edit-mode sheet ("Edit meeting" / "Cancel meeting"), and the schedule sheet with a project picked (faces row) — not captured; doing so would move or change real data.
- The review's "Move it from the project page" line — same reason as the first point.
- Toast copy on schedule/update/cancel — not captured.
- Behaviour when `/api/projects` is empty for a role (filter row hides itself).
