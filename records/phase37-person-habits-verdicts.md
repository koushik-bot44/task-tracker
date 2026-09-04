# Phase 37 — the person marks their own weekly habits — verdicts

Evidence in `records/evidence/phase37/`. Screens judged calm / simple + that the
person's screen is CLEAN (just their habits + tasks, nothing else).

| Screen | Files | Verdict |
|--------|-------|---------|
| Person `/kid` — habit grid + tasks | `p37-kid-390.png`, `p37-kid-1440.png` | **PASS.** Warm greeting, then "This week's habits" — the SAME segmented grid the manager set (Sleep & Wake / Health & Body / Academics), full habit names, tap-to-cycle ✓/✗/N-A cells the person taps on their OWN cells (the live-tapped "In bed by target time" today shows a fresh green ✓ with the today-ring). Future days (Sunday) are shown but disabled — the person can't pre-mark the future. Then "Today's tasks" (unchanged) + Sign out. **The person sees NO score/targets, NO non-negotiables, NO weight, NO structure editing (no Edit, no add/rename/delete, no target steppers), NO nav, NO work data.** Clean and calm, no identity-truncation on either width. |
| Person mark → manager grid | `p37-manager-grid-1440.png` | **PASS.** After the person tapped "In bed by target time" today on /kid, the manager's Routine grid shows that exact green ✓ (same shared HabitMark row — last-write-wins). The manager keeps everything: the "14 of 46 targets met" summary + per-segment/per-habit tallies (the SCORE, manager-only), the Edit button, non-negotiables, and the weight monitor. |
| Manager side unchanged | `p37-manager-grid-1440.png` | **PASS.** Weekly grid, score, week nav, non-negotiables, tasks, weight monitor (Recent/Monthly) all present and full — no regression. The grid now simply reflects the person's marks too (on refresh). |

## What was reused (no fork)
`SegmentGrid` (components/routine/weekly-grid.tsx) is defined ONCE and rendered by
both the manager `WeeklyGrid` and the person `PersonScreen`. It takes an `onMark`
callback (manager → `PATCH /api/routine/habit-mark`; person → `POST
/api/routine/kid/habit-mark`), `showScore` (true for the manager, false for the
person), and `maxDate` (the person's cells after today are disabled). The server
grid builder `buildHabitGrid(personId, week)` is shared by the manager overview and
the person `/kid` endpoint; `toPersonSegments` strips the score before serving the
person.

## Choices (stated)
- **Week context:** the person sees the CURRENT week only (no navigation) — simplest
  and calmest; their job is to mark today/this week.
- **Future days:** the person can mark only days up to today (future cells disabled
  in the UI, `date > today` → 400 on the server). The manager grid is unchanged
  (retains full control). This is a deliberate person-only restriction.
- **Score:** absent from the person entirely — stripped from the payload
  (`toPersonSegments`) AND not rendered (`showScore={false}`).

## Judgment
Calm ✓ · Simple ✓ · Person screen is clean (habits + tasks only) ✓ · Wall intact ✓
(person still 403s every work + structure + weight + non-negotiable + manager-routine
surface; can ONLY mark their own habits + check their own tasks).
