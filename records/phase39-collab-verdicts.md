# Phase 39 — routine collaborators + task reminders — verdicts

Evidence in `records/evidence/phase39/`. The PERSON wall is unchanged; the invited
MANAGER gains access to ONE routine via the invite.

| Screen | Files | Verdict |
|--------|-------|---------|
| Owner Routine (invite + panel + reminder) | `p39-owner-1440.png` | **PASS.** Full Tracker + a **Reminder** card ("2 tasks still to do today · Send reminder", disabled when 0) + an owner-only **Monitoring managers** panel: an "Invite a manager…" picker with a Read-only/Editable toggle, and each collaborator listed with their status (Monitoring / Invited), a permission toggle, and a revoke ×. Calm, consistent with the tab. |
| READ_ONLY collaborator view | `p39-readonly-1440.png` | **PASS.** COLLAB viewing Aarav: a routine **switcher** ("Aarav (read-only)"), a **Read-only** badge, and the person bar with **no edit/delete**. Everything is VISIBLE — the grid marks, summary, weight monitor, non-negotiables, tasks — but every write control is **absent**: no Edit, no Add, no Log, no ×, no task input, no reminder card, no monitoring panel; grid + non-negotiable cells are non-tappable. |
| Home — routine invite | `p39-home-invites-1440.png` | **PASS.** The invited manager's Home shows "OWNER invited you to monitor Aarav's routine (editable)" with Decline / Accept, beside the project collaboration invites (same pattern). |
| Person /kid — reminder | `p39-person-reminder-390.png` | **PASS.** A calm soft-amber banner ("Reminder: 2 tasks to do · Pack school bag, Read for 20 minutes") above the habit grid + tasks. Shown once, then marked read. |

## Feature 1 — the collaborator model + the ONE access resolver
`RoutineCollaborator { personId, managerId, permission (READ_ONLY|EDITABLE), status
(PENDING|ACCEPTED), invitedById, @@unique(personId, managerId) }`. **All** routine
access funnels through `lib/routine.ts requireRoutineAccess(callerId, personId?, {write?, ownerOnly?})`
— resolves OWNER (`Person.managerId`) | EDITABLE | READ_ONLY | none(404); reads for
owner + both collaborator types, writes for owner + EDITABLE, owner-only for delete-
person + manage-collaborators. `getAccessibleRoutines` builds the switcher (own +
accepted collaborations). No parallel relationship checks — every write endpoint was
rerouted from `requireOwnPerson(actor.id)` to `requireRoutineAccess(actor.id, personParam(req), {write:true})`.
**Multiple routines:** a `?person=` selector on every routine request + a switcher in
the header when the caller can open more than one.

## Feature 2 — the manual reminder (+ auto-seam)
`remindPerson(person)` (lib/routine.ts): finds today/undated undone tasks; if none →
no send; rate-limited to one per person per 5 min; else `notifyUsers([person.userId], …)`
— a durable in-app Notification **plus** a best-effort push to the person's account
(`sendPushToUsers`). Surfaced on `/person` (shown once, then marked read). `POST
/api/routine/reminder` is owner/EDITABLE (READ_ONLY → 403). **Auto-seam:** `remindPerson`
is the whole "who + what" unit; a future CRON_SECRET-gated cron can iterate persons
and call it — no logic duplicated. No schedule added now (stated).

## Judgment
Calm ✓ · Consistent with the routine tab ✓ · Read-only view: everything visible,
controls absent ✓ · Person wall unchanged ✓ · No identity-truncation.
