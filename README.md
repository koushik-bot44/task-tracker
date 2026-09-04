# Orbit

A task tracker for SGROUP automation tools. Tracks what shipped, what is in
flight, and what is next — one shared source of truth across desktop and phone.

The product specification lives in [TRACKER_PRODUCT.md](TRACKER_PRODUCT.md).
This file is the engineering record: what is built, why it is built that way,
and which rules exist because something went wrong.

**Doc v6 — Phase 5 (three roles, assignees, dates, manager dashboards).**

## Status

| | |
|---|---|
| Build | passing |
| Types | clean |
| Lint | clean |
| Contrast audit | 45/45 pairs pass |
| Token audit | no dangling refs, no alpha modifiers |
| Parser tests | 21 pass |
| Overlay geometry | 6/6 inside the viewport |
| Permission matrix | 35/35 pass |
| Tooltip edge proof | 12 probes pass |

Phases 1–4 (foundation, views, roles, polish), Phase R (redesign) and Phase 5
(team structure + manager dashboards) are complete and deployed.

## The model

Two orthogonal axes of "done", and keeping them separate is the whole point:

- **Status** — where the work stands: `Backlog → Planned → In progress →
  On hold → Blocked → Done`, plus `Cancelled`. One answer at a time.
- **Gates** — how finished "done" really is: Built, Reviewed, Tested, Deployed,
  Verified. A task can be in progress with one ticked, or done with two open.

`Reviewed` is manager-only. Completed work waits in the manager's Review queue
until it is signed off.

Tools hold tasks; tasks nest without limit. Ordering is a fractional index, so
a reorder or a reparent writes exactly one row.

## Roles

`MANAGER`, `TEAM_LEAD` and `DEVELOPER`. Managers create tools, sign off review
and manage accounts; leads own delivery inside a tool and assign anyone;
developers do the work and claim what is unassigned. The full matrix is in
TRACKER_PRODUCT.md. Permission is enforced per request on the
server — `requireUser()` re-loads the user every time, so disabling an account
takes effect on the next request rather than when its token expires.

Passwords are scrypt (N=16384, r=8, p=1). Sessions are a jose HS256 JWT in an
httpOnly cookie. Failed sign-ins are rate-limited in the database (8 per 60s,
IP hashed with `AUTH_SECRET`).

## Design system

Light only. The dark theme was removed in Phase R — maintaining two palettes
bought nothing the owner wanted.

Every hue ships twice: a vivid value for fills and dots, and a darker `-ink`
value for text. Fills need 3:1, text needs 4.5:1, and one colour cannot do
both jobs. `--on-primary` / `--on-fill` label solid fills.

Rules that are load-bearing:

- **Colours come from CSS variables.** Zero hex literals in components. The one
  exception is `lib/tool-colors.ts`, which is per-tool user data, not theme.
- **Chips are soft fills, not outlines.** `bg = hue-soft`, `text = hue-ink`, no
  border. Borders survive only where they mean something: inputs, checkboxes,
  drop targets, focus rings.
- **Shadows do separation, not borders.**
- **Never use an alpha modifier on a token colour.** `bg-muted/45` compiles to
  *nothing* — Tailwind cannot inject an alpha channel into a variable holding a
  hex string, so the class is silently dropped. Nineteen of these shipped at
  once and one of them made the gate dots invisible. Translucency gets its own
  token (`--scrim`, `--dot-off`). `npm run tokens` fails the build on this.
- **No `matchMedia` layout branching.** Responsive behaviour is CSS.
- Motion: interaction feedback 150–250ms ease-out, no bounce. Data reveals
  (rings, odometers, sparklines) may run to 750ms. Everything is guarded by
  `prefers-reduced-motion`.

## Keyboard

| Key | Action |
|---|---|
| `Enter` | New sibling below |
| `Tab` / `Shift+Tab` | Indent / outdent |
| `Alt+↑` / `Alt+↓` | Reorder within siblings |
| `↑` / `↓` | Move focus between rows |
| `←` / `→` | Collapse / expand (when the caret is at the edge of the title) |
| `Ctrl/Cmd+Enter` | Toggle done |
| `Backspace` | Delete an empty row |
| `Ctrl/Cmd+K` | Search, jump, or add from anywhere |
| `?` | Help sheet |

## Setup

```bash
npm install
cp .env.example .env      # then fill in the values
npx prisma migrate deploy
npm run dev
```

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | 32+ random characters, signs the session cookie |
| `SCREEN_EMAIL` / `SCREEN_PASSWORD` | Screenshot rig only; never in production |

`.env` is gitignored and must stay that way.

The first run bootstraps the first manager account. There are no passcodes and
no shared logins — that was Phase 1 and it is gone.

## Scripts

| Command | What it does |
|---|---|
| `npm run tokens` | Fails on dangling `var(--x)` or alpha modifiers on tokens |
| `npm run contrast` | WCAG audit of every colour pair the app actually uses |
| `npm run test:parser` | Quick-add parser checks |
| `npm run integrity` | Fingerprints every real task; appends to the ledger |
| `npm run screens` | Playwright matrix, 12 routes × 2 viewports |
| `npm run matrix` | Phase-5 precision matrix, 18 screens × 2 viewports, one home per role |
| `npm run tooltips` | Opens tooltips at the worst anchors; fails on clipping or overlap |
| `npm run overlays` | Opens every fixed overlay at both viewports; fails if any is off-screen |
| `npm run panel-writes` | Counts the PATCHes the detail panel sends while typing |
| `npm run clean:shots` | Clears disposable capture output (never touches `records/`) |

`scripts/integrity-diff.ts` names every changed field between two snapshots.
`scripts/untitled.ts` reports blank task stubs and refuses to delete past 15.

## Working rules

These exist because each one was learned the hard way.

- **Check the branch before starting.** Work once landed on `redesign` on top of
  an unrelated commit because nobody looked.
- **Snapshot integrity before and after.** A matching row count proves nothing;
  a screenshot rig once drove real completion clicks and drags against live
  data, and row counts did not notice. Diff the fields.
- **Evidence before repair, always.** Dump the affected rows to JSON first, then
  fix, then report. Never repair over the evidence.
- **The rig never touches real projects.** Every mutating gesture asserts both
  that the URL is `/t/rig-sandbox` and that the row title starts with `RS-`.
  `scripts/motion.ts` proves the guard fires before it trusts it.
- **Never use PowerShell `Set-Content` / `Out-File` on source or `.env`.** It
  mangles UTF-8 and once wrote a BOM that stopped Prisma from starting. Use
  node/`fs` or git.
- **Run `npm run build` last.** It clobbers `.next` under a running dev server,
  which then silently moves to port 3001.
- **Grep proofs must match both class names and raw `var(--token)`.** Checking
  only one is how four dead tokens reached production.
- **No parallel lists of one set.** A set written out twice will eventually
  disagree with itself. TEAM_LEAD was added to a union and not to a
  hand-written runtime allowlist, and every team lead got 401 at sign-in — the
  role existed in the type system and nowhere else. One `as const` array per
  set; derive the type from it and derive the zod enum from it. Where two must
  live apart (auth pulls in jose and cannot reach a client bundle), enforce the
  match with a compile-time assertion.
- **Tooltips must be measured, not assumed.** Placement is clamped inside the
  viewport and flipped or slid away from anything marked
  `[data-tooltip-obstacle]`. `npm run tooltips` proves it at the worst anchors;
  it also caught that a 999px radius turns a multi-line bubble into an ellipse.
- **Fills take the vivid hue, text takes `-ink`.** Applying that backwards made
  BACKLOG the heaviest wedge on every chart, so an untouched tool looked like a
  failing one.
- **Never rewrite a shared ref.** A pushed tag is frozen. `phase-5` marks where
  phase 5 first closed; later work gets a new tag, not a moved one.
- **Records of truth live in version control.** The integrity ledger, the review
  verdicts and the snapshots are in `records/`, never in `screenshots/`. The
  ledger was destroyed once by a routine clear of capture output — it was
  gitignored, so it was gone for good.
- **Snapshots are evidence, not capture output.** They must survive
  `clean:shots`; otherwise the first time a hash moves there is nothing left to
  diff against, and attribution becomes guesswork.
- **Review what you stage. Never `git add -A` blind.** Stage by explicit path
  and check `git diff --cached --name-status` for deletions first. A blind
  `add -A` once committed the deletion of a tracking record without anyone
  noticing.
- **Identity gets its own line below `sm`.** A title beside `shrink-0` controls
  is the only thing that can give, so it truncates to nothing. Raising its
  min-width just hands the space to the next element — this recurred five times
  before being fixed structurally. Controls wrap underneath.
- **Overlays are measured, not assumed.** `position: fixed` resolves against the
  nearest ancestor with a transform, filter or **backdrop-filter** — the app bar
  has one — and Framer's inline transform beats a Tailwind `-translate-x-1/2`.
  Three overlays shipped mispositioned for those two reasons. `npm run overlays`
  opens every one at both viewports and fails if any lands outside.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Prisma + PostgreSQL ·
TanStack Query · dnd-kit · Framer Motion · fractional-indexing · jose · zod ·
cmdk · react-markdown

## Deploying

Vercel, with Postgres on Neon from the project's Storage tab. The app lives at
the repository root, so the default Root Directory is correct. Environment
variables go under Settings → Environment Variables.
