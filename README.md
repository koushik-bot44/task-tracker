# Orbit

The place a small company keeps its projects. Who is doing what, by when, and
how far along each project is — on a phone first, on a desktop second, one
shared source of truth.

The current shape is specified in
[records/plans/restructure-plan.md](records/plans/restructure-plan.md)
(the restructure of 2026-09-04). `TRACKER_PRODUCT.md` is the older spec, kept
as history. This file is the engineering record: what is built, why it is
built that way, and which rules exist because something went wrong.

## Status (restructure, local prod clone)

| | |
|---|---|
| Build / types / lint | passing / clean / clean |
| Contrast audit | 36/36 pairs pass |
| Token audit | no dangling refs, no alpha modifiers |
| Jargon grep | 0 hits |
| Overlay geometry | 10/10 inside the viewport |
| Permission matrix | 113/113 pass |
| Flows F1–F5 | 37/37 pass |
| Regression probes | all green (`records/evidence/restructure/regression.txt`) |

Production has **not** been migrated. The runbook is
[records/plans/apply-to-prod.md](records/plans/apply-to-prod.md); it runs only
on the owner's word.

## The model

- **Project** — belongs to a department, has a lead, a start date, a deadline,
  a status (`PLANNED · ACTIVE · PAUSED · DONE`) and a **progress %** that the
  founder or a director sets by hand. Nothing computes it.
- **Milestone** — a box on the project page: a name, a review date, the tasks
  inside it, and notes (text, photos, PDFs). Creating one creates its **review
  meeting** at 11:00 IST with the founder, the lead and every task holder.
  After the review the founder posts an outcome — *On track* or *Needs work* —
  which lands on the box, on the project's %, and as a message to everyone on
  the project.
- **Task** — one line: what, who, by when. Status is `TODO · DOING · STUCK ·
  DONE`; a star marks it important; *Put away* archives it. Steps are one
  level deep (a checklist). Anyone on a project can give a task to anyone on it.
- **Notes** — one `Comment` table for projects, milestones and tasks, with an
  optional attachment on Vercel Blob (the camera and paper-clip hide when
  `BLOB_READ_WRITE_TOKEN` is unset).
- **My notes** — a person's private outline (the old tree engine, trimmed).
  Nobody else can read it, not even the founder.
- **Well Being** — `/routine` and `/person` are untouched by the restructure.

## Roles

`FOUNDER · DIRECTOR · HOD · MANAGER · TEAM_LEAD · RESOURCE` form the work
chain; `ADMIN` looks after accounts only; `PERSON` is a walled-off family
account. Role words appear on the People screen and nowhere else. The full
role × action matrix is in the plan; every rule is enforced per request on the
server (`lib/permissions.ts`, `lib/project-people.ts`,
`lib/project-visibility.ts`) — the UI only hides.

Passwords are scrypt. Sessions are a jose HS256 JWT in an httpOnly cookie.
Failed sign-ins are rate-limited in the database.

## Screens

Bottom tabs on a phone, a 220px rail on a desktop: **Today · Projects ·
Calendar · People**, plus **Family** for anyone who owns a Person. The top bar
carries the bell and the profile face (My notes · Account · Notifications ·
How Orbit works · Sign out).

- **Today** — a one-line summary for executives, *Your tasks*, *Meetings*
  (today and tomorrow, with *I'll be there* / *Can't* and Reschedule), *Needs
  your OK* (reviews due today, founder/director only), and the floating **+**
  which is *Give a task* (three taps: what · who · by when).
- **Projects** — cards by department: lead face, 12px bar + %, deadline chip,
  *Next: milestone · date*. Behind projects float to the top.
- **Project** — the owner's sketch: PROJECT START, connectors, one box per
  milestone with its tasks, notes beside it, *+ Give a task*, *+ Add
  milestone*, *Not in a milestone yet*. Tasks drag between boxes.
- **Calendar** — review chips, meeting chips, deadline marks, task dates; the
  day panel shows replies; *+ Schedule meeting* for managers.
- **People** — org chart by department, *Not placed yet*, *Invite* with a
  department.

Old routes redirect: `/focus`, `/review` → `/`; `/changelog` → `/projects`;
`/meetings` → `/calendar`; `/t/*` → `/project/*`; `/department/*` →
`/projects`; `/settings/users` → `/people`.

## Messages (exactly three)

| Key | When | Channels |
|---|---|---|
| `task_given` | someone gives you a task | bell · push · email · WhatsApp |
| `tomorrow` | 18:00 IST daily: your meetings and tasks due tomorrow, with *I'll be there* / *Can't* links | bell · push · email · WhatsApp |
| `review_result` | the founder posts a review outcome | bell · push · email · WhatsApp |

Meetings created, moved or cancelled write a quiet bell row only. The *Can't*
link is a signed public `/r/<token>`; Reschedule offers the next three working
days, moves the meeting, clears every reply and re-sends `tomorrow`.
`vercel.json` runs `/api/cron/tomorrow` at 12:30 UTC and the snooze wake-up.

## Design system

Light only. Warm off-white page, white cards with one soft shadow and no
borders (the current milestone box gets the one accent ring), radius 16,
gutters 16, content max 760, type 17 / 15 / 13 — nothing smaller. Sentence
case everywhere except the small-caps `MILESTONE n` / `REVIEW` labels. Dates
are words (*Today*, *Tomorrow*, *Thu*, *12 Sep*, *3 days late*).

Shared components live in `components/ui/`: Face, Card, Chip, Row, Sheet,
Drawer, Button, Toast, EmptyState, Skeleton, Connector, Segmented.

Rules that are load-bearing:

- **Colours come from CSS variables.** Zero hex literals in components.
  `npm run tokens` fails the build on a dangling `var(--x)` or an alpha
  modifier on a token (`bg-muted/45` compiles to nothing).
- **Chips are soft fills, not outlines.** Borders survive only where they mean
  something: inputs, checkboxes, drop targets, focus rings.
- **No `matchMedia` layout branching.** Responsive behaviour is CSS.
- **Motion is 150–200ms ease-out**, guarded by `prefers-reduced-motion`.
- **No charts, tables, tree lines, gates, gradients, dark mode, or jargon.**
  `npm run jargon` greps the UI for the banned words and exits 1 on a hit.

## Setup

```bash
npm install
cp .env.example .env      # then fill in the values
npx prisma migrate deploy
npm run dev
```

The variables are documented in `.env.example`: the database URLs, `AUTH_SECRET`,
`CRON_SECRET`, SMTP, Twilio (WhatsApp), VAPID (push), `BLOB_READ_WRITE_TOKEN`
and `APP_URL`. `.env` is gitignored and must stay that way.

**Local development runs against a clone of production, never production.**
`scripts/dev-clone-prod.ts` builds the clone; `.env.local` points
`DATABASE_URL` / `DATABASE_URL_UNPOOLED` at it and carries a dev-only
`CRON_SECRET`. Every rig and probe is run with
`npx tsx --env-file=.env.local …`.

## Scripts

| Command | What it does |
|---|---|
| `npm run tokens` | Fails on dangling `var(--x)` or alpha modifiers on tokens |
| `npm run contrast` | WCAG audit of every colour pair the app actually uses |
| `npm run jargon` | Greps the UI for banned words; exits 1 on a hit |
| `npm run overlays` | Opens every sheet and drawer at 390 / 768 / 1440; fails if any lands off-screen |
| `npm run perm-matrix` | Role × action matrix against the running dev server |
| `npm run flows` | Flows F1–F5 end to end (task given → review meeting → tomorrow message → reply → reschedule → outcome) |
| `npm run screens` / `npm run matrix` | Playwright captures of every route and role |
| `npm run integrity` | Fingerprints every real task (both hashes); appends to the ledger |

Run directly with `npx tsx --env-file=.env.local`: `scripts/check-*.ts` (the
regression probes), `scripts/restructure-dump.ts` and
`scripts/restructure-dryrun.ts` (evidence and a rolled-back rehearsal of the
migration), `scripts/promote-founder.ts <email>`,
`scripts/integrity-diff.ts`.

## Working rules

These exist because each one was learned the hard way.

- **Production is untouched until the owner says "apply to prod".** Build and
  prove on the clone; the runbook does the rest.
- **Snapshot integrity before and after.** A matching row count proves
  nothing; a rig once drove real completion clicks against live data and row
  counts did not notice. Diff the fields, both hashes.
- **Evidence before repair, always.** Dump the affected rows first, then fix,
  then report. Never repair over the evidence.
- **The rig never touches real projects.** Throwaway rows carry an `RS-` /
  `permtest-` / `FL-` prefix and are deleted by the script that made them.
- **Never use PowerShell `Set-Content` / `Out-File` on source or `.env`.** It
  mangles UTF-8 and once wrote a BOM that stopped Prisma from starting.
- **Run `npm run build` last.** It clobbers `.next` under a running dev server.
- **Grep proofs must match both class names and raw `var(--token)`.**
- **No parallel lists of one set.** One `as const` array per set; derive the
  type and the zod enum from it. Where two must live apart, enforce the match
  with a compile-time assertion.
- **Never rewrite a shared ref.** A pushed tag is frozen; later work gets a
  new tag.
- **Records of truth live in version control.** The integrity ledger, the
  verdicts and the snapshots are in `records/`, never in capture output.
- **Snapshots are evidence, not capture output.** They must survive
  `clean:shots`.
- **Review what you stage. Never `git add -A` blind.** Stage by explicit path
  and check `git diff --cached --name-status` for deletions first.
- **Identity gets its own line below `sm`.** Controls wrap underneath a title;
  the title never truncates to nothing.
- **Overlays are measured, not assumed.** `position: fixed` resolves against
  the nearest ancestor with a transform, filter or backdrop-filter.
  `npm run overlays` opens every one and fails if any lands outside.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Prisma + PostgreSQL ·
TanStack Query · dnd-kit · Framer Motion · fractional-indexing · jose · zod ·
nodemailer · Twilio (WhatsApp) · web-push · Vercel Blob

## Deploying

Vercel, with Postgres on Neon. The app lives at the repository root.
Environment variables go under Settings → Environment Variables; the crons in
`vercel.json` need `CRON_SECRET`.
