# Landing L3 — Family entry · every "drop" row gone · jargon 0 · checklist at all widths · walls · defect ledger closed

Verified on the local prod clone, dev server on :3000, 2026-09-04. Production
untouched.

## Family entry

- A MANAGER who owns (or monitors) a Person gets a fifth tab, **Family**, in
  the bottom bar at 390 and in the rail at 1440; nobody else sees it
  (`hasFamily` on `/api/users/me`, computed server-side).
- Proof: throwaway manager + Person created and deleted by the rig;
  `records/evidence/restructure/family-tab-390.png`, `family-tab-1440.png`,
  `family-routine-390.png`, `family-routine-1440.png`. Tapping the tab lands
  on `/routine`; zero console errors; no horizontal overflow. Well Being's own
  screens (`/routine`, `/person`, PERSON walls) are untouched by the
  restructure — the regression probes for routine, weight, person habits,
  summary and collaborators are all green (`regression.txt`).

## Every "drop" row is gone

Grep over `app/ components/ lib/ scripts/ prisma/` for the dropped features
(`gateTemplate`, `gates`, `pinnedAt`, `groupColor`, `health`, `changelog`,
`kanban`, `backlog`, `P0`, `verified`, the seven-status names) finds:

- no code path — only the redirect in `next.config.mjs` (`/changelog` →
  `/projects`), the banned-word list in `scripts/jargon.ts`, the historical
  dump/dry-run/clone scripts that read the pre-migration tables on purpose,
  and a handful of comments;
- the sixteen rigs that photographed dropped screens (Focus rows, the tool
  tree edit rail, gate tooltips, department dashboards, the sandbox tool,
  phase-6 shots, modal/motion/pair/panel-writes/spot/align/button checks,
  a one-off lead repair) are deleted, as are three probes whose premises the
  restructure removed (`check-phase17` team popover, `check-phase31`
  invites-on-create, `check-phase22` "no meetings exist yet") and the unused
  `/api/projects/[id]/team` route. Listed by path in the L3 commit.
- `README.md` rewritten for the new shape; `TRACKER_PRODUCT.md` marked
  superseded (kept as history).

## Jargon

`npm run jargon`: 98 files scanned, **0 hits**. Role words appear on People
(and the person sheet) only.

## Checklist at all widths

Every screen was photographed at 390 / 768 / 1440 by its own rig (see the
per-screen verdicts); each capture has zero console errors, zero page errors
and `scrollWidth == innerWidth`. `npm run overlays`: every sheet, drawer, menu
and palette inside the viewport at 390×844 and 1440×900 (10/10). Contrast
36/36 pairs ≥ 4.5:1 for text. Nothing renders below 13px (the type scale has
no smaller step).

## Walls

`records/evidence/restructure/perm-matrix.txt` (113/113): the ADMIN reaches
People and Account only (every work endpoint 403s; the frame no longer asks
for projects or Today on their behalf — defect #8, fixed and re-shot:
`people-admin-390.png`, zero console errors); the PERSON reaches the routine
endpoints only; My notes are invisible to every other role including the
director.

## Defect ledger

`records/defects.md` rows 1–8: all **fixed**, none open. No landing closed
with a known red.

## Static gate (final)

`npx tsc --noEmit` 0 errors · `next lint` clean · `npm run jargon` 0 ·
`npm run tokens` PASS · `npm run contrast` 36/36 · `npm run overlays` 10/10 ·
`npx next build` passed (all routes compiled, `BUILD_EXIT=0`, dev server paused for it and restarted).

## Not done on purpose

- Production is not migrated. `records/plans/apply-to-prod.md` is the runbook;
  it needs the founder's email for `scripts/promote-founder.ts` (no FOUNDER
  account exists yet — the clone tops out at DIRECTOR).
- Email, WhatsApp and push were exercised through their engines and mock
  transports (the Mac has no SMTP/Twilio/VAPID credentials); the built bodies
  are in `records/evidence/restructure/message-b-*.{html,txt}`.

## Integrity (both hashes, clone)

| snapshot | tasks | 6-field sha256 | full sha256 |
|---|---|---|---|
| `restructure-baseline-clone` (before the migration) | 143 | ad31c267… | in `integrity-full-2026-09-04T07-14-26-553Z.json` |
| `restructure-final-clone` (after everything, rig rows removed) | 143 | ec9cc47b… | b3013309… |

Row-by-row diff of the two snapshots: 0 rows added, 0 removed; the only field that moved is `status`, exactly per the migration map — BACKLOG→TODO 39, PLANNED→TODO 2, IN_PROGRESS→DOING 2, CANCELLED→DONE 1 (that one is also `archived`). No assignee, due date, parent, order or completion field changed. The interim `restructure-final-clone` line with 156 rows is defect #9 (thirteen `RS-` rig rows, named and removed); its snapshot is kept as evidence.
