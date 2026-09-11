# Starting an organisation on Orbit (2026-09-11)

Orbit starts with one account, the CEO, and nine default departments —
Development, Administration, Accounts, Operations, Research and Development,
ERM, HR, Network Admins and Self (`lib/default-departments.ts`). Nothing else is
built in: every person, team, project and task is made from the screens.

## 1. The CEO account
- **A brand-new deployment** (empty database): set `APP_PASSCODE`, open the
  site, and fill in *Set up the CEO account*. It makes the CEO and the default
  departments, then closes for good (two first visits at once still make one CEO).
- **The live site**: the CEO account exists. The CEO moves it to their own
  address from **Account → Sign-in email** (proving the password) and changes the
  password from **Account → Change password**.

## 2. Invite people — People → Invite
- One or many at once. Each person: name, one or more emails, a **Position** —
  Co-founder, Head of department, Manager, Team lead, or left as Team member —
  and a **Department** (the CEO may also leave someone *Not placed yet*).
- Every row is checked before anyone is made, so a typo never leaves half a list.
- Each person's set-password link shows straight away: **Send on WhatsApp** or
  **Copy link**. A link works once, for 3 days. People → the person → **Share
  invite link** makes a fresh one and ends the old.
- Someone invited can already be given tasks, put on teams and projects, and
  picked as a head, before they set their password.
- A head of department or a manager invites only into a department they run,
  and only people below their own level.

## 3. Heads of department
- Invite someone as **Head of department** into a department with no head, and
  they head it straight away. Or: Departments → the department's **⋯** → Head of department.
- Moving a head to another department, changing their position or switching
  them off leaves the old department without a head until one is picked.
- A department with people or teams can't be deleted; move them first.

## 4. Teams — People → a department → + Team
A name, a lead and who is on it. The CEO, or the department's head.

## 5. Projects — Departments → New project
Name, department, lead, the people on it, and people not on Orbit yet (the same
rows as Invite, each with a position). The project's **lead runs it**: they edit
it and add people. On the project, **Add people** adds or invites more.

## 6. Tasks — Work → New, or + on Today
A short description, a department, a project (optional), a team (optional), and
who: tick several and each gets their own record, or invite someone new. A task
given to someone is **Work in progress** at once. A task needs a department or
a person, so it always reaches someone.

## What has been checked
`scripts/check-first-run.ts` (a fresh deployment) and
`scripts/check-org-setup.ts` (this whole guide, on the clone, including who can
see what) run these steps and leave no trace.

## Not on the screens yet
- Task categories and routing rules exist in the API only.
- Pausing a team, and a team lead editing their own team from People.
- Milestones (taken off the screens by the owner, 2026-09-11).
- Email: the live site has no SMTP settings, so send the links yourself until they are added.
