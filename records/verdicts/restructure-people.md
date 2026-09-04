# Restructure verdict — People (`/people`)

Shot 2026-09-04 against the local clone as `founder@orbit.local` (DIRECTOR)
and `admin@orbit.local` (ADMIN). Evidence in
`records/evidence/restructure/people-*.png`.

## 10-second test

**Pass.** Search box, one blue button ("+ Invite"), then the company as
department cards: DEVELOPMENT / OPERATIONS / RESEARCH AND DEVELOPMENT / NOT
PLACED YET, each row a face, a name and a plain role word ("Manager", "Team
member"). The head of each department sits first with a "Head of department"
chip; people who haven't finished signing up say "Invited"; a switched-off
account says "Disabled". The admin line at the foot reads as a sentence. Tap a
row → the person's sheet with four things you can change and the account
buttons.

## LOOK lines

| Rule | Verdict |
|---|---|
| Warm off-white page | pass |
| White cards | pass — one card per department, rows split by hairlines |
| No borders except accent | pass — cards carry the shadow only; inputs keep the kit's hairline edge; the reset-request queue is a warn-soft tint, no border (the old page had `border-warn`) |
| One accent | pass — "+ Invite" and the "Head of department" chip; status chips are neutral |
| Text ≥ 13px | pass — 17px names, 15px inputs, 13px role words / chips / section labels; nothing smaller |
| Sentence case | pass — "Find a person", "Invite someone", "Send invite", "Not placed yet", "Reset password", "Disable account"; section labels are the spec'd 13px uppercase |
| No jargon | pass — grep clean; role words appear here only (`ROLE_LABEL`) |
| No charts/tables | pass |
| 390 first, then 768/1440 | pass — same layout at every width, `max-w-content` centred |
| `max-w-content mx-auto px-4 pt-4` | pass |
| Motion 150–200ms + `useReducedMotion` | pass — sheets from the kit (180ms, reduced-motion aware); press tint 160ms CSS |
| Dates as words | pass — the only date is the reset queue's "asked today / yesterday" via `dateWord` |

## What was built

- `components/people/people-page.tsx` (`PeoplePage`, wired from `app/(app)/people/page.tsx`): sections per department (head first, then by rank, then name); a head is placed at the top of the department they head wherever their own placement says; "Not placed yet" for `departmentId` null; "Find a person" search; disabled accounts shown (dimmed, "Disabled") only to those who can enable them again; admin footnote line (tappable names for an admin actor).
- `invite-sheet.tsx`: Name · Email · Role (`rolesOfferedTo` — chain actors strictly lower, DIRECTOR/FOUNDER may offer DIRECTOR, ADMIN ≤ MANAGER, never ADMIN/PERSON/FOUNDER) · Department (optional) → "Send invite" → `createUser` with `departmentId`; toasts kept from the old page.
- `person-sheet.tsx`: Face + email + status; Department select; Role select (offered roles, locked for ADMIN/FOUNDER); WhatsApp number + Save; Reset password (PasswordReveal shown once), Disable/Enable (never on yourself), Resend invite / Cancel invite for PENDING, Delete (disabled with the owned-projects reason). `canAdministerTarget` mirrors `assertCanAdministerTarget`: ADMIN row only for an admin, FOUNDER row only for the founder, admin reaches manager-and-below, chain actors reach strictly lower ranks (director ↔ director allowed). Rows the viewer can't administer are plain, not tappable.
- `reset-requests.tsx`: the admin's password-reset queue at the top of the page.

## States checked

| State | Evidence |
|---|---|
| Founder view, 390 / 768 / 1440 — 4 sections, head chips, "Invited", "Disabled", "· you", admin footnote | `people-390.png`, `people-768.png`, `people-1440.png` |
| Invite sheet (Role defaults to Team member; Department optional; Send invite disabled until filled) | `people-invite-390.png` |
| Person sheet for a team member (Department / Role / WhatsApp number / Reset / Disable / Delete) | `people-person-390.png` |
| Admin view, 390 — reset-request queue on top, sections built from each person's own placement, admin names tappable | `people-admin-390.png` |

## Console / overflow

| Capture | Console errors / page errors | `scrollWidth` ≤ `innerWidth` |
|---|---|---|
| people-390 | 0 | 390 / 390 |
| people-invite-390 | 0 | 390 / 390 |
| people-person-390 | 0 | 390 / 390 |
| people-768 | 0 | 768 / 768 |
| people-1440 | 0 | 1440 / 1440 |
| people-admin-390 | 2 × `403 /api/projects` (see below) | 390 / 390 |

The admin's two 403s come from the shell: `components/app-frame.tsx` (route
title, detail-panel host) calls `useProjects()` for every signed-in role and
the admin has no project access. That file is outside this change. The
people page itself no longer triggers a 403 for the admin — its
`/api/departments` read is gated off for ADMIN (the admin can't read that
list), and the sections fall back to each person's own `departmentName`.

`npx tsc --noEmit` prints nothing for `components/people` and
`app/(app)/people`; `npx next lint --dir components/people` is clean.

## Unverified

- A FOUNDER actor (the seed has no FOUNDER account; the top of the chain here is DIRECTOR) — the founder-only branches of the rank rule are mirrored from `lib/permissions.ts` but not exercised live.
- The mutations themselves (department move, role change, phone save, reset + PasswordReveal, disable/enable, resend/cancel invite, delete) — not fired against real accounts; wired to the same `useUserMutations` calls the old page used, with the server as the authority.
- Search narrowing and the "Nobody matches that name" state — not captured.
- The person sheet as an admin (opened from the footnote name, or on a manager row) — not captured; for an admin the Department field is hidden because the department list is not readable, so placement is shown as text in the subtitle only.
- A department whose head is placed in a different department (the head is listed once, under the department they head).
