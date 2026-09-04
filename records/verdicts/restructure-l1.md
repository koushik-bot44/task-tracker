# Landing L1 — model · migration · UI kit · nav · Today · Projects · Project · Give a task · drawer · People · Settings

Verified on the local prod clone (`orbit_clone`, PostgreSQL 18 on :5433), dev
server on :3000, 2026-09-04. Production is untouched.

## Model and migration

- `prisma/migrations/20260904120000_restructure/migration.sql` — 54 statements,
  one transaction. Rehearsed with `scripts/restructure-dryrun.ts` (BEGIN … ROLLBACK
  + audit) before `prisma migrate deploy` on the clone.
- Evidence: `records/snapshots/restructure-dump-*/` (every affected table before),
  `records/snapshots/restructure-audit-clone-2026-09-04T07-17-15.json` (after).
- Counts after (clone = prod data as of the 2026-09-03 dump):

  | what | count |
  |---|---|
  | users placed in a department (`User.departmentId`) | 12 of 16 |
  | tasks TODO / DOING / STUCK / DONE | 51 / 2 / 0 / 100 |
  | tasks `important` (was P0/P1) | 6 |
  | tasks `archived` (was CANCELLED) | 1 |
  | comments PROJECT / TASK (from ProjectNote / TaskNote / task descriptions) | 2 / 2 |
  | `ProjectMember.canManage` (from ACCEPTED ProjectManager) | 0 |
  | milestones | 0 (none existed; boxes are new) |

- Integrity: `restructure-baseline-clone` (143 tasks) and `restructure-after-clone`
  in `records/integrity-ledger.txt`; both hashes recorded. No real task changed
  fields other than the mapped ones (status, important, archived, milestoneId
  null).

## Screens (per-screen verdicts hold the 10-second test and the LOOK checklist)

| screen | verdict | captures (records/evidence/restructure) |
|---|---|---|
| Today | `restructure-today.md` — pass | today-founder-{390,768,1440}, today-dev-{390,768,1440}, today-give-390, today-meeting-390, today-reschedule-390, today-ticked-390, today-founder-empty-390 |
| Projects | `restructure-projects.md` — pass | projects-{390,768,1440}, new-project, filters, empty |
| Project | `restructure-project.md` — pass | project-{390,768,1440}, drag-and-drop proof, note bubble, add-milestone, move-review, set-progress |
| People | `restructure-people.md` — pass | people-{390,768,1440}, people-invite-390, people-person-390, people-admin-390 |
| Settings | `restructure-settings.md` — pass | settings-{390,768,1440}, settings-notifications-390 |

Every capture: zero console errors, zero page errors, no horizontal overflow at
390 / 768 / 1440 (one exception, the admin's 403s on People, is defect #8 —
fixed in this landing).

Tap count for *Give a task* from Today: **3** (+ → what → who → by when → Send;
"by when" defaults to the milestone's review date when opened from a box).

## Rules proven (rigs, verbatim output in records/evidence/restructure)

- `npm run perm-matrix` — **113 passed, 0 failed** (`perm-matrix.txt`): anyone
  on a project assigns anyone on it; "Add people" is MANAGER+; progress % is
  FOUNDER/DIRECTOR only; HOD/MANAGER visibility ladder; My notes isolation;
  ADMIN and PERSON walls; account rank rule and admin cap.
- `npm run flows` — **37 passed, 0 failed** (`flows.txt`): F1 give a task →
  message (a) → milestone → review meeting; F4 private note isolation; F5 invite
  with a department → set password → placed on People.
- Regression probes (`regression.txt`, all green): accounts (27), last-manager
  guard, password change, snooze (24), WhatsApp (26), personal space, routine,
  weight, person habits, summary, invite lifecycle, routine collaborators,
  phase-23 migration audit. 306 PASS, 0 FAIL.

## Static gate

`npx tsc --noEmit` 0 errors · `next lint` clean · `npm run tokens` PASS ·
`npm run contrast` 36/36 · `npm run jargon` 0 hits · `npm run overlays` 10/10
inside the viewport at every width.

## Defects

`records/defects.md` rows 1–8, all fixed before this landing closed.

## Deviations

See `records/plans/restructure-plan.md` §7 (nine, all stated and reversible).
Two probes of dropped features (`check-phase17` team popover shape,
`check-phase31` invites-on-create) and the phase-22 additive-migration audit
(assumed zero meetings exist; review meetings now exist by design) were
retired rather than adapted; their behaviour is covered by F1/F5 and the
permission matrix. Sixteen rigs for dropped screens (Focus rows, tool tree
rail, gate tooltips, dashboards, sandbox tools) were deleted with them —
listed in the commit.
