# Phase 5 review pass — per-screen verdicts

Captured against the owner's seeded data: Skyzen Webhooks and Recruiter
Dashboard have `sudeep` as lead, IHRMS does not, no tool has a description,
6 tasks have dates, none have assignees, 2 project notes exist. No rig
sandbox — these are the real states the owner will see.

Order is worst-risk-first. Rows were written as each screen was opened, so
this file is honest about coverage rather than retrospective.

Status: `pass` · `fixed:<what>` · `UNREVIEWED`.

| # | Screen | 1440×900 | 390×844 |
|---|---|---|---|
| — | **Reshot (passed in batch 2)** | | |
| 02 | home-manager | UNREVIEWED (reshot) | UNREVIEWED (reshot) |
| 03 | home-lead | UNREVIEWED (reshot) | UNREVIEWED (reshot) |
| 04 | home-developer | UNREVIEWED (reshot) | UNREVIEWED (reshot) |
| 05 | tool-overview | UNREVIEWED (reshot) | UNREVIEWED (reshot) |
| — | **Tier 1 — data-dense** | | |
| 06 | tool-overview-filtered | **fixed**: dimmed donut invisible at 0.2 | UNREVIEWED |
| 10 | board | **fixed**: "Unassigned" on all 14 cards | **fixed**: same + name truncated |
| 07 | tree | UNREVIEWED | **fixed**: "Skyzen Web…" truncated |
| 08 | tree-panel | UNREVIEWED | **pass** |
| — | **Tier 2 — manager/lead-facing** | | |
| 16 | about-panel | **pass** (after fix) | **fixed**: claimed "No lead assigned" |
| 17 | tool-create-modal | UNREVIEWED | UNREVIEWED |
| 13 | review | UNREVIEWED | **fixed**: titles truncated |
| 12 | changelog | UNREVIEWED | UNREVIEWED |
| 11 | focus | UNREVIEWED | UNREVIEWED |
| — | **Tier 3 — settings / utility** | | |
| 14 | settings-users | UNREVIEWED | **fixed**: row collapse, chips overlapping |
| 15 | settings-account | UNREVIEWED | UNREVIEWED |
| 09 | tree-palette | UNREVIEWED | UNREVIEWED |
| 18 | help | UNREVIEWED | UNREVIEWED |
| — | **Not in the matrix** | | |
| 01 | login | UNREVIEWED | UNREVIEWED |

**Reviewed: 9 of 36 images. Stopped at Tier 3 / settings-users.** The
unreviewed remainder is the bottom of the risk order plus the four screens
that passed in batch 2 and were only reshot, not re-read.

## Defects found, worst first — all fixed

1. **People page unusable at 390** (`14`). Four `shrink-0` controls sat beside
   the identity block, leaving it ~60px: names rendered `test…`, `sud…`, and
   the role chip overlapped the status chip because it cannot shrink. Identity
   now takes the whole line; controls wrap beneath.
2. **Review titles truncated at 390** (`13`). `No link added` — a placeholder
   that says nothing — kept full width while `Signature verificati…` did not.
3. **"Unassigned" on every board card** (`10`). Fourteen cards each carrying a
   chip whose only content was the word "Unassigned". Batch 2 deliberately kept
   the explicit slot here, reasoning that a card exists to answer "whose is
   this"; against real data where nothing is assigned, it was the same wall
   removed from the tree. Now hidden when empty, matching the tree.
4. **About panel claimed "No lead assigned" for a tool that has one** (`16`).
   The select fell back to its placeholder while the user list loaded — a
   loading state that stated something false instead of looking unfinished.
   The assigned lead is now always an option.
5. **Tool name truncated at 390** (`07`, `10`). Third and fourth recurrence.
   Fixed structurally this time: the name takes its own line below `sm` rather
   than being given a bigger floor for the next element to eat.
6. **Dimmed donut segments invisible** (`06`). At 0.2 the ring vanished while a
   filter was on, so the chart stopped showing proportion exactly when you were
   studying one slice of it. 0.32.

## The recurring shape

Five of the six defects are one bug: **a flexible identity element beside
`shrink-0` controls**. Each previous fix removed one competitor — the task
count, then the lead chip, then the third switcher tab — and the next element
took the space. The rule now applied: *identity gets its own line below `sm`;
controls wrap under it.* Applied to the tool header, the Overview heading, the
People row and the Review row.

`changelog` is safe by construction — its right-hand columns are
`hidden sm:inline`, so they take no space at 390.

## Specific re-checks (defects that shipped in batch 2)

1. **Chart fills.** `BACKLOG` is `--chart-idle` and `CANCELLED` is `--line` in
   both the donut and `STATUS_FILL`; idle is never the heaviest hue. Sweeping
   all four charts found one straggler — the workload bar drew its *done* half
   with `bg-ok-ink` while its *open* half used `bg-primary`, so one bar mixed
   the text value and the fill value. Now `bg-ok`. Legend dots keep `-ink`.
2. **390 truncation.** Hunted on every titled surface; found and fixed on the
   tool header, the Overview heading, the People row and the Review row. Five
   instances of one shape (see above).
3. **Tooltips at edges.** `npm run tooltips` — 12 probes, 6 anchors × 2
   viewports, all on-screen and clear of obstacles. The script now accepts
   either credential pair; it previously died with a module-load stack trace
   after close-out stripped `SCREEN_*`, which hid what it actually wanted.


---

# Session 1 review pass (owner-directed) — `69812e2` onward

Records moved to `records/` after the previous ledger was destroyed by a
`screenshots/` clean. `npm run clean:shots` now runs before every matrix so
capture folders stop accumulating; nothing of record lives in there.

## Owner-reported (step 1) — all fixed, both viewports

| Ref | Before | After | Capture |
|---|---|---|---|
| R1 | Row text not on one edge; dot inline, shifting the content edge | Three-column grid: fixed 0.75rem dot gutter, one content edge for all three lines | `screenshots/pair/review--*.png` |
| R2 | Action cluster wrapped to two lines, not centred as a unit | One line, 17.5rem slot, nowrap, vertically centred | same |
| R3 | "Needs review" = 2 lines + button; "Recently reviewed" = 3 lines, no action. Different heights and right edges | Identical structure; action slot same width; `Mark reviewed` vs `Reviewed ✓ <when>` | same |
| R4 | "No link added" competed with real content | Muted, normal weight, dimmed; real deliverable keeps the tinted link in the same slot | same |
| F1 | *Reported as* misaligned baselines. Probe showed 0px spread already — the real cause was rows differing 44px vs 45px | Fixed 48px rows; probe: 0px spread, one height per section | `screenshots/pair/focus--*.png` |
| F2 | Overdue pill read as a loud block | `font-semibold` → `font-medium`; recipe unchanged, still red-family | same |
| F3 | Empty section box height differed from a row | Empty panel matches the 48px row box | same |

`scripts/align-check.ts` measures element centres and row heights, so F1
cannot silently regress.

## Step 2 — continued review

| # | Screen | 1440×900 | 390×844 |
|---|---|---|---|
| 07 | tree | **fixed**: finished tasks still showed a "No date" nag | UNREVIEWED |
| 08 | tree-panel | UNREVIEWED | UNREVIEWED |
| 10 | board | UNREVIEWED | UNREVIEWED |
| 06 | overview-filtered | UNREVIEWED | UNREVIEWED |
| 05 | tool-overview | UNREVIEWED | UNREVIEWED |

**Stopped after tree (1440).** Step 2 is largely unreviewed; the remainder is
the bottom of this session's risk order.


---

# Session 2 review pass — `77e34bf` onward

**The brief's premise did not hold.** It asked for these screens "in their
SEEDED/populated state (owner has real leads, dates, assignees)". The database
had 2 leads and 7 dates but **0 assignees, 0 provisional dates, 0 ON_HOLD and
no descriptions** — so the workload bars, the assignee filter, the provisional
pill and the On hold column could not be judged from real data at all.

Reviewed both: the real tools as they actually stand, and a disposable
`SS- Shot Sandbox` built to carry every state the dashboards can render
(overdue / at-risk / provisional / undated, all seven statuses, three
assignees plus unassigned, nested children, a deliberately over-long title).
Torn down at the end.

| # | Screen | 1440×900 | 390×844 |
|---|---|---|---|
| 05 | tool-overview | **fixed**: root rows changed height with/without a subtask line | **fixed**: colour dot orphaned above the title |
| 10 | board | **fixed**: `ml-auto` avatar orphaned onto its own line when chips wrapped | **pass** |
| 06 | overview-filtered | **pass** — incl. status × assignee combined (`06b-filter-combo`) | **pass** |
| 07 | tree | **pass** | **fixed**: same orphaned dot, in the tool header |
| 08 | tree-panel | **pass** | **fixed**: long title sheared mid-word at the panel edge |

Captures: `screenshots/matrix/{05,06,06b,07,08,10}-*--{1440x900,390x844}.png`

## Defects found → fixed, worst first

1. **Root rows stepped in height** on Tool Overview depending on whether a task
   had subtasks — the session-1 pattern recurring. Fixed row height; contents
   no longer set it.
2. **Board avatar orphaning.** `ml-auto` looked tidy when a card's chips fit one
   line; on a 16rem card they wrap, and the avatar was stranded on a line of its
   own, making that card a row taller than its neighbours. Now flows inline.
3. **Orphaned colour dot** on every tool page at 390 — a lone dot hovering above
   the tool name. It was a sibling of a name that goes full-width on mobile.
   Moved inside the heading line, in both the tool header and the Overview.
4. **Panel title sheared mid-word** at the panel edge with no ellipsis. `truncate`
   + `size={1}`.

## Specific re-checks

- **Chart legibility, populated.** All seven statuses render in the donut with
  distinct, legible tints; `BACKLOG`/`CANCELLED` remain `--chart-idle`/`--line`
  and are never the heaviest wedge. The workload two-value straggler did **not**
  recur — `done` is `bg-ok` and `open` is `bg-primary`, both fill values.
- **Date-pill states together.** Overdue (`4d late`), at-risk (`Sat`,
  `Tomorrow`), comfortable (`13 Aug`) and provisional (`~1 Aug`, dashed) all
  visible in one view and distinguishable.
- **390 identity truncation.** No instance found where identity lost to a
  `shrink-0` sibling. Tree rows do truncate long titles, correctly — that is a
  dense outline with the full remaining width, not the structural bug. (Several
  sandbox rows read alike because the fixture names children
  `<parent> — step N`; that is a fixture artefact, not a product defect.)


---

# Session 3 (final) — complete table, `3b49e30` onward

All 18 screens × 2 viewports read. Populated via a disposable `SS- Shot Sandbox`
where full state was needed (all 7 statuses, overdue / at-risk / provisional /
undated, three assignees plus unassigned, nesting, an over-long title); torn
down with count proof.

| # | Screen | 1440×900 | 390×844 |
|---|---|---|---|
| 01 | login | pass | pass |
| 02 | home-manager | pass | pass |
| 03 | home-lead | pass | pass |
| 04 | home-developer | pass | pass |
| 05 | tool-overview | **fixed** (s2: row heights) | **fixed** (s2: orphaned dot) |
| 06 | tool-overview-filtered | pass, incl. status × assignee | pass |
| 07 | tree | **fixed** (s1: "No date" on done rows) | **fixed** (s2: orphaned dot) |
| 08 | tree-panel | pass | **fixed** (s2: title sheared) |
| 09 | tree-palette | **fixed** (s3: centring) | **fixed** (s3: ran off right edge) |
| 10 | board | **fixed** (s2: avatar orphaning) | pass |
| 11 | focus | **fixed** (s1: row heights, pill weight) | **fixed** (s1) |
| 12 | changelog | **fixed** (s3: row heights) | **fixed** (s3) |
| 13 | review | **fixed** (s1: R1–R4) | **fixed** (s1: R1–R4) |
| 14 | settings-users | pass | **fixed** (earlier: row collapse) |
| 15 | settings-account | pass | pass |
| 16 | about-panel | pass | **fixed** (earlier: false "No lead assigned") |
| 17 | tool-create-modal | pass | pass |
| 18 | help | **fixed** (s3: header off-screen) | **fixed** (s3: header off-screen) |

**36/36 green.**

## Session 3 defects

1. **Help sheet header off-screen at BOTH viewports.** `position: fixed`
   resolves against the nearest ancestor with a **backdrop-filter**, and the app
   bar has `backdrop-blur-md` — so `fixed inset-0` was the 64px header, not the
   viewport. Measured top −191px at 390 and −174px at 1440, i.e.
   `(64 − height) / 2` exactly. Portalled to the body.
2. **Command palette ran off the right edge at 390.** `left-1/2` with
   `-translate-x-1/2`, and Framer's inline transform beat the class — third
   instance of that bug and the only one never measured. Centring moved to a
   wrapper.
3. **Changelog row heights** varied with/without an ancestor path — same defect
   already fixed on Review, Focus and the Tool Overview.

`npm run overlays` opens every fixed overlay at both viewports and fails if any
lands outside — 6/6 pass. Each of these had previously been found only because
somebody happened to look at that one screen.

## Incident — rig damaged real data, repaired

`scripts/perm-matrix.ts` ran its tool-edit cases against `projects[0]` from an
**unordered** `findMany`, then "cleaned up" by setting that project's `leadId`
to **null** rather than restoring what was there. On this run `projects[0]` was
`anvi-careers` — a tool the owner had created with a lead — so the cleanup
silently wiped a real assignment.

- Caught by the **widened** integrity hash: the task hash held byte-for-byte
  while the full hash moved. The six-field fingerprint would have reported all
  clear.
- Evidence dumped before any write:
  `records/snapshots/evidence-leadwipe-2026-07-22T20-56-44-663Z.json`
- Repaired via `scripts/repair-lead.ts` (dry-run first). `sudeep@gmail.com` is
  the only TEAM_LEAD and tool creation *requires* an active one, so the original
  value was not a guess.
- Full hash returned to **`b18508af`**, byte-identical to session start —
  the strongest available proof the repair is exact.
- Root cause fixed: the matrix now creates and deletes **its own** project and
  never touches a real one. Re-run: 35/35, leads intact.

---

# Phase 6 — precision loop (subtask %, lead onboarding, manager rail)

Captured by `scripts/phase6-shots.ts`: 14 screens × {1440×900, 390×844},
each feature photographed in **every state that renders differently** — a
single shot per screen would prove one branch and miss the other. Read-only
except for one Edit click, which is client state and writes nothing.

## Tree — `01`/`02` (manager), `03` (lead), `04` (developer)

- **PASS** Manager read-only vs editing is unambiguous: read-only offers
  **Edit** and hides the New-task block; editing shows the amber **Editing**
  chip, **Done**, and the New-task affordance. Same at 390.
- **PASS** Lead and developer land editable — no Edit button, New-task block
  present. The rail costs no other role anything.
- **PASS** Percentage chip renders **only on parents** (33%, 50%); leaves carry
  no chip. Below `sm` the two-tone track drops and the number stays — still
  legible at depth. No horizontal scroll at 390; titles truncate with ellipsis
  and meta wraps to a second line.

## Board — `05`/`06` (manager), `07` (lead)

- **PASS** Read-only hides every column's **+** add button; editing restores
  them alongside the Editing/Done state. Lead sees the + buttons (editable).
- **PASS** Percentage chip on parent cards (50%) with a `N subtasks` count;
  leaf cards carry neither. Numbers match the tree — same `leafProgressByTask`.

## Detail panel — `08` (manager read-only), `09` (manager editing), `10` (developer)

- **PASS** Read-only shows the `Eye` banner ("Choose Edit in the tool header")
  and every field disabled; the date field has no picker affordance.
- **PASS** Editing removes the banner, the date field gains its native picker,
  gates and description controls are live. Developer lands here directly.
- Note: reaching the editable panel needs the rail lifted **then** the panel
  opened in the same page context — a fresh `?task=` goto resets the
  per-session rail and sits the sheet over the header's Edit button. The shot
  script does exactly that; a first attempt photographed two identical
  read-only panels and was corrected.

## People — `11` (manager), `12`/`13` (lead)

- **PASS** Manager gets the full desk: per-row role select, Reset password,
  Disable (self-Disable greyed). Lead gets a **Developer-locked** add form, no
  per-row admin controls, a "manager's call" blurb, and no Review in the nav.
- **PASS** The lead add form's role field offers only Developer — the UI cannot
  even express creating a lead or manager, and the server rejects it regardless
  (perm matrix, below).

## Overview — `14`

- **PASS** Parent rows show the % chip with a filled track and a `N subtasks`
  expander. Donut, weekly bars and workload render; clean at 390.
- **Doc corrected, not the surface.** The Overview keeps its own flat progress
  column — every root row, leaf or parent, shows a bar (a leaf root reads 0% /
  100%), because a flat list wants a value in every row. This is reviewed
  phase-5 behaviour drawing on the **same** `leafProgress`, so the numbers
  agree with the chip. My first doc paragraph over-claimed "a leaf shows
  nothing" across all three surfaces; the doc now scopes that to tree + board
  and describes the Overview column honestly. No code change — regressing a
  reviewed surface to match a sentence would be the wrong fix.

---

# Phase 7 — PWA install + web push foundation (precision loop)

Captured by scripts/_pwa-shots.ts (+ _pwa-shots2.ts for the permission-gated
states). Screenshots are disposable (screenshots/pwa); this is the record.

Harness note: headless Chromium reports Notification.permission as **denied**,
never the first-run **default**, so the soft-ask (which correctly only shows on
"default") was captured with permission stubbed to "default" — the precondition
the real component checks, component unchanged. The recurring red "1 error"
toast in a few frames is a capture artifact: rapid goto→goto cancels an
in-flight TanStack query; a clean single-load probe logged zero console/network
errors. Not an app error, and no phase-7 code fetches on navigation.

## Install nudge — Android/desktop (04) & iOS (06)
- **PASS** Android variant (synthetic beforeinstallprompt): quiet bottom card,
  Orbit mark, "Install Orbit — Add it to your home screen for a full-screen app
  and alerts", Install + dismiss X. Drives the real prompt on click.
- **PASS** iOS variant (iPhone 13 emulation): "Add Orbit to your home screen —
  Tap Share, then Add to Home Screen" with the Share glyph. Correct, since iOS
  has no programmatic prompt.
- Both hidden once installed via the CSS `@media (display-mode: standalone)`
  rule — no JS matchMedia. Dismissal is localStorage-remembered.

## Notification soft-ask (01b) — 390
- **PASS** Appears in-context at the bottom (not a raw prompt on load): bell,
  "Get alerted about meetings & due tasks?", body, Enable, dismiss X. Shows only
  when permission is default AND the server has VAPID — so it never asks for
  something that cannot work yet.

## Settings / account — Notifications row (02b off, 05 blocked) — 390 & 1440
- **PASS** Off state: "Alerts on this device / Off / [Enable]".
- **PASS** Blocked state (05): "Blocked in your browser settings" and no enable
  button — nothing broken when the browser has denied.
- **PASS** No "not configured" note when VAPID is present → serverConfigured
  reached the client. Manager sees "Send test" when on (manager-gated endpoint).

## Offline fallback (07) — 390 & 1440
- **PASS** Branded Orbit mark, "You're offline — Orbit needs a connection… your
  work is safe", Try again. Served by the SW only when a navigation fails; safe
  -area padded.

## No regression, not installed (03/03b) — 390
- **PASS** Tree, header, sidebar, view switcher render exactly as before. The SW
  + manifest change nothing about the uninstalled app; the only addition is the
  dismissible bottom nudge, by design.

## Standalone mobile-feel (STEP D) — documented
- viewport-fit=cover + appleWebApp.statusBarStyle "default" are set; the detail
  bottom sheet already pads `env(safe-area-inset-bottom)`, and the nudges pad it
  too; the offline page pads top+bottom insets. Tap targets are the app's
  existing 44px (h-11 / hit-40). True standalone display-mode + real device
  insets cannot be emulated headless — verified by CSS/meta inspection; final
  on-device confirmation belongs to the owner after install.

## Endpoints (scripts/_push-endpoints.ts) — 11/11 PASS
- anon 401 on subscribe/test/delete; developer 403 on test (manager-gate);
  manager+configured+no-sub 409; subscribe upsert idempotent (one row); delete
  removes it. Live push DELIVERY is unverified — it needs the owner's VAPID and
  a real browser subscription.

---

# Phase 8 — Calendar + event notifications + Workload polish (precision loop)

Captured by scripts/_cal-shots.ts; screenshots disposable (screenshots/calendar).
Data: SHOT fixtures + ss-shot-sandbox, two scoped events + one global all-hands.

| Screen (viewport) | Verdict |
|---|---|
| Calendar month (1440) | PASS — Mon-first 6×7 grid; today (28) filled-blue; filled event chips (Sprint review, Broker migration, Company all-hands w/ Users mark); OUTLINE task chips carrying date-state colour + tool dot; overdue chips red-outline; provisional "~"; density "+1 more"; no cell overflow. |
| Project filter (1440/390) | PASS — All-tools + per-tool colour chips + All-hands toggle; wraps cleanly at 390; persisted to localStorage. |
| Day panel peek (1440) | PASS — right peek; Events section (filled cards, tool dot/all-hands) then Task dates grouped by tool; manager "+ Event". |
| Event detail (1440) | PASS — title, 15/07/2026 (DD/MM/YYYY), project tag, description, "Created by … · 28/07/2026", manager Edit; back arrow. |
| Event modal (1440) | PASS — centred; Title/Details/Date/For(All-hands+tools); Create disabled until title+date; edit adds Delete. |
| Bell populated (390, lead) | PASS — red "2" badge (the two scoped events reached the lead); dropdown newest-first, unread tint, Mark all read; opens at the right edge with max-width calc → no clip. |
| Bell empty (1440, manager=creator) | PASS — creator excluded from their own event's notifications → "You're all caught up." |
| Agenda + month strip (mobile) | PASS — NO 42-cell grid; horizontal day strip (dots on days with items) + agenda list of days-with-items; the primary mobile view. |
| Settings Notifications line | PASS — "The in-app bell is always on for everyone. Push is the optional layer…". |
| Workload populated (1440) | PASS — "4 of 7 done" labels; calm --chart-done/--chart-open fills (quieter, still legible); matching legend. |
| Workload empty (1440) | PASS — "No one assigned yet — assign tasks to see workload." instead of a lone Unassigned bar. |

Overlay edge-proofs: the bell dropdown (top-right corner) and the day panel (right peek) both sit hard against the right edge and render fully — width is `min(22rem, 100vw-…)`, so nothing clips. The event modal is flex-centred (the Framer-transform trap avoided). `npm run overlays` (existing fixed overlays) stays 6/6.

Notification flow, end to end: two scoped (sandbox) events created via the API produced 4 Notification rows for the sandbox lead + assignees (creator excluded), the lead's bell showed 2 unread, and no real user or device was touched (scoped to fixtures; global all-hands created via prisma without notify to avoid pushing the owner). Recipient scoping proven separately by scripts/notify-scope.ts (10/10).

---

# Phase 9 — Email notifications (SMTP) for meetings + task-due (precision loop)

Templates rendered via Playwright setContent (scripts/_email-shots.ts); screenshots
disposable (screenshots/email).

| Screen | Verdict |
|---|---|
| Email: event_new (rendered) | PASS — Orbit mark, title heading, description blurb, When/For/Organiser rows (15 Aug 2026 IST · Skyzen Webhooks · Priya Raman), "Open the calendar" button, opt-out footer. Inline styles only (email-safe); reads cleanly, link works. Subject "New meeting: Sprint review — 15 Aug 2026". |
| Email: task_due (rendered) | PASS — "Due today: <title>", Tool/Status rows, "Open the task" button → /t/<slug>?task=<id>, opt-out footer. Subject "Task due today: <title>". |
| Settings Email toggle — on (1440) | PASS — "Email alerts / Meeting and task-due emails to <email>. Push and the in-app bell are separate." switch ON (primary). |
| Settings Email toggle — off (1440) | PASS — switch OFF (line); flip persists via PATCH /api/users/me (optimistic + refetch). The standing "in-app bell always on; push and email optional" line updated. |

No new app-page overlays this phase. The settings row matches the phase-7/8
Notifications card design. Email colours are intentional inline hex (email
clients strip CSS vars) — flagged, not a token regression.

Email scoping + dedupe (scripts/email-scope.ts, 8/8): meeting emails reach the
opted-in scoped set (opted-out dev2 gets bell/push but NOT email; creator
excluded); task-due reaches assignee + tool lead with opt-in respected; a
reserved dedupeKey makes a second send SKIP with no extra EmailLog row.
Permission matrix 61/61 (prior 56 + dev/lead email-test 403, manager 503 when
SMTP unset, cron 401 on missing/wrong CRON_SECRET).

---

# Phase 10 — Email invite (set-password onboarding) precision loop

Screens captured by scripts/_invite-shots.ts (screenshots/invite, disposable).

| Screen (1440 + 390) | Verdict |
|---|---|
| Invite email (rendered) | PASS — "Jordan Lee, welcome to Orbit", inviter + role rows, "Set your password" button, "expires in 72 hours" note, ignore-if-unexpected footer (no opt-out line — invitee has no account). Inline styles only. |
| People — Invite form | PASS — "Invite someone" + hint "they get an email… stays pending until they do"; name/email/role/Add. No temp-password reveal on create. |
| People — list | PASS — active users show Active + Reset/Disable; pending users show a muted "Invited · pending" chip + Resend invite + Cancel. Identity keeps its own line; no truncation. |
| Set-password — valid (390) | PASS — Orbit mark, email + role read-only, password + confirm, "Set password & sign in". Single clean card at 390. |
| Set-password — expired | PASS — "This invite has expired… ask your manager to send a fresh one" + Go to sign-in. |
| Set-password — consumed | PASS — "This invite was already used… your account is set up" + Go to sign-in. |
| Set-password — unknown | PASS — "This link isn't valid… double-check the link" + Go to sign-in. |

Tests: invite-lifecycle 14/14 (create pending → validate → accept → ACTIVE +
signed-in → single-use → reuse 410; resend rotates the token, old one dead;
expired 410; pending login non-disclosed 401; existing ACTIVE user still logs in
after the migration). Permission matrix 69/69 (+ lead-invites-developer 201 /
manager+lead 403, resend scope-gated, cancel manager+pending-only, active-user
resend/delete 409). Pending users filtered from assignee + lead pickers (STEP D).

## Phase 15 — private space, group colour, no strike (2026-07-30)

Rendered against the real compiled UI (Playwright, dev server), 1440 + 390.

- **My Space (dev)** — nav item visible to a DEVELOPER; header + "New label"; label section "Trip planning" with colour dot, count, delete. PASS.
- **Group band + nesting override** — a SKY band spans the parent "Book the whole trip" and its subtree; an inner AMBER band on "Packing" overrides within its own subtree; the loose root has no band. Reads as distinct groups at 1440 and 390. PASS.
- **Done = dim, NOT strike** — "Book flights" and "Chargers" show a green check + muted title, zero line-through, at both widths and in the detail subtask list, board card, focus, calendar chip, command centre. PASS (grep: 0 line-through app-wide).
- **Group-colour swatch** — detail panel "GROUP COLOUR" row: X + 8 tints, the task's tint ring-selected; sets/removes via patch. Overlay sits at the panel edge, no clipping. PASS.
- **Assignee hidden on private tasks** — a private root shows no ASSIGNEE field (inherently the owner's). PASS.
- **Contrast** — ink + muted on all 8 group tints ≥ 4.5 (61/61 pairs pass).

## Phase 16 — Departments (rename + department-first) (2026-07-30)

Rendered against the real compiled UI (Playwright, dev server), 1440 + 390.

- **Sidebar** — "Projects" heading with a Building2 "New department" action; departments top-level, each holding its nested projects (VZ16 Platform → 2, VZ16 Growth → 1) with colour dot + count. **No "Ungrouped" section** anywhere. Mobile drawer at 390 matches. PASS.
- **Home (portfolio)** — cards grouped under department headings ("VZ16 Platform 0% done", "VZ16 Growth 0% done"); no Ungrouped band. PASS.
- **Move-to-department submenu** — a project's ⋯ menu shows "Move to department ›" that expands in place to the caller's OTHER departments (current excluded), each with its colour dot, plus an inline "+ New department…". In-place expand can't render off the sidebar edge — no clipping at either width. PASS.
- **Department-first create** — the loose "Add a project" button is gone; the create modal is launched from a department (its ⋯ → "New project here") with the department pre-selected and required (no "None" option). PASS.
- **Delete department** — blocked while non-empty (client message + server 409); allowed when empty. PASS.
- **"folder" text** — grep of app/components/lib for /folder/ → 0. Contrast 61/61, tokens PASS.

## Phase 17 — Departments heading, Projects sub-label, members popover (2026-07-30)

Rendered against the real compiled UI (Playwright, dev server), 1440 + 390.

- **"Departments" section header** — the sidebar section that grouped departments now reads "Departments" (was "Projects"), both widths. PASS.
- **"Projects" sub-label** — under each expanded department, a small muted "Projects" label sits above the project rows (empty department shows a muted "No projects yet"), so the hierarchy reads Departments → department → Projects → rows. Light, not a second heading. PASS.
- **Members popover** — a subtle Users icon on each project row (shrink-0, name still wins the row); click opens a portalled popover: project name header, the TEAM LEAD first with a "Lead" marker, a divider, then the developer members (names only). No-lead → "No lead assigned"; no-dev → "No developers". PASS.
- **Edge-proofs** — opened on the bottom-most project row, the popover shifts UP to stay fully on-screen (no clip); it opens to the right of its icon and flips left when that would overflow. Escape / outside-click close it. PASS.
- **Identity line** — the Users icon does not squeeze project names (icons are shrink-0, name is flex-1 min-w-0). PASS. Contrast 61/61, tokens PASS.

## Phase 19 — Resizable + polished sidebar + projects toggle icon (2026-07-30)

Rendered against the real compiled UI (Playwright, dev server), 1440 + 390, across the three
sidebar widths (default 264 / min 220 / max 420). Stress data: a department with long project
names + varied health + task counts, exactly the layout that used to collide.

- **BUG — row collision fixed** — each project row is self-contained at EVERY width. The name is
  one truncating line; the health chip + "· N tasks" meta sit on a second line that never wraps into
  the name or the row below (health `min-w-0 truncate`, the `·` and count `shrink-0 whitespace-nowrap`);
  the members Users icon keeps its `shrink-0` slot. Verified: 264 ("VZ19 Recruiter Da…" / "Shipped · 6 tasks"),
  220 (health truncates to "Shi…" but "· 6 tasks" survives — still no bleed), 420 (names expand, the
  extra-long "…Integration Servi…" truncates with the icon still anchored). Root cause was a fixed
  `h-10` on the row Link that clipped ~48px of content; removed it so each row owns its height. PASS.
- **CHANGE 1 — resizable sidebar** — right-edge drag handle (desktop only): dragging widened the aside
  264 → 378px live and committed 378 to `localStorage["orbit:sidebarWidth"]`; restored on reload; clamped
  to [220, 420]; double-click resets to 264; col-resize cursor + hairline that warms to `--primary` on
  hover. Width driven by a ref during drag (no React thrash), state/localStorage committed on pointerup.
  Main content flexes; no horizontal scroll at any width. PASS.
- **CHANGE 2 — polish (tokens only)** — crisper active pill (current nav item at `font-semibold`, the rest
  `font-medium`); selected project name at `font-semibold`; department count at `font-medium` (clearer);
  comfortable project-row spacing (`space-y-1`). No color/hex changed, so contrast is untouched (61/61).
  Clean and uncluttered — no new decoration. PASS.
- **CHANGE 3 — projects toggle icon** — each department row now carries BOTH the › chevron AND a LayoutList
  glyph; clicking either toggles that department's project list (same per-department localStorage state).
  Tooltip "Show/Hide projects"; the glyph highlights `text-primary-ink` when open. Name still wins the row
  (truncates when needed). PASS.
- **Mobile (390)** — the drawer is unchanged and carries NO resize handle (the handle lives only in the
  `md:` aside); rows self-contained, no collision. PASS.
- **Members popover** — still portalled + edge-safe at every width (opens right, flips left near the edge,
  shifts up at the bottom). PASS. Contrast 61/61, tokens PASS, perm regression 55/55 unchanged.

## Phase 20 — Simplify the manager's task view (2026-07-30)

Rendered against the real compiled UI (Playwright, dev server), 1440 + 390, with a throwaway
project owned by a MANAGER, led by a TEAM_LEAD, with a DEVELOPER member, and a task carrying a
mixed gate set (Built✓ Reviewed✓ Tested Deployed Verified — 2/5), a deliverable link, a link, and
two tags. A per-ROLE presentation change only: no schema, no data, no endpoint change. Devs/leads
are untouched; the server's phase-11 gate-tick rule is unchanged.

- **MANAGER detail panel** — trimmed to essentials: title, status, priority, assignee, est.
  completion, colour, group colour, a standalone **VERIFIED** sign-off ("Mark verified" checkbox +
  "Your sign-off that this is done. The team's build gates aren't shown here."), then description,
  notes, actions, and the read-only subtask list. The build-gate checklist (Built/Reviewed/Tested/
  Deployed), the "Add a gate" input, the Deliverable link, the Links list, and Tags are all GONE.
  No empty gaps or dangling dividers — the sections flow cleanly. Same at 1440 and on the 390 bottom
  sheet. PASS.
- **MANAGER tree rows** — the gate cluster is replaced by a small **○ Verified** chip (amber ring
  while awaiting the manager's sign-off, amber-filled once signed off); tags are hidden too. The row
  reads: 50% · In progress · P1 · date · assignee · Verified · description-hint. No 2/5 cluster,
  no tag pills. PASS.
- **MANAGER board cards** — no gate dots at all; a card shows progress, priority, date, subtasks,
  assignee only. PASS.
- **DEVELOPER detail panel + tree (no regression)** — unchanged: full GATES (2/5) list with all
  five gates, the "Add a gate" input, Verified shown read-only ("Verified is the manager's sign-off
  — the rest are yours"), plus Deliverable link, Links, and Tags. The tree row keeps the full
  `2/5 ●●○○○` cluster and the `backend`/`urgent` tag pills. PASS.
- **TEAM_LEAD detail panel (no regression)** — identical full view to the developer (gates list +
  add-gate + Verified read-only + deliverable + links + tags). PASS.
- **Identity / layout** — removing sections never left a stray divider or blank block; the manager
  panel is shorter but complete. No identity-truncation introduced (the row's name column is
  unchanged; only trailing meta chips were dropped for managers). Contrast unaffected (no colour/hex
  changed — only role-conditional rendering + font-weight-free presentation).

## Phase 21 — Manager account powers + single-admin cap + event verify + calendar polish (2026-07-31)

Rendered against the real compiled UI (Playwright, dev server), 1440 + 390, with throwaway p21-/vz21-
actors (including a throwaway ADMIN — the real admin is never touched; admin count recorded before/after
and restored). DOM assertions in brackets.

- **People page as MANAGER** — the page now opens to a manager (nav link + no redirect); INVITE SOMEONE
  form present; the role picker offers **[Manager, Team lead, Developer] — no Admin** [asserted]. The
  admin account's row shows identity + status only: **no role picker, no reset, no disable, no delete**
  for a manager [admin-row buttons = [], selects = 0]. PASS.
- **People page as ADMIN** (throwaway) — role picker also **[Manager, Team lead, Developer], no
  create-admin** [asserted]; the admin's OWN row has its Disable control **disabled** (can't self-disable)
  [isDisabled = true]. PASS.
- **Calendar month grid (1440)** — polished: uppercase tracked weekday headers; **today (31)** is a soft
  primary-tinted cell with a filled-circle number; out-of-month AND in-month weekend cells recede to the
  page bg with muted numbers; **filled blue EVENT chips** (Sprint kickoff ○, All-hands 👥) read distinctly
  from **outline TASK chips** (project-color dot + date-state border); a clean **"+1 more" pill** on the
  overflow day. PASS.
- **Calendar agenda (mobile 390)** — grouped-by-day cards with **bold date headers + an item count**,
  scannable; same filled-event / outline-task chip language; horizontal date strip with presence dots.
  PASS.
- **Day panel (desktop drawer)** — header shows the formatted date + a **"N events · M task dates"
  subtitle**; Events section (filled buttons) then Task dates grouped by project; edge-safe right drawer,
  portalled. PASS.
- **Event chip vs task chip** — filled `bg-primary text-on-primary` vs outline `bg-surface` + dateState
  border; the distinction is crisp at compact (grid) and full (agenda/panel) sizes. PASS.
- **Motion** — month step re-mounts the grid/agenda and it fades+rises (0.22s ease-out); reduced-motion
  drops to the final frame. Day panel slide + chip hover/press unchanged-in-spirit. PASS.
- **Contrast / tokens** — no colour/hex added (dept colours stay inline `style`, the documented
  exception); every text-on-tint uses an existing checked pair. Contrast 61/61, tokens PASS.

## Phase 22 — Meetings tab (department → project → schedule + history, unified with the calendar) (2026-07-31)

Rendered against the real compiled UI (Playwright, dev server), 1440 + 390, throwaway vz22-/vzm-/mob-
actors; hard teardown (residue 0). Meetings ARE CalendarEvents (isMeeting) — one system.

- **Meetings home (dept cards)** — the manager's own departments as cards (colour chip, name, project
  count, "N upcoming" / "No upcoming meetings" badge); active nav pill with a CalendarClock glyph; a
  month-change-style fade+rise on the grid. PASS.
- **Department (project cards)** — breadcrumb "Meetings ▸ Dept"; each project card shows a **ProgressRing
  (the leaf rollup, reused — no parallel calc)** at 50%, the lead name, "N on the team", and an
  upcoming-meeting badge; drills into the project. PASS.
- **Project meeting view (Feature 3 history)** — full breadcrumb "Meetings ▸ Dept ▸ Project"; a "Schedule
  meeting" action; **UPCOMING (1)** shows the meeting card with date · 🕐 10:00–11:00 · the attendee names
  (VZ22 Lead, VZ22 Dev — the deselected member absent) · description · Edit; **PAST (0)**. Upcoming first,
  past below. PASS.
- **Schedule modal (Feature 2)** — centred, edge-safe dialog: title (defaulted "<Project> meeting"),
  date + start + optional end (end-before-start rejected inline), details, and an **ATTENDEES list with
  every candidate PRESELECTED** (Lead pill + Developer pills, "3 selected"); deselecting drops the count
  (min-1 enforced). Loads the lead + members + assigned devs. PASS.
- **Calendar unification (Feature 4)** — a meeting renders as a distinct **filled chip with a clock glyph
  + its start time** ("🕐 10:00 Sprint kickoff"), reading differently from a plain event and a task chip;
  the day panel shows the meeting's time + an attendee list; editing a meeting links to the Meetings tab.
  PASS.
- **Attendee-based visibility** — the deselected member does NOT see the meeting on their calendar (and
  is not notified); the selected attendee does. Verified via API. PASS.
- **Notify-exactly-selected** — scheduling with a member deselected notified EXACTLY the selected
  attendees (bell + email target), creator excluded; the deselected member got nothing. PASS.
- **Mobile 390** — home cards, project history, and the schedule modal all fit and stay edge-safe (the
  modal is a centred `min(34rem,94vw)` sheet); breadcrumb wraps cleanly. PASS.
- **Overlay / identity** — the schedule modal is portalled + centred (never clips at 390); long project
  and member names truncate (min-w-0), attendee names wrap. Contrast 61/61 (meeting chip = the checked
  primary pair; role pills = checked soft/hover pairs), tokens PASS.

## Phase 23 — Notification snooze (custom time, re-fires bell + push) (2026-08-04)

Rendered against the real compiled bell (Playwright, dev server) at 1440 + 390 with
seeded notifications; throwaway vz23- user, hard teardown (residue 0). Tokens only.

- **Bell dropdown + snooze action (1440)** — every notification row carries an
  alarm-clock Snooze control on the right, beside the unread dot / title / body /
  age; the badge reads 4 (the one pre-snoozed item is excluded from the count and
  the active list) and a "Snoozed (1)" section sits at the foot. PASS.
- **Custom date-time picker (1440)** — clicking Snooze expands an INLINE panel
  under the row ("SNOOZE UNTIL" + a datetime-local defaulted to +1h + Cancel /
  primary Snooze). Inline (not a nested floating layer) so it cannot clip. PASS.
- **Future validation / past rejected (1440)** — a past value (01-01-2020) shows
  "Pick a time in the future." and DISABLES the Snooze button; the server also
  rejects a past `until` with 400. PASS.
- **Snoozed (N) section + unsnooze (1440)** — the collapsible expands to list each
  snoozed item with "Until <local time>" and an Unsnooze action that clears it and
  returns it to the active list now. PASS.
- **Bell after snooze** — a snoozed item leaves the active list and the unread
  count immediately (verified in the lifecycle test); it reappears via unsnooze or
  the cron wake. PASS.
- **Mobile 390 — overlay edge-proof** — FIXED a real edge bug: the panel was
  `absolute right-0` anchored to the bell, which on mobile sits mid-header (help /
  role / avatar to its right), so the 352px panel overflowed the LEFT viewport
  edge and clipped content. Now the panel is viewport-anchored (`fixed right-3
  top-16 w-[calc(100vw-1.5rem)] max-w-sm`) below the header on mobile and keeps the
  exact `absolute right-0` desktop placement at md+. At 390 the panel + inline
  picker sit within symmetric ~12px margins, nothing clipped. PASS.
- **Identity truncation** — a long title ("Quarterly planning and roadmap
  alignment across every team") and long body both truncate to one line via
  min-w-0 + truncate; the Snooze control never gets pushed off the panel. PASS.
- **Contrast / tokens** — unread rows use primary-soft; the Snooze primary button
  is the on-primary pair; the picker error uses danger-ink; muted labels/timestamps
  throughout. tokens PASS, contrast swept (see close).

## Phase 24 — My Space as a full screen + developer "Prompt" (free-form task text) (2026-08-05)

Rendered against the real compiled UI (Playwright, dev server), 1440 + 390, throwaway
vz24- user with seeded private labels/tasks; hard teardown (residue 0). Tokens only.

- **My Space full screen (1440)** — was a narrow max-w-3xl column; now full-bleed
  (px-4 py-4 sm:px-8 sm:py-6) with a text-page-lg bold header + subtitle matching the
  other complete screens (Meetings/Calendar), a primary "Prompt" + secondary "New
  label" action pair, and label cards in a lg:columns-2 masonry (break-inside-avoid)
  that fills the screen. Wide columns keep the TreeCore outline uncramped. PASS.
- **Per-task inline Prompt (option A)** — every My Space row carries an always-visible
  "Prompt" pill (filled bg-primary-soft when the task already has a description). It
  expands the shared DescriptionField (Edit/Preview, Markdown) inline under the row,
  indented to the row content, committing to descriptionMd on blur; "Done" closes.
  Gated on compact mode, so it exists ONLY in My Space. PASS.
- **Top Prompt composer (option B)** — a header "Prompt" opens a centred modal: one
  free-form textarea (first line -> title, rest -> description) + an optional label
  select + "Add to My Space". Cmd/Ctrl+Enter submits. PASS.
- **Mobile 390** — single column, wrapped header actions, and the Prompt pill is
  visible on every row (mobile has no hover toolbar, so this is the discoverable
  path). The composer is a centred min(38rem,94vw) sheet, edge-safe. PASS.
- **Project-tree regression** — `compact:true` exists ONLY in my-space.tsx; onOpenPrompt
  and the inline editor are both source.compact-gated, so a project tool tree renders
  neither the pill nor the editor — provably unchanged. PASS.
- **Tokens / contrast** — the Prompt primary button = on-primary pair; the active pill =
  checked primary-soft/primary-ink; the composer scrim is the pre-existing bg-black/45.
  tokens PASS, contrast 61/61.

## Phase 25 — Remove developer test triggers for go-live (2026-08-06)

Rendered against the real compiled Settings/account as a MANAGER (the only role that
saw the test buttons), 1440 + 390; throwaway p25v- actor, hard teardown. No data step.

- **Settings / Notifications (1440 + 390)** — both "Send test" buttons GONE (push test
  in the "Alerts on this device" row; email test block under "Email alerts"), and the
  test-recipient input GONE. Verified programmatically: Send-test buttons=0, test-input=0,
  email-toggle=1 at both widths. The REAL controls remain and read cleanly with NO gap or
  orphaned heading: the push enable/turn-off row ("Alerts on this device"), the email
  OPT-IN toggle ("Email alerts", on), the always-on-bell caption, and Change password. PASS.
- **Real machinery untouched** — diff is exactly: 2 deleted routes (email/test, push/test),
  the two buttons + their wiring in notifications-row.tsx, the sendTest hook in use-push.ts,
  and the 3 email-test assertions in perm-matrix.ts. lib/notify, lib/email, lib/push,
  lib/email-templates, the crons, /api/push/subscribe and the event/meeting paths are NOT
  in the diff. PASS.

## Phase 26 — New Orbit logo across favicon / in-app / PWA icons (2026-08-06)

Rendered against the real compiled UI (Playwright, dev server) + direct inspection of
the generated PNGs. No data step. DEVIATION: the master orbit-logo-source.png was NOT
transparent (0% alpha, solid white bg) despite the brief; the generator trims the white,
flood-fills edge-connected white -> transparent (interior highlights preserved), then
centers on canvas.

- **Generated icon set (direct inspection)** — trimmed artwork 218x152 (aspect 1.43,
  undistorted). icon-192/512 = logo centered on #f2f6fc at 78% fill; apple-touch-180 at
  76%; icon-maskable-512 at 62% (artwork's widest points ~158px from centre, inside the
  ~205px 80%-safe-zone radius — no clip under circle/squircle). favicon.ico packs
  transparent 16/32/48 PNGs (valid PNG-in-ICO). orbit-logo.png = transparent cut-out for
  in-app/email. All on #f2f6fc for PWA/apple (owner choice), artwork never stretched. PASS.
- **Login (1440 + 390)** — the new logo sits crisp in the circular badge above the
  wordmark; transparent cut-out blends onto the white badge. PASS.
- **Mobile app header (390)** — the new logo replaces the old blue dot beside "Orbit";
  transparent, blends into the #f2f6fc header (no white box), right-sized (h-6). PASS.
- **Set-password header** — same logo component pattern as login/header (dot -> logo). PASS.
- **Email header** — the CSS primary-circle mark replaced with the hosted transparent
  logo (${APP_URL}/orbit-logo.png), wordmark kept; alt="" so a blocked image degrades to
  the wordmark. PASS.
- **Everything else unchanged** — manifest icon paths + names + theme_color kept, so the
  SW/manifest/head references stay valid; SW cache bumped v1->v2 so installed clients
  fetch the new icons. Diff = assets + logo components only.

## Phase 27 — New Orbit logo (dark-navy app icon) across favicon / in-app / PWA (2026-08-07)

Supersedes the phase-26 blue logo (owner supplied a new source). New source =
1254x1254 SQUARE, RGB, no alpha, dark navy #010319 bg (white node + 2 nodes +
concentric orbit arcs). Used AS-IS (dark logo in the light app — owner choice).
No data step.

- **Generated icons (direct inspection)** — icon-192/512 + apple-touch-180 =
  straight resizes (full navy square, undistorted). icon-maskable-512 = artwork
  at 82% centred on navy #010319 padding (sampled corner) -> outer orbit ring
  ~170px from centre, inside the 205px 80% safe zone. Applied an actual circular
  crop (inscribed r=256): ALL orbit rings survive with a clean navy margin — the
  crop trims navy, not artwork. favicon.ico packs 16/32/48. orbit-logo.png = 256
  square for the in-app/email badge. Nothing stretched (square source). PASS.
- **Login (1440 + 390)** — the logo renders as a dark rounded-square app-icon
  badge (h-16, rounded-2xl, soft shadow) above the wordmark; bold + distinctive,
  reads cleanly on the light card. PASS.
- **Mobile app header (390)** — small dark badge (h-7, rounded-lg) beside
  "Orbit"; right-sized (not oversized), reads well on the light #f2f6fc header. PASS.
- **Set-password header** — same small rounded badge pattern. PASS.
- **Email header** — hosted dark logo (26px, border-radius 6px) + wordmark. PASS.
- **Nothing else changed** — same icon filenames/paths + manifest theme_color +
  app name; SW cache bumped v2->v3 so installed clients fetch the new icons.

## Phase 28 — Dynamic app-URL handling (invite/reset/email links) (2026-08-07)

Backend link logic; no visual screens changed. No data step.

- **Audit** — every absolute URL was built from three parallel copies of
  `const APP_URL = process.env.APP_URL || "https://task-tracker-topaz-delta-86.vercel.app"`
  (lib/invite.ts, lib/collab-invite.ts, lib/email-templates.ts) — all falling back to
  the OLD dead domain. Push data.url is relative ("/calendar", "/") and resolves in the
  SW against the origin — already dynamic. No absolute password-reset URL is built.
- **Resolver** — one canonical lib/base-url.ts getBaseUrl(): APP_URL -> VERCEL_PROJECT_
  PRODUCTION_URL -> VERCEL_URL -> https://orbit-task-tracker.vercel.app. Production URL
  preferred over the per-deploy VERCEL_URL because these links go in EMAILS (must hit the
  stable site, never an ephemeral preview). Bare Vercel hosts get https://; trailing slash
  stripped. All three call sites now use it; the old-domain hardcode is gone (grep = 0).
- **Test** — check-phase28-baseurl 14/14: precedence, scheme, trailing-slash, never-old-
  domain; taskDueEmail/testEmail/inviteEmail + the shared shell (logo img + settings link)
  and the invite/collab link format all build on the resolved base. PASS.

## Phase 29 — Invite-into-project + "added to project" email + block deleting project-owners (2026-08-10)

Three changes, manager-only + server-enforced. No data step (throwaway rigs only,
hard teardown; real rows untouched).

- **New Project modal — invite-new rows (1440)** — DEVELOPERS keeps its existing
  checkbox list ("Optional — none selected."), and below a divider a new "INVITE
  SOMEONE NEW" section holds name+email rows, each with an × remove and a "+ Add a
  person" button. The valid row (Asha Menon / asha@company.com) sits neutral; the
  invalid row (Ravi Kumar / not-an-email) gets a danger border + "Enter a valid
  email." and the footer "Create project" goes muted/disabled (disabled={!ready},
  ready requires invitesValid). Header/footer pinned, middle scrolls — overlay
  centered, no bleed. PASS.
- **New Project modal — invite-new rows (390)** — modal is ~full-width; the name
  and email inputs sit side-by-side and stay tappable, × remove aligned right, the
  invalid row's red border + message wrap cleanly, Create project pinned in the
  footer. Long emails ellipsize inside the field (value intact). No truncation of
  controls, no horizontal bleed. PASS.
- **People — delete-block for owners (1440)** — a manager who OWNS projects (Test
  Manager) shows Delete rendered DISABLED (muted span, title="Reassign or delete
  their N project(s) first"); managers who own nothing (Manager, Perm manager, P29
  NonOwner) show an enabled solid-danger Delete. Disable stays available on every
  manageable row; the self row (P29 Owner, "you") has Disable muted (self-guard).
  Header copy corrected: no longer promises a cascade ("also deletes every project
  they own"), now "A manager who owns projects can't be deleted until those projects
  are reassigned or removed." PASS.
- **"You've been added to <project>" email** — Orbit badge + wordmark header,
  "You've been added to Recruiter Dashboard" heading, blurb naming who added them +
  role, Project / Your role / Added by rows, "Open the project" primary CTA (getBaseUrl
  + /t/<slug>), opt-out footer. Sent to existing users added as member/lead; brand-new
  pending users instead get the invite email (which names the project) — no double. PASS.
- **Invite email w/ project** — same shell, adds a "Project" row + "and added you to
  <project>" so a brand-new invitee lands knowing the project. PASS.

## Phase 32 — WhatsApp meeting notifications via Twilio (sandbox) (2026-08-12)

A further meeting notification channel (WhatsApp) beside bell/push/email, plus
the phone/opt-in surfaces. Additive migration (User.phone, User.whatsappOptIn,
WhatsAppLog) — no existing row touched. TWILIO_* is set in prod (owner) and unset
locally, so WhatsApp no-ops locally; the send/dedupe/filter logic is proven via a
mock Twilio (TWILIO_API_BASE seam).

- **Settings → WhatsApp alerts (1440 + 390)** — a card mirroring Email alerts: a
  MessageCircle icon (primary-soft when on), an opt-in toggle, a "WhatsApp number"
  field (E.164) with Save (disabled until changed) and a manager-only "Send test",
  and a hint. The footer note now reads "Push, email, and WhatsApp are the optional
  layers…". At 390 the number + Save + Send test still share one row, no overflow. PASS.
- **Settings → invalid phone (1440)** — typing "12345notaphone" turns the input
  border danger + shows "Use international format, e.g. +916302608825.", Save stays
  disabled, and Send test disables (dirty → "save your changes first"). PASS.
- **People → per-row WhatsApp number (1440 + 390)** — under each administrable row's
  email, a compact MessageCircle + number field (placeholder "WhatsApp +countrycode…",
  populated where set) that saves on blur/Enter via PATCH /api/users/:id. Correctly
  ABSENT on the admin rows a manager can't administer (Vardhan, Perm admin). At 390 the
  cell stacks under the email with the controls wrapping below — no truncation. PASS.
- **Meeting notify path — visually unchanged** — WhatsApp is a backend channel added
  inside notifyEvent on the same recipient set; the calendar/meeting UI is untouched. PASS.

## Phase 33 — Rebuild My Space: private Department>Project>Task (2026-08-13)

Replaces the flat "labels" private space with a private Department>Project>Task>
Subtask hierarchy, per-user isolated. Owner-approved discard of the old labels +
label-tasks (5 labels + 41 private tasks dumped to records/snapshots/ first).
Throwaway p33v- rigs, hard teardown; shared project data byte-stable (131 tasks).

- **My Space empty state (1440)** — new copy "Your private departments, projects
  and tasks. Only you can see these." + a dashed card "Your private space is empty
  · A personal workspace nobody else can see. Make a department, add a project
  inside it, then break the work into tasks and subtasks." Prompt + New department
  in the header (developer). PASS.
- **Dept>Project>Task tree, developer (1440 + 390)** — a "Personal" department
  (collapsible; project-count; reorder ↑↓; new-project; delete) containing "Side
  quests" and "Reading list" projects (collapsible; task-count; reorder; delete).
  The task tree is the shared TreeCore in PERSONAL mode: rows show ONLY the status
  toggle and a "Notes" pill (renamed from "Prompt") — every project chip is hidden
  (no priority, due, schedule, assignee, gates/verified, tags) AND no completion
  ring / blocked-dot / chart. Subtasks nest under their root; a DONE task shows the
  green check; "+ Add task" at the foot. At 390 the header buttons + rows reflow
  with no horizontal scroll; a long title truncates cleanly. PASS.
- **Prompt gating** — the Prompt button renders for the DEVELOPER (both widths)
  and is ABSENT for the MANAGER, who still gets My Space and the full Dept>Project>
  Task structure. Server-enforced too: POST /api/my-space/prompt is 403 to any
  non-developer (test). PASS.
- **Isolation (verified in check-phase33-personal, not a screen)** — a personal
  dept/project/task is 404 to another developer, a lead, a manager AND an admin;
  never in their lists; never in any project query/dashboard (project-task count
  unchanged); delete-dept-when-nonempty blocked (409). 53/53. PASS.
