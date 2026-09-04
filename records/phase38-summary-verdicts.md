# Phase 38 — Routine Weekly Summary sub-tab — verdicts

Evidence in `records/evidence/phase38/`. Manager-only. Judged calm/simple + that
switching weeks recalculates + that the summary is consistent with the grid tally.

## Tab structure (chosen)
A segmented **Summary | Tracker** toggle at the top of the manager Routine
dashboard (right under the header, above the shared person bar + week nav).
- **Summary** (the DEFAULT first view) — the new calm weekly overview.
- **Tracker** — the existing grid / non-negotiables / tasks / weight, unchanged.
The week selector is **SHARED**: the WeekNav sits above both views and drives a
single `week` state, so changing weeks recalculates BOTH the summary and the
tracker. Switching tabs preserves the selected week.

| Screen | Files | Verdict |
|--------|-------|---------|
| Summary — this week | `p38-summary-1440.png`, `p38-summary-390.png` | **PASS.** "Weekly summary" card: a per-segment row (name · daysMet/target · Score %) with a calm soft-blue progress bar (soft green when ≥80%), an **Overall** row (31/63 · 49%), and a **Non-negotiables: 2 crossed** line ("Should be 0 — addressed immediately, not scored"). "Information, not a verdict." Low scores in soft amber, strong in soft green — never a harsh red. No identity-truncation of segment names or numbers on either width. |
| Summary — a PAST week | `p38-summary-prev-1440.png` | **PASS.** Selecting 17–23 Aug shows THAT week's numbers — completely different (Sleep 5/14·36%, Health 13/19·68%, **Academics 11/13·85% in the soft-green tier**, Mind 4/17·24%, Overall 33/63·52%, **Non-negotiables: all held**). Proves per-week recalculation + all three calm colour tiers (green/navy/amber). |
| Tab toggle → Tracker | `p38-tracker-1440.png` | **PASS.** The Tracker tab switches to the existing 2-column grid. Its "**31 of 63** targets met" + per-segment tallies (10/14, 8/19, 2/13, 11/17) **match the Summary exactly** — same aggregation, one shared week. |

## Reuse (no parallel scoring calc)
The summary is a **projection** of the tallies the grid already computes:
`lib/routine.ts summarizeWeek(segmentsDto, nonNegotiablesDto)` maps each segment's
`metThisWeek` → `daysMet` and `targetThisWeek` → `target`, sums them for the overall,
and sums `nonNegotiable.violationsThisWeek` for violations. It reads the SAME
`segmentsDto`/`nonNegotiablesDto` that `buildOverview` already built from
`buildHabitGrid` — no second pass over the marks, no N+1, no separate scoring path.
Verified by the test: `summary.segments[0].daysMet === overview.segments[0].metThisWeek`.

## Endpoint scoping
The summary rides on `GET /api/routine` (already `requireManager`, own-person-scoped).
PERSON → 403, lead/dev/admin → 403, another manager sees only their own (person:null,
empty summary) — never M's data. The person `/kid` carries NO summary.

## Judgment
Calm ✓ (soft bars, gentle colour, no red scoreboard) · Simple ✓ · Recalculates per
week ✓ · Consistent with the grid tally ✓ · Person wall unchanged ✓.
