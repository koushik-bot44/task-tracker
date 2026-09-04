# Phase 36 — weight containment audit + monthly weight trend — verdicts

Evidence in `records/evidence/phase36/`. Screens judged calm / simple / consistent
with the Routine tab. All the weight surfaces; person login weight-free.

## Change 1 — containment audit (report before change)
Two independent exhaustive audits (a manual grep sweep + a read-only Explore
agent across 7 surfaces) traced every path a person's `WeightEntry` could travel:
API routes, the Prisma `Person` relations, the person `/kid` login, components
rendering "kg", manager non-Routine surfaces, notifications/emails/cron, and DTOs.

**Finding: weight is ALREADY contained to the manager's Routine tab in the current
source — no active leak was found.** Specifically:
- Every `prisma.person.*` query uses a narrowing `select` that never lists
  `weightEntries` (`lib/routine.ts`, `app/api/routine/kid/**`).
- Every `prisma.weightEntry.*` read/write is `requireManager` + own-person scoped
  and lives only in the Routine feature (`lib/routine.ts`, `app/api/routine/weight/**`).
- The person login endpoint `GET /api/routine/kid` returns `{name, today, tasks}` —
  no weight (verified live in the phase-35 prod smoke: `hasWeight:false`).
- `WeightMonitor` is imported only by `RoutinePage`; `useRoutine`/`GET /api/routine`
  are consumed only by the Routine tab; no dashboard/overview/People/changelog/
  calendar/meetings/review/my-space touches weight.
- No notification/email/cron re-emits a logged weight; `WeightEntryDTO`/`weights`
  appear only in `RoutineOverviewDTO` (served solely by the manager `GET /api/routine`).

Because no leaking surface exists, there was nothing to *remove*. Instead the
containment is now **enforced permanently** by `scripts/check-phase36-weight.ts`
(server-side, 22/22): weight endpoints MANAGER-only (PERSON/lead/dev/admin → 403),
own-person-scoped (another manager's weight entry → 404), person login omits weight,
and `/api/overview`, `/api/users`, `/api/users/me`, `/api/calendar`, `/api/meetings`,
`/api/review` all return no weight field. If the owner still observes a weight value
outside the Routine tab, it is not produced by this code — likely a stale client
cache or the manager's own Routine tab; point me at the exact surface and I'll trace it.

## Change 2 — monthly weight trend

| Screen | Files | Verdict |
|--------|-------|---------|
| Monthly trend (focused) | `p36-weight-monthly-1440.png`, `p36-weight-monthly-390.png` | **PASS.** A calm segmented **Recent / Monthly** toggle. Monthly shows the current month big (**44.1 kg / Aug 2026**), a gentle **−0.8 kg vs last month** badge (soft-green down), a hand-rolled min–max sparkline with month labels (Apr→Aug, last point dotted), and a latest-in-month list (Aug 44.1, Jul 44.9, Jun 44.8, May 45.6, Apr 45.5). Reads as "this month vs last" at a glance. No dense chart, no chart lib. Month labels are full — no truncation, both widths. |
| Recent view | `p36-weight-recent-1440.png` | **PASS.** Unchanged behaviour under the toggle: latest entry + delta vs previous entry + entry sparkline + recent list. |
| Full Routine page (monthly) | `p36-routine-monthly-1440.png` | **PASS.** The monthly weight card sits calmly at the foot of the Routine tab, consistent with the grid / non-negotiables / tasks above it. |
| Person login (weight-free) | `p36-person-390.png`, `p36-person-1440.png` | **PASS.** Greeting + task checklist + Sign out only. No weight, no trend, no nav — containment holds visually and by test. |

## Representative point + aggregation
Representative point per month = the **LATEST entry that month** (IST calendar
month), computed in-memory from the already-fetched ascending `weights` (no extra
query, no N+1), capped to the last 12 months. Verified by `check-phase36-weight.ts`:
seeded Jun[60.0, 60.5]/Jul[61.2]/Aug[61.0, 60.8, 61.5] → monthly [60.5, 61.2, 60.8].

## Judgment
Calm ✓ · Simple ✓ · Consistent with the Routine tab ✓ · Identity-truncation: none found.
