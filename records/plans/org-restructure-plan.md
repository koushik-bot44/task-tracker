# Org restructure + UI overhaul plan — 2026-09-03

Owner request: rebuild Orbit around the company structure on Rahul's whiteboard
(8 departments: Administration, Accounts, Operations, ERM, HR, Network Admins,
R&D, Self) with a Founder → Director → HOD → Manager → Team Lead → Resource
chain, then overhaul the UI so non-technical people understand every screen.

## Current model (verified in code)

- Roles `MANAGER | TEAM_LEAD | DEVELOPER | ADMIN | PERSON` live in THREE synced
  lists: `lib/auth.ts:15` (sign-in allowlist), `lib/types.ts:209` (+ compile-time
  `_RolesMatch` assertion, types.ts:217), `prisma/schema.prisma` enum Role.
- Visibility: `lib/project-visibility.ts` is the single resolver. MANAGER =
  owned ∪ accepted collabs (phase-14 silo); TEAM_LEAD = all; DEVELOPER =
  member ∪ assigned; ADMIN and PERSON are hard 403 walls.
- Departments are per-manager (`createdById` scoping in app/api/departments and
  project create/move), phase 16.
- Account guards: single-admin cap, last-manager rule, no self-disable
  (lib/account-guards.ts + app/api/users/[id]/route.ts).

## Target model

Role ladder (rank high→low): FOUNDER(1, capped at one) > DIRECTOR > HOD >
MANAGER > TEAM_LEAD > RESOURCE (rename of DEVELOPER). ADMIN (accounts-only)
and PERSON (Well Being wall) stay special, unchanged in behaviour.

- Visibility ladder (extend the one resolver, delete nothing):
  FOUNDER/DIRECTOR → all. HOD → projects in departments where they are the head
  (∪ owned ∪ accepted collabs). MANAGER/TEAM_LEAD/RESOURCE → unchanged.
- New predicate layer in lib/roles.ts: `isExecutiveRole` (FOUNDER|DIRECTOR),
  `isHodRole`, and `isManagerRole` widens to FOUNDER|DIRECTOR|HOD|MANAGER
  ("project authority"). `requireManager` in lib/session.ts is renamed in
  meaning to project authority; the Well Being (/routine) surface keeps a
  LITERAL `MANAGER` check everywhere (middleware + routes) — preserved as-is.
- Account administration: rank rule — you may create/administer only accounts
  of strictly lower rank; ADMIN account touchable only by ADMIN (existing);
  FOUNDER never mintable through the UI (like PERSON); last-authority guard
  replaces last-manager guard (cannot remove the last active
  FOUNDER/DIRECTOR/HOD/MANAGER); no self-disable (unchanged).
- Departments become COMPANY-WIDE: add `hodId` (nullable FK), `description`;
  `createdById` becomes nullable/SetNull (attribution only). Create/delete =
  FOUNDER/DIRECTOR. Edit = FOUNDER/DIRECTOR or that department's HOD. Assign
  HOD = FOUNDER/DIRECTOR. Managers no longer create departments; deleting a
  user no longer cascades departments. Department NAMES are visible to all
  work roles (org structure is public inside the company); project CONTENTS
  stay chain-scoped — deviation from strict "HOD sees nothing else", stated.
- Existing 5 prod departments are kept and matched by name to the whiteboard 8
  (Administration, Accounts, Operations match; "Research and Development" = R&D;
  Development stays unmatched for the owner to merge later). Missing ones
  (ERM, HR, Network Admins, Self) are seeded by an idempotent script.
- Project gains `priority` (enum CRITICAL|HIGH|MEDIUM|LOW, default MEDIUM) and
  `deadline` (nullable). "Importance 1–5" is FOLDED into priority — two knobs
  for the same instinct would confuse the non-technical audience this build is
  for. Setters: FOUNDER/DIRECTOR anywhere; HOD in their department; owner
  manager on their own. Owner-only powers (edit/delete/refile/collaborators)
  widen to FOUNDER/DIRECTOR always and HOD within their department via one
  helper (`canActAsProjectOwner`).
- Task priority stays P0–P3 in the DB; only LABELS change (Critical/High/
  Medium/Low) — no second enum migration.
- DEVELOPER → RESOURCE by `ALTER TYPE ... RENAME VALUE` (data-preserving);
  user-facing label: **"Team member"** (friendlier than "Resource"; stated pick).

## Migration (single, additive + renames, hand-authored SQL)

ADD VALUE FOUNDER/DIRECTOR/HOD to Role; RENAME VALUE DEVELOPER→RESOURCE;
Department + hodId/description, createdById nullable + SetNull FK;
new enum ProjectPriority; Project + priority/deadline. No cascade deletes
introduced. Proven on a full clone of prod data locally BEFORE any prod apply;
prod apply happens only after owner sign-off, with a JSON dump taken first.

## UI overhaul (Phase B) — per the synthesized design brief

Mercury-calm light theme on the EXISTING token names (values change, names
mostly stay so components keep working): violet-tinted neutrals, hairline
borders instead of card shadows, one cobalt accent, status color rationed.
Inter for body/data (tabular numerals), Plus Jakarta Sans kept for headings/
KPIs. Glossary sweep (Backlog→To do, Done→Completed, Changelog→Recent updates,
P0–P3→Critical–Low, Developer→Team member, board/tree relabels). New screens:
Company home (Founder/Director), upgraded Department page (+ New project on
top, project cards sorted priority→deadline), calm Project overview default,
Org chart panel (indented tree, role pills). Well Being's distinct treatment
kept. Trim vs brief: no "weekly written health update" data model this pass —
health chips derive from existing signals (overdue/at-risk counts + Health).

## Not touched

Well Being/PERSON wall, WhatsApp, push, email, invites mechanics, meetings
mechanics, snooze, My Space privacy. All existing checks (contrast, tokens,
cross-list, parser) must stay green.

## Open decision for the owner

Which REAL account becomes FOUNDER in production (locally a founder@orbit.local
test account is used). Nothing auto-promotes.
