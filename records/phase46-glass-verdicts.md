# Phase 46 — manager Well Being tab: 3D scene + frosted glass — verdicts

Evidence in `records/evidence/phase46/`. Styling only — no permission/data/endpoint/logic
change. The manager Well Being tab now matches the person /kid screen.

## Sharing (no parallel copy)
The scene + glass primitives are SHARED, not reimplemented:
- **`WellBeingScene`** (renamed from `PersonScene`, `git mv`) — one code-rendered scene
  component, used by both screens. Changed `fixed` → `absolute inset-0` so it fills its
  positioned ancestor (the person root full-screen; the Well Being page content region).
- **`useTimeScene()`** (`lib/hooks/use-time-scene.ts`) — one hook for the mounted/night
  state + scene class + float-text colour; the person screen's inline copy was removed
  and now calls it.
- **The `.pk-*` glass classes** (globals.css) — already global; reused as-is, plus new
  `.pk-input` / `.pk-btn` / `.pk-chip` helpers for the manager's denser forms.

## Scene scoped to Well Being only
The scene renders `absolute inset-0` inside the Well Being page root (a `relative
min-h-[calc(100dvh-4rem)]` div) — so it fills the page CONTENT region, NOT the sidebar or
header, and NOT other tabs. `p46-home-1440.png` (viewed at a night hour) shows Home in the
normal LIGHT app look with no scene → **scoped correctly**.

## Glass across every Well Being surface
Summary/Tracker toggle (glassy pills, active brighter, hover/press) · person bar · week
nav · weekly-grid card + its MET/MISSED/NA glass cells · non-negotiables card + its
done/todo/off glass cells · tasks card + rows (done = green glass) · reminder card · weight
card (incl. the hand-rolled sparkline, readable over glass) + Recent/Monthly pills · the
monitoring-managers panel + its rows/permission pills · all form inputs (glass `inputCls`)
· the add-person form. Text adapts dark on day, light on night; primary CTAs stay solid.
`-webkit-backdrop-filter` + an `@supports` opacity fallback are in the shared classes.

## Readability — sampled over text-free panel frames, ≥4.5 on BOTH scenes
| Element | Day | Night |
|---|---|---|
| Tab labels | **6.87** | **5.30** |
| Habit card text (fg) | **10.90** | **15.41** |
| Habit card (soft/weekday) | **5.49** | **10.74** |
| Tasks card text | **10.92** | **15.60** |
| Weight number | **11.13** | **14.79** |

All pass; no opacity bump needed beyond the shared person-screen tints.

## Per-screen verdicts
| Screen | File | Verdict |
|---|---|---|
| Night — Tracker @1440 | `p46-night-tracker-1440.png` | **PASS.** Cohesive with the person screen: night scene through the frosted panels; MET/MISSED/NA glass cells; readable white text; sidebar/header stay light. |
| Day — Tracker @1440 | `p46-day-tracker-1440.png` | **PASS.** Dawn scene through light glass; dark text readable across the dense layout. |
| Night — Summary @1440 | `p46-night-summary-1440.png` | **PASS.** Summary card (per-segment bars + overall + non-neg) on glass, readable. |
| Night / Day — Tracker @390 | `p46-night-tracker-390.png` / `p46-day-tracker-390.png` | **PASS.** Single-column glass panels; readable. |
| Scene scoped | `p46-home-1440.png` | **PASS.** Home has NO scene — normal light look (scene is Well-Being-only). |
| Reduced-motion | `p46-night-reduced-1440.png` | **PASS.** Static scene + glass, no transforms. |
| Contrast frames | `p46-day-sample.png` / `p46-night-sample.png` | Text-free panels used for the sampling above. |

## Function re-check
Styling only — all logic unchanged. Wall + collab suites pass: phase-35 (42, manager
marking/non-neg/weight/tasks/person CRUD), -36 (22, weight), -37 (33, person tap-cycle),
-38 (17, summary), -39 (34, collab invites/permissions); perms 56/56. Interactions (mark a
cell, week nav, Summary/Tracker toggle, weight log) are unchanged onClick handlers.

## Judgment
Cohesive with the person screen ✓ · readable despite the density (≥4.5 both scenes) ✓ ·
scene properly scoped to Well Being ✓ · other tabs unaffected ✓ · function intact ✓.

## Follow-up — full-screen button
A **Full screen** button sits top-right of the Well Being header (glassy `pk-glass pk-fg`,
adapts dark-on-day / white-on-night; icon-only under `sm`). It toggles the browser
Fullscreen API on the Well Being page root (`.wb-fs`) — the scene fills the whole screen,
sidebar/header drop away; the icon/label swap to **Exit full screen** while active, and
`.wb-fs:fullscreen { overflow-y:auto }` lets tall content scroll. Client-only; no API/data/
permission change. Verified via `scripts/_viz46fs.ts` (stubbed Fullscreen API):
`requestFullscreen` fires on the `.wb-fs` root, label toggles Enter↔Exit, button present
day/night/mobile — evidence `p46-night-fsbutton-1280.png` / `p46-day-fsbutton-1280.png`.

## Follow-up — scene readability while scrolling (sticky backdrop)
**Reported:** on a tall Well Being page, scrolling (and full-screen especially) bared a
white background under the lower cards — night text on near-white = unreadable. **Cause:**
the scene was `absolute inset-0`, pinned at scroll-origin, so once you scrolled past one
viewport there was only the light page background behind the content (starkest in
full-screen, where `.wb-fs` itself is the 100vh scroll container). **Fix:** render the
scene inside a STICKY, one-viewport `.wb-scene` layer (a negative margin pulls it out of
flow) so it stays pinned and fully composed while content scrolls over it. The manager
variant (`.wb-scene-app`) pins below the 4rem header and goes full-height under
`:fullscreen`; the person variant (`.wb-scene-full`) is a standalone full-viewport layer.
Applied to BOTH screens (shared `WellBeingScene`). Verified scrolled-to-bottom, night+day,
normal + full-screen-context + person — the scene stays dark/composed, no white:
`p46-{night,day}-scroll-normal.png`, `p46-{night,day}-scroll-fs.png`, `p46-person-scroll-night.png`.
Worst-case contrast over the horizon (lightest night region), clean glass: night
14.33/9.99/13.63, day 11.66/5.87/11.09 — all ≥4.5. Styling only.

## Follow-up — content bled through the app header while scrolling
**Reported:** in a normal (small) window, scrolling made the dark scene + the white "Well
Being" heading appear over the global top bar. **Two causes:** (1) the app header is
`bg-scrim` + backdrop-blur (translucent) — fine over light pages, but it let the dark scene
and light text show through here; (2) the Well Being content wrapper was `z-10`, the SAME as
the header's `z-sticky` (=10), so with equal z the later-in-DOM content painted OVER the
header. **Fix:** (1) on `/routine` the app header goes opaque (`bg-bg` + `border-b`), keeping
its light look + readable dark text; (2) the content wrapper drops to `z-[1]` — still above
the `z-0` scene, now below the `z-10` header — so it slides cleanly beneath the chrome.
Verified scrolled with the heading under the bar, desktop night/day + narrow: clean, no
bleed — `p46-hdr-desktop-night.png`, `p46-hdr-desktop-day.png`, `p46-hdr-narrow-night.png`.
Styling only; the header change is scoped to the Well Being route.

## Follow-up — invisible manager names in the invite dropdown
**Reported:** opening the "Invite a manager…" `<select>` showed the manager names near-
invisible (only the OS-highlighted row was legible). **Cause:** the glass selects carry
`color: var(--pk-fg)` (near-white at night), which their native `<option>`s inherit — but
the OS dropdown popup renders on its own light background, so white-on-white. **Fix:** a
scene-scoped rule forces glass-select options dark on white — `.pk-day option, .pk-night
option { color: var(--ink); background-color: var(--surface); }` — so the native list is
readable regardless of the closed control's glass text colour (the highlighted row keeps
the OS accent). Covers both glass selects (invite + the multi-routine picker). Verified via
`scripts/_viz46opt.ts`: computed option colour `rgb(22,37,91)` (#16255b) on white, night +
day. Styling only.
