# Phase 35 — Routine v2 (segmented weekly grid + weight + child→person) — precision verdicts

Screens captured by `scripts/_viz35.ts` against the running app + prod DB with
throwaway `p35v-` actors (hard teardown). Evidence in `records/evidence/phase35/`.
Every screen judged for the three things the spec asked to feel: **calm, simple,
interactive.** All at 1440 + 390 unless noted.

| # | Screen | Files | Verdict |
|---|--------|-------|---------|
| 1 | Empty / add-person | `p35-empty-1440.png`, `p35-empty-390.png` | **PASS.** One soft card, sparkle glyph, warm copy ("Create a gentle login just for them…"), three fields + one button. Nothing else. Calm and obvious; no dense chrome. |
| 2 | Weekly grid (populated) | `p35-mgr-1440.png`, `p35-mgr-390.png` | **PASS.** The centerpiece. Segments (Sleep & Wake / Health & Body / Academics / Mind & Screens) each with a weekday header and full-width tap cells. Three states read instantly — soft-green ✓ (MET), soft-red ✗ (MISSED), grey — (N/A), empty. Per-habit `met/target` + per-segment tally + a single gentle summary line ("39 of 63 targets met this week") — information, not a verdict, no alarm-red scoreboard. Today's column is ringed. Habit names render in FULL on both widths (identity-truncation hunted + fixed: names moved to their own line above full-width cells). Feels light and tappable, not a work spreadsheet. |
| 3 | Tap-to-cycle interaction | (in #2) | **PASS.** Each cell cycles empty → ✓ → ✗ → N/A → empty, optimistic (instant, no spinner), scoped to the manager's own person. Verified live in `check-phase35-routine` (MET/MISSED/NA + clear, weekly tally recomputes). |
| 4 | Grid edit mode | `p35-grid-edit-1440.png` | **PASS.** "Edit" flips the grid to a calm editor: each segment a card with rename (pencil) + remove (trash); each habit a row with a −/`N/wk`/+ target stepper (0–7) + remove; an "Add a habit…" per segment; an "Add segment" field at the foot. Single-purpose, uncluttered. |
| 5 | Non-negotiables | (in #2, and `p35-history-1440.png`) | **PASS.** A separate, serious-but-not-punitive section: seven day cells marked only when crossed (soft-red ✗), a quiet "N crossed this week" / "held" count. Today ringed. No harsh scoreboard. |
| 6 | Tasks | (in #2) | **PASS.** Assign a task (Today / Any day), the person checks it off, the manager sees the tick (green check, struck-through when done). Reused calm list from phase-34. |
| 7 | Weight monitor | (in #2) | **PASS.** Manager-only. Latest weight large (42.6 kg), a gentle up/down badge since the previous entry (soft-green down / soft-amber up), a hand-rolled min–max sparkline (no chart lib) so a narrow weight band still reads as a trend, and a short editable history list. Minimal and calm. |
| 8 | History / past week | `p35-history-1440.png` | **PASS.** ‹ / › week nav; a prior week (17–23 Aug) shows that week's marks + non-negotiables ("30 of 63", "All held this week"), no today-ring, a "Jump to this week" affordance. The grid IS the history. |
| 9 | Manage person | `p35-person-manage-1440.png` | **PASS.** Rename, change login email, reset password (leave blank to keep) — an inline form under the person bar. Remove is a destructive `window.confirm` (native dialog, not screenshot-able) spelling out that it deletes the login + all routine history. |
| 10 | Person login (walled) | `p35-person-390.png`, `p35-person-1440.png` | **PASS.** The whole person app: a warm time-of-day greeting + a big tap-to-check list of today's tasks + a celebration when all done + Sign out. NO nav, NO grid, NO weight, NO non-negotiables, NO work anything. Confirmed by API too (`/api/routine/kid` returns only name+tasks; every work API 403s a PERSON). |

## Overlay / edge notes
- Today-ring uses `ring-offset` against the card surface — no clipping at card edges.
- Long habit/segment names truncate with ellipsis only in the edit-mode rows and the person-bar login hint; every grid habit name shows in full.
- 390px: cells are full-width/7 (~44px) — comfortable tap targets; the page never scrolls horizontally.

## Judgment
Calm ✓ (soft ground, rounded cards, generous spacing, warm copy, no alarm-red).
Simple ✓ (one summary line per section, single-purpose edit mode).
Interactive ✓ (optimistic tap-to-cycle grid + non-negotiable toggles + task checks).
