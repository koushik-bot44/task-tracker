# Phase 48 — the company hierarchy + prototype UI (2026-09-03)

Built against a LOCAL CLONE of production (records/snapshots/prod-dump-2026-09-03T…),
production untouched. Owner's whiteboard (8 departments) + structure diagram
(Founder→Company, HOD→Department, Manager→Project, Resource→Tasks; People/
Calendar/Meetings/Well Being out of the sidebar) are the spec.

## Shipped

- **Roles**: enum + both ROLES arrays + labels now FOUNDER, DIRECTOR, HOD,
  MANAGER, TEAM_LEAD, RESOURCE (renamed from DEVELOPER in place — zero data
  rewritten), ADMIN, PERSON. RESOURCE's user-facing label is "Team member".
- **Migration** `20260903190000_phase48_org_hierarchy`: additive + rename-only.
  Role ADD VALUEs + RENAME VALUE; ProjectPriority enum; Project.priority
  (default MEDIUM) + Project.deadline; Department.description + hodId;
  Department.createdById nullable/SetNull (no user delete removes a shared
  department any more; the route's department cascade was removed).
- **Visibility ladder** (lib/project-visibility.ts, still the single resolver):
  FOUNDER/DIRECTOR all · HOD their headed department(s) ∪ owned ∪ collabs ·
  MANAGER owned ∪ collabs (unchanged) · TEAM_LEAD all (unchanged) · RESOURCE
  member ∪ assigned (unchanged) · ADMIN/PERSON walls unchanged.
  New `canActAsProjectOwner` widens owner powers to executives everywhere and
  the HOD within their department; plain collaborators still cannot reshape.
- **Account rank rule** (lib/permissions.ts): create/administer strictly below
  your own level; ADMIN keeps manager-and-below; only ADMIN touches ADMIN; only
  FOUNDER touches FOUNDER; FOUNDER and PERSON never mintable via UI; single-
  admin cap kept; last-manager guard generalised to last-project-authority;
  no self-disable kept. Manager-vs-manager administration deliberately moved
  up to HOD+.
- **Departments company-wide**: everyone sees the structure (RESOURCE still
  only sees departments holding a visible tool); create = executive; edit =
  executive (HOD: description only); delete = FOUNDER only + empty-only 409.
  Whiteboard departments seeded by alias-match (R&D ↔ "Research and
  Development"); Development left for the owner to merge/rename.
- **Well Being untouched**: requireManager stays literal MANAGER; middleware
  /routine gate unchanged; PERSON wall re-verified by code path (requireUser).
- **Prototype UI**: Company page (executive home: ring + trouble-first
  department cards with HOD/progress/status), Department page ("+ New project"
  primary at top, HOD + description header, cards sorted priority→deadline→
  name with priority pills + deadline chips, plain-language empty state),
  /people org chart (indented tier tree, role pills, Invited chip, admin
  footnote), top-bar QuickNav (People/Calendar/Meetings/Well Being icons,
  role-gated) replacing those sidebar rows, priority+deadline fields on
  project creation, pills on the project header, "Changelog"→"Recent updates".
- Verified: tsc clean; screenshots founder/manager/resource; API smoke —
  founder sees all, HOD sees only their department's projects and cannot
  create departments (403), fresh manager sees structure but no projects.

## Deliberate calls (stated, reversible)

- "Importance 1–5" folded into priority — one knob, four plain levels.
- Department NAMES are company-visible; project contents stay chain-scoped
  (softer than "HOD sees nothing else"; matches the org-chart-is-public IA).
- MANAGER may create a project in ANY department (it becomes theirs); HOD
  only in their own.
- Task P0–P3 keeps its DB enum; labels now Critical/High/Medium/Low.

## Not yet (the depth pass)

Mercury-calm token overhaul + Inter, full glossary sweep (Backlog→To do,
gates language, board/tree labels), inline priority/deadline editing on the
project page, HOD flows in the create modal picker (server already enforces),
permission-matrix script extension to 8 roles, prod migration + FOUNDER
promotion (owner must name the account), records integrity ledger entry
against prod at apply time.
