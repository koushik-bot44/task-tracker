# Phase 34 — Routine visual, security, and production evidence

Evidence images are in `records/evidence/phase34/` and survived `npm run clean:shots`.
Widths are 1440px and 390px; full-page captures were used for scrollable manager history.

## Per-screen verdicts

| Required screen | 1440 verdict | 390 verdict | Calm / simple / peaceful | Hierarchy and controls | Identity / overflow |
|---|---|---|---|---|---|
| Manager empty state | PASS | PASS | Yes / yes / yes | One gentle card and one obvious action | No clipping or truncation |
| Add-child form | PASS | PASS | Yes / yes / yes | Name, manager-set email/password, then Add | Labels wrap; no overflow |
| TODAY | PASS | PASS | Yes / yes / yes | Time, school, habits in reading order | Child identity remains readable |
| Habits | PASS | PASS | Yes / yes / yes | Large toggles; management is secondary | Long labels wrap within the card |
| Tasks | PASS | PASS | Yes / yes / yes | Composer precedes a low-density list | Mobile controls remain reachable |
| Streak and star | PASS | PASS | Yes / yes / yes | One warm line; no heavy gamification | No clipping |
| Weekly glance | PASS | PASS | Yes / yes / yes | Soft dot row; task-complete dot distinguished | No chart or overflow |
| History | PASS | PASS | Yes / yes / yes | Newest first, complete scroll; day facts and task state grouped | Task titles break safely |
| CHILD checklist | PASS | PASS | Yes / yes / yes | Separate shell, greeting, large tap targets | Name and task titles are intact |
| CHILD all-complete | PASS | PASS | Yes / yes / yes | Single star celebration above completed list | No overflow |
| Delete-child confirmation | PASS (native) | PASS (native) | Yes / yes / yes | Destructive copy names child, login, and history | Native dialog is viewport constrained |

Desktop is balanced around a narrow calm content column. Mobile is single-column with no horizontal
scroll or clipped control. The feature uses only existing tokens; raw hex, `matchMedia`, `data-theme`,
dangling `var()`, alpha-on-hex, and BOM counts are all zero in the phase cluster.

## Overlay edge proofs

- Add-child and login management are inline cards, so no floating edge can clip.
- Habit rename uses the browser-native prompt; delete-child uses the browser-native confirm. Both are
  operating-system constrained and reachable at 390px.
- Habit/task removal controls stay inside their flex rows at both widths.
- The repository-wide overlay suite could not authenticate because its configured `SHOT_MANAGER_*`
  credentials return 401. This phase introduces no custom CSS overlay, dropdown, popover, or portal.

## CHILD wall and flow evidence

`scripts/check-phase34-routine.ts`: 29/29 passed. Its explicit wall loop probed 49 non-child API
routes/families and every result was 403. It separately proved own child screen 200, own task PATCH
200, foreign/missing child task 404, manager-only Routine (admin/lead/developer 403), People exclusion,
People cannot mint CHILD, one child per manager 409, manager history sees completion, cascade deletion,
and zero `p34-` residue. `scripts/check-phase14-perms.ts`: 56/56 existing permission regressions passed.

## Production safety and integrity

- Pre-migration logical backup: 25 tables, 356 rows, 325,719 bytes; SHA-256
  `a73f561d1dc475f69081b5820afb025e0f2b805c88d165ddfe3a3d8ac0a13f9d`; stored outside Git in the
  system temp directory. PostgreSQL 13 `pg_dump` was incompatible with Neon PostgreSQL 17, so
  `scripts/backup-database.ts` performed a version-independent full-row logical export.
- `prisma migrate deploy`: 20 migrations found, no pending migrations. The inherited phase-34 migration
  had already been applied before takeover. SQL audit: enum addition + five CREATE TABLE blocks, indexes,
  unique constraints, and foreign keys only; no DROP, DELETE, UPDATE, or existing-row rewrite.
- Baseline and after: 131 work tasks; historical hash
  `992199330ac441b900e377f5c41ad0f663370f9c5b7fd00109b807e4e393eb95`; widened hash
  `d6dacf7187ded2ac76d538c3be27525cd46df9a0a2bd385051d55700060392b8`. Both are byte-identical.
- Throwaways: flow users created 6 and removed 6; visual users created 3 and removed 3. CHILD/routine
  rows cascaded; both harnesses reported residue 0. Existing owner work data was untouched.

## Quality gates

- Production build: PASS (known pre-existing Edge jose warnings and notifications-row hook warning).
- TypeScript: PASS. Lint: PASS with the same pre-existing hook warning.
- Tokens: PASS; contrast: 61/61; parser: 21/21; cross-list: 15/15.
- Clean-shots: PASS; tracked evidence remained under `records/`.
