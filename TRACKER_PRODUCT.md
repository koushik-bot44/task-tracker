> **Superseded (2026-09-04).** This is the pre-restructure product spec (tools, gates, seven statuses). The current shape of Orbit — projects, milestone boxes, four statuses, the three messages — is specified in `records/plans/restructure-plan.md`. Kept as history.

# TRACKER_PRODUCT.md — Orbit (v7, subtask %, lead-scoped onboarding, manager read-only rail)

A **small-team task tracker with excellent UI/UX**. Tracks progress of every SGROUP automation tool: what shipped, what is in flight, what is next — and who finished it. Installable PWA — same app in a desktop browser and on a phone home screen, one shared source of truth.

Three roles: **developers** do the work, **team leads** own delivery inside a
tool, **managers** decide which tools exist and sign work off. Deliberately
absent: external integrations, webhooks, API tokens, notifications, file
attachments. This is a tracker, nothing more. The budget saved goes into
interaction quality.

(Assignees were on that absent list until phase 5. They are in now, because
"who is doing this" turned out to be the question the tool could not answer.)

**How to use this doc:** save at repo root, paste into every Claude Code session. Build phases in order. Smallest diff. No scope creep beyond the phase in progress.

---

## 1. Core concepts

**Tool (Project).** Top-level container, one per automation tool. Fields: name, color, icon, health (Active / Paused / Shipped / Idea), gate template.

**Task.** Belongs to a tool. Nests infinitely via `parent_id` — subtasks can have subtasks can have subtasks. UI must stay readable at depth 5+.

**Status vs Gates — the key design decision.** Two orthogonal axes of "done":

- **Status** = where work stands. One value: `Backlog → Planned → In Progress → Blocked → Done` (+ `Cancelled`). Drives the board and overview counts.
- **Gates** = quality checkboxes: default **Built, Reviewed, Tested, Deployed, Verified**. Each tool defines its template; each task copies it at creation and can add/remove gates individually. A task can be In Progress with Built ✓ and Deployed ✗ — that is the point.

Marking Done with open gates is allowed but shows a soft "2 gates open" chip. Inform, never police.

**Progress rollup.** Parent progress = done leaf descendants / total leaf descendants. Tool ring = same across all its tasks. Blocked bubbles a red dot up the ancestor chain. Completing the last child triggers: "All subtasks done — mark parent done? [Yes / Keep open]".

A task **with children** carries that rollup as a **percentage chip** on its
tree row and its board card. A leaf carries nothing there: its own checkbox
already states its done/not-done, and 0/0 is not 0% — it is "not applicable".
The chip's track fills to match the number so it reads at a glance without
being read. `leafProgressByTask` computes it once from the same tree the rows
are built from, so tree and board cannot drift apart.

The Tool **Overview** keeps its own flat progress column — every root row, leaf
or parent, shows a completion bar so the whole tool scans top to bottom. That
column draws on the same `leafProgress`, so the numbers agree with the chip; it
differs only in that it shows a leaf root as 0% / 100% rather than hiding it,
because a flat list wants a value in every row.

**Notes.** Plain-text discussion on any task, oldest first, attributed to its author. Not markdown — that is what the description is for.

**Deliverable link.** One URL per task pointing at whatever was produced. Links only; the tracker never stores files.

---

## 1a. Roles

Three roles. Everyone signs in with an email and password; there is no
anonymous access. **The UI hides; the server decides** — every rule below is
enforced in a route handler, and the client is free to be wrong.

| Capability | Developer | Team lead | Manager |
|---|:--:|:--:|:--:|
| View everything (tools, trees, board, focus, changelog, overview) | ✅ | ✅ | ✅ |
| Create a tool (requires a description AND an active team lead) | ❌ | ❌ | ✅ |
| Edit a tool: name, colour, description, lead, gate template | ❌ | ❌ | ✅ |
| Delete a tool (destroys every task under it) | ❌ | ❌ | ✅ |
| Create, edit, reorder, reparent, delete tasks | ✅ | ✅ | ✅ |
| Set any status, including **On hold** | ✅ | ✅ | ✅ |
| Assign work to **anyone** | ❌ | ✅ | ✅ |
| Claim an **unassigned** task, or drop their **own** | ✅ | ✅ | ✅ |
| Reassign someone else's task | ❌ | ✅ | ✅ |
| Tick any gate except **Reviewed** | ✅ | ✅ | ✅ |
| Tick, untick, add, remove or rename away the **Reviewed** gate | ❌ | ❌ | ✅ |
| Set a deliverable link | ✅ | ✅ | ✅ |
| Post a task note or a tool note | ✅ | ✅ | ✅ |
| Delete **their own** note | ✅ | ✅ | ✅ |
| Delete *someone else's* note | ❌ | ❌ | ❌ |
| See the Review queue | ❌ | ❌ | ✅ |
| See the people list | ❌ | ✅ | ✅ |
| Create a **developer** account | ❌ | ✅ | ✅ |
| Create a **lead** or **manager** account | ❌ | ❌ | ✅ |
| Change a role, reset a password, disable an account | ❌ | ❌ | ✅ |

Three rules earn their asymmetry:

- **A lead cannot create a tool.** A lead runs delivery inside tools; deciding
  which tools exist is a different job.
- **A lead cannot move the Reviewed gate.** Signing off their own team's work
  would empty the Review queue of meaning.
- **A lead can create developers, and only developers.** A lead who can assign
  work but not onboard the person doing it has to queue behind a manager for a
  five-second task. Creating a *lead* or a *manager* grants authority, and
  touching an existing account — role, password, disabled — changes someone
  else's access; both stay with managers. The server enforces the split on the
  role in the request body, before any write.

**The manager read-only rail.** A manager opens a tool's tree or board in
read-only: checkboxes render as indicators, rows do not drag, inline titles do
not edit, the detail panel is a `fieldset disabled` behind a banner. An **Edit**
button in the tool header lifts it, an "Editing" chip says so, **Done** puts it
back, and a reload returns to read-only.

This is a rail, not a permission. Managers keep every right in the table above
and the server is untouched — the same manager can still PATCH the same task
through the API mid-rail, and the acceptance test asserts exactly that. The
rail exists because a manager reading a tool they do not work in is one stray
click from completing someone else's task, and after the fact an accident is
indistinguishable from a decision. Leads and developers are here to work, so
they land editable and never see the button.

A developer may claim spare work or put their own down. They cannot hand work
to a colleague and cannot take work off one — that is a lead's call.

## 1b. Assignees, dates and On hold

**Assignee.** Optional, one person, any active user. A task a developer creates
is theirs by default. Rows show initials; unassigned is a dashed slot, and in
the dense tree it is simply absent rather than sixteen repetitions of the word.

**Estimated completion.** Called "Est. completion" everywhere a person reads
it; the column is still `dueDate`, because renaming a column across a live
database to win a word is not a trade worth making.

- Root tasks **require** one — 400 without it. A root task with no answer to
  "when do you think this lands?" quietly becomes work nobody is counting.
- Subtasks **inherit** the parent's date when none is given.
- Enter in the tree cannot stop to ask, so it guesses the way a person would:
  the previous sibling's date, then the parent's, then a week out.

**Provisional dates.** `dueProvisional` records that the *server* picked a
date. Inheritance carries the parent's confidence, so a guess propagating down
a tree stays visibly a guess. **Any** edit to the date clears the flag —
editing it is the confirmation; there is no separate gesture to forget. A
provisional date still counts in every calculation and is only *marked*: dashed
edge, a leading `~`, and a tooltip saying Orbit estimated it. Pretending a task
has no deadline until somebody types one is how work goes untracked.

**Schedule vocabulary**, owned by `lib/dates.ts` so no two screens can disagree:

| Term | Meaning |
|---|---|
| **Overdue** | due before today, not DONE or CANCELLED |
| **At risk** | due within 3 days, not DONE or CANCELLED |
| **Unscheduled** | no date at all, not DONE or CANCELLED |
| **No date** | how an unscheduled task renders — neutral and dashed, never amber |

Finished work is never late. A task that shipped last month against a date two
weeks earlier is history, not a problem, and painting it red buries what is
actually slipping.

**On hold.** A sixth status between In progress and Blocked. Amber, not red:
on hold is a *decision* (waiting on a client, parked for the quarter) where
blocked is an *obstacle* someone must clear. Only Blocked bubbles a warning up
the tree.

## 1c. Manager surfaces

**Role-aware home.** One route, three landings, because sending all three roles
to the same screen meant two of them went hunting for their own work.

- **Manager → Portfolio.** Overall ring, and count tiles for in progress, on
  hold, overdue, at risk and unscheduled. Every tile opens the work behind it;
  a count you cannot click is a count you have to go looking for. Tool cards
  carry a status donut, the lead's name and schedule badges.
- **Team lead → their tools.** Completion, a status mini-bar, and
  overdue/at-risk/undated as call-to-action chips. Plus the two lists only a
  lead can clear: **Needs a date** and **Unassigned**.
- **Developer → My work.** Their assigned tasks across every tool, grouped
  Overdue / At risk / In progress / Upcoming, with a finished-this-week count.

**Tool Overview** (`/t/[slug]/overview`) — a manager's read-out of one tool.
Managers land here when they open a tool; leads and developers land in the tree,
but the tab is visible to everyone, since hiding it would only mean asking a
manager for a screenshot.

- Identity: name, description, lead, created date, About & requirements.
- Three charts, each a filter: **status donut** (click a segment), **completed
  per week** (8 ISO weeks, computed client-side), **workload per person**
  (open vs done; click a bar). Status and assignee filters combine, with a
  visible clear.
- **The list is root tasks only.** Each row: title, completion percentage from
  the leaf rollup, status, assignee, est-date pill. Subtasks are a count and a
  collapsed expander. The ask was a simple view, not the outline again.

**Copy status report** produces markdown:

```
# <Tool> — status <date>

Overall: <pct>% (<done>/<total> smallest tasks done)
In progress N · on hold N · done N · overdue N · at risk N

- <title> — <pct>% (<Status>, <Assignee or Unassigned>, due <date|no date>[, OVERDUE])
```

**Charts are hand-rolled SVG and CSS. No chart library, ever** — a standing
constraint. Donut segments are stroke-dasharray arcs on a single circle, so
there is no trigonometry and no seams. Reveals may run to 750ms (the motion
law's exception for data); reduced motion gets the final state instantly.

## 2. Data model — two tables, that's all

```
projects      (id, name, slug, color, icon, health, gate_template jsonb,
               order_key, created_at)
tasks         (id, project_id, parent_id nullable→tasks.id, title, description_md,
               status, priority[p0..p3], due_date null, order_key, gates jsonb,
               tags text[], links jsonb, created_at, updated_at,
               completed_at null, deleted_at null, pinned_at null,
               deliverable_url null, completed_by_id null→users.id)
users         (id, email unique, name, password_hash, role[MANAGER|DEVELOPER],
               created_at, disabled_at null)
task_notes    (id, task_id→tasks.id cascade, author_id→users.id restrict,
               body, created_at)
login_attempts(id, ip_hash, created_at)
```

Decisions baked in:

- **Gates as JSONB on the task row**: `[{key:"deployed", label:"Deployed", done:true, at:"..."}]`. No join table.
- **Fractional-index ordering** (`order_key`, `fractional-indexing` package): reorder/reparent writes exactly one row.
- **Tree fetch = flat fetch.** One query per tool, client assembles the tree. Instant collapse/expand/search, no recursive SQL.
- **Soft delete** (`deleted_at`) + 10-second undo toast. No confirm dialogs.
- **No activity table.** "Recent" derives from `completed_at` / `updated_at`.
- **Passwords are scrypt**, cost parameters stored inside the hash string so they can be raised later without invalidating anything.
- **Rate limiting is a table, not memory.** `login_attempts` counts failures per hashed IP over a rolling minute, so the limit holds across serverless instances rather than resetting per lambda.

---

## 3. Views

**3.1 Command Center (home).** The overview the app exists for. Tool cards: animated progress ring, 14-day completion sparkline, in-flight / blocked / done counts, "next up" peek. Global strip: shipped this week, in flight, blocked. Recently completed list below.

**3.2 Tree view (the workhorse).** Workflowy × Linear. Infinitely collapsible outline, depth guide lines, per row: status checkbox, inline-editable title, gate chips, priority flag, due pill, tag pills. Click a bullet = zoom in (task becomes page root, breadcrumbs back). Hover reveals quick actions. Drag to reorder and reparent.

**3.3 Board (kanban).** Columns = status. Cards show gate dots + subtask count. Drag between columns updates status with a spring settle.

**3.4 Changelog.** Done tasks grouped by ISO week, per-tool filter, **"Copy as markdown"** — instant weekly shipped-report.

**3.5 Focus.** Overdue + due today + pinned "now" items across all tools. The morning screen.

**3.6 Detail panel.** Any row → side peek (desktop) / bottom sheet (mobile): markdown description, gates checklist, mini subtask tree, links, deliverable link, notes thread. Overlay — never navigates away.

**3.7 Review (managers only).** Two groups: work that is Done with the Reviewed gate still open, and the last twenty already signed off. Per row: tool, ancestor path, who completed it and when, the deliverable link, an expandable notes thread, and one button that ticks the gate. Tasks with no Reviewed gate never appear.

**3.8 People (managers only).** Create accounts with a one-time generated password, reset passwords, change roles, disable and enable. Everyone gets an Account page to change their own password.

---

## 4. Interaction contract — where the excellence lives

**Zero page reloads.** Every mutation optimistic (TanStack Query: cache first, reconcile after, rollback on failure). The app must feel local.

**Keyboard-first on desktop:**

| Key | Action |
|---|---|
| `Enter` | New sibling below (focus it) |
| `Tab` / `Shift+Tab` | Indent / outdent |
| `Cmd/Ctrl+Enter` | Toggle done |
| `Alt+↑/↓` | Reorder within siblings |
| `←/→` | Collapse / expand |
| `Cmd+K` | Command palette + quick-add |
| `?` | Shortcuts sheet |

**Gesture-first on mobile:** swipe right = complete, swipe left = actions, long-press = drag, pull-down = refresh, tap row = bottom sheet. Haptic tick on completion.

**Quick-add with live token chips:** `webhook retry #skyzen !p1 due:fri +backend` — tokens colorize as you type.

**Motion budget (deliberate, one signature):**

- Completion is the signature moment: strike-through sweep, gate chips fill, parent ring ticks up with spring physics. Confetti only when an entire parent or tool completes.
- Expand/collapse 150–200ms ease-out-expo. No bounce anywhere.
- Drag: lift + 1–2° tilt + shadow, glowing drop targets, edge auto-scroll.
- Odometer number tickers on the Command Center.
- Skeletons for loads; empty states invite action ("Press Enter to start").
- Every animation has a `prefers-reduced-motion` fallback. Non-negotiable.

Multi-device consistency: refetch on window focus + BroadcastChannel across tabs. Good enough for one human.

---

## 5. Mobile + PWA

- Manifest: `display: standalone`, maskable 512px icon, theme color per theme, shortcuts (New Task, Focus).
- iOS: apple-touch-icon, status-bar style, splash — clean Add to Home Screen install.
- Service worker, phased honestly: Phases 1–2 = shell precache + stale-while-revalidate reads (instant open, readable offline, writes need network with a clear offline pill). Phase 3 = IndexedDB outbox so writes queue offline and replay on reconnect (last-write-wins by `updated_at`).
- Quiet "Install app" chip after second visit. Never a blocking prompt.

---

## 6. Design language

Two themes, one identity:

- **Dark — "Control Room" (default):** warm deep charcoal (never blue-black), teal + gold accents, Inter for UI, Fraunces reserved for the big dashboard numbers. The stays-open-all-day theme.
- **Light — "Workshop":** SGROUP house style — warm cream `#f5f3ef`, teal + gold, Fraunces display, Inter body. Must read as a sibling of the Recruiter/P&L dashboards.

Craft floor: body contrast ≥ 4.5:1 both themes, max 2 families, semantic z-index scale, visible keyboard focus. The one aesthetic signature: progress rings + gate clusters treated as instrument-panel elements; everything else quiet.

### 6a. The design system, as built

Future phases inherit this. It is law, not suggestion.

**Tokens.** Every colour goes through a CSS variable; no hex literals in components.

| Token | Dark | Light | Used for |
|---|---|---|---|
| `--bg` | `#14120f` | `#f5f3ef` | Page |
| `--surface` | `#1c1915` | `#fffdf9` | Cards, rails |
| `--surface-2` | `#232019` | `#f7f4ee` | Menus, tooltips, raised |
| `--ink` | `#ece7de` | `#1f1b16` | Body text |
| `--muted` | `#9a9182` | `#625b4e` | Secondary text |
| `--line` | `#2a251f` | `#e2dbcd` | Borders, rules |
| `--teal` | `#2dd4bf` | `#0f766e` | Identity, in progress, focus ring |
| `--gold` | `#eab308` | `#8a5406` | Manager sign-off, shipped |
| `--ok` | `#4ade80` | `#15803d` | Done, passed gates |
| `--info` | `#7dd3fc` | `#0369a1` | Planned |
| `--danger` | `#f87171` | `#b91c1c` | Blocked, overdue, destructive |

Each accent has a `-soft` tint for pill fills. `--hover` and `--pressed` are the two interaction tints.

**Type.** 12 meta · 14 UI · 15 row titles · 18 section heads · 22–24 page titles · 36–44 dashboard numbers. Line-height 1.5 body, ~1.2 headings. Inter throughout; **Fraunces only for dashboard numbers and page-level display titles** — never body, never labels.

**Spacing.** 4px grid. Tree rows ≥ 44px tall, card padding 20, page gutters 32 desktop / 16 mobile, section gaps 24–32.

**Status colours** live in `lib/status.ts` and nowhere else, so a column header, a row pill and a select can never disagree:
Backlog muted · Planned `--info` · In progress `--teal` · Blocked `--danger` · Done `--ok` · Cancelled muted with a strike.

**Interaction states.** Every interactive element has three: hover tints the surface, press sinks it 2%, and `:focus-visible` draws a 2px teal ring with offset. The `.press` utility carries all three; use it rather than redeclaring.

**Motion.** 150–220ms, ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`), no bounce anywhere. Every animation has a `prefers-reduced-motion` fallback that lands on the end state. Completion is the signature moment: the checkmark stroke draws, the title's strike-through fades in via `text-decoration-color`, the row dims, the parent count ticks.

> The strike-through is real `text-decoration`, not a measured overlay. An overlay was tried and produced two bugs — overshooting short titles and clipping long ones — because it sized a rule against a hidden copy of the text. Do not reintroduce it.

**Gates.** Two forms. Rows get a compact `n/m` cluster with one dot per gate — `--ok` for passed, `--gold` for Reviewed — plus a tooltip naming each. Surfaces with room (detail panel) get labelled pills. Cancelled tasks show no gates at all. There is exactly one gate summary per surface, so nothing can contradict anything.

**Tooltips.** Hand-rolled, portalled to `document.body` so overflow cannot clip them, 300ms on hover and immediate on `:focus-visible`. **No icon-only control ships without one.**

**Discoverability.** No action may be hover-only. Anything on a row hover also has a permanent home in the detail panel. Keyboard shortcuts are a shortcut, never the only path — every creation route has a visible button.

**Numbers.** Percentages are always leaf-based. Any count states its basis in a label or tooltip, and the same concept never shows two different numbers on one screen.

**Copy.** Sentence case, active verbs, no jargon. Enum names never reach a human eye — "In progress", never `IN_PROGRESS`.

**Verification.** `npm run screens` captures every route at 1440 and 390 in both themes. Design changes are checked against those images, not against assumption.

---

## 7. Architecture (decided)

**Next.js 14 App Router + TypeScript**, one repo, one deploy. Prisma + **PostgreSQL on Neon**, provisioned from the Vercel Storage tab; app on **Vercel**. TanStack Query, dnd-kit, Framer Motion, fractional-indexing, zod, jose, cmdk, react-markdown + remark-gfm, lucide-react, Tailwind. next-pwa in Phase 4.

Auth: `/login` takes email + password, checked against a scrypt hash, and sets a jose-signed httpOnly cookie (30d) carrying user id and role. Middleware rejects any token lacking a recognised role — which is also what retired the passcode-era cookies without rotating the secret. Handlers re-read the account per request, so permissions and disablement are always current. `APP_PASSCODE` now guards exactly one thing: first-run bootstrap and break-glass recovery.

Backups: reuse the nightly GitHub Actions `pg_dump` → S3 pattern (Phase 4, one workflow file).

---

## 8. Phases

**Phase 1 — Foundation.** Scaffold, schema + migration, passcode auth, projects CRUD, task CRUD with infinite nesting, status + gates, fractional ordering, Tree view with inline edit + full keyboard outlining + drag reorder/reparent, optimistic updates, soft delete + undo, both themes.
*Acceptance:* create a tool; build a 4-level tree keyboard-only; toggle gates; drag reorder + reparent; complete → strike-through + live parent count; refresh persists everything; login required fresh; holds at 390px.

**Phase 2 — Overview & views.** Command Center (rings, sparklines, counts), Board, Detail panel, quick-add with token parsing, Cmd+K palette, Changelog with copy-as-markdown, Focus, tags/priority/due editing everywhere, zoom-in navigation.
*Acceptance:* home rollups accurate live; board drag updates tree + ring without reload; quick-add tokens land correctly; changelog copies clean markdown.

**Phase 3 — Roles & Review.** Users with MANAGER/DEVELOPER roles, scrypt passwords, first-run bootstrap, per-request permission enforcement, the Reviewed-gate rule, people management, per-task notes, deliverable links, and the manager Review queue.
*Acceptance:* a developer cannot touch the Reviewed gate, list users, or delete a tool; completion records who did it; notes are author-delete-only even for managers; disabling an account invalidates a live session; the Review queue moves a task between groups on sign-off.

**Phase 4 — Polish & clarity.** The design system in §6a: tokens, type scale, spacing rhythm, status map, interaction states, tooltips, help sheet, visible creation paths, gate clusters, row content hints, and a screenshot rig that makes all of it checkable.
*Acceptance:* one obvious primary action per screen; a newcomer can tell what to click without hovering; no horizontal scroll at 390px; both themes coherent; no enum names in the UI.

**Phase 5 — PWA & mobile feel.** Manifest + icons + iOS meta, service worker, offline outbox + replay, install chip, swipe gestures, long-press drag, pull-to-refresh, haptics, backup workflow.
*Acceptance:* installs on Android + iOS; opens instantly offline; a task completed offline syncs on reconnect; swipe-right completes with haptic.

---

## 9. Non-goals (permanent unless revisited)

Integrations/webhooks/API, teams or multiple workspaces, notifications, time tracking, Gantt/dependencies, file attachments (links only), server-side full-text search.

*Removed in v3:* "accounts/roles" and "comments" — accounts and roles now exist, and per-task notes cover the discussion that comments would have.

*Superseded in v6:* "roles stop at two". A third role, **team lead**, was a
deliberate product decision, not a gap being filled: someone had to own
delivery inside a tool without owning which tools exist. Roles stop at three on
the same terms — a fourth is a new decision, not a gap.
