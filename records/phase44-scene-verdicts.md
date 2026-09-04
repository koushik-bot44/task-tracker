# Phase 44 — person-screen code scene + "Routine" → "Well Being" — verdicts

Evidence in `records/evidence/phase44/`. Two changes, both cosmetic/label-only — no
permission, data, or endpoint logic changed. Person still 403s all work/manager
surfaces; wall suites all pass.

## Change 1 — the code-rendered scene (`components/routine/person-scene.tsx`)
- **Pure CSS + inline SVG** — no image assets, no 3D libs. A multi-stop gradient sky,
  a warm/purple horizon glow, a glowing sun (day) / crescent moon + soft stars (night),
  drifting blurred clouds (day), and **three receding, drop-shadowed hill layers** that
  imply depth. The old phase-43 images (`person-bg-*.png/.webp`) and their references
  are **deleted** (grep: 0 `person-bg` in app code).
- **Fits every viewport**: the sky/glow are gradients (fill any size), the hills are an
  SVG with `preserveAspectRatio="none"` (stretch to any width), and the celestial
  bodies/clouds/stars are `%`-positioned — so it covers 390 and 1440 edge-to-edge with
  NO gaps/distortion (the fix vs the fixed-aspect images). Safe-area respected
  (`fixed inset-0` scene; content padded by `max(<base>, env(safe-area-inset-*))`).
- **Time-based** (local time, Date-based — NOT a media query): `06:00–17:59` → warm
  dawn, `18:00–05:59` → calm night. Computed client-only (mount-gated, no SSR/UTC
  mismatch); re-checked every 5 min so a screen left open flips on its own.
- **Gentle motion** — clouds drift (34–40s), sun/moon shimmer (9s), hills float (18–26s
  parallax), stars twinkle (4.5s). Transform/opacity only, GPU-friendly. **Freezes under
  `prefers-reduced-motion` (CSS `@media`)** — confirmed a clean static scene.
- **Text readability (sampled on the text-free scene, ≥4.5):**
  | Text | Scene | Colour | Worst-case |
  |---|---|---|---|
  | Greeting | day | ink `#16255b` | **7.40:1** (no scrim) |
  | Greeting | night | white + soft scrim | **13.54:1** (8.35 even at the scrim's edge) |
  | Sign-out | day | ink | **5.92:1** |
  | Sign-out | night | white | **16.20:1** |

  Night's greeting keeps the soft blurred scrim behind it (the moon sits in the greeting
  band); the day sign-out was darkened muted→ink (it sat over the lavender hills). The
  header emoji was dropped — the scene now carries the sun/moon.

## Change 2 — "Routine" → "Well Being" (user-facing text only)
- **Route/API/identifiers unchanged** (`/routine`, `/api/routine/*`, `Routine*` types) —
  a label change, not a route rename (per the spec's decision). Every user-facing string
  → "Well Being": nav item, page heading, `aria-label`s (view + switcher), the
  MonitoringManagers copy ("…manage — this Well Being"), the delete-confirm ("ALL Well
  Being history"), the Home invite ("…monitor <name>'s Well Being"), accept toast, the
  invite notification title + body, and the 404/403/400 error copy.
- grep: **0 user-facing "Routine"** remains (only code comments + the `routines` variable).

## Per-screen verdicts
| Screen | File | Verdict |
|---|---|---|
| Day @ 390 | `p44-day-390.png` | **PASS.** Warm dawn scene full-screen; glowing sun, layered hills; dark greeting/sign-out readable. |
| Day @ 1440 | `p44-day-1440.png` | **PASS.** Scene covers the wide viewport edge-to-edge, no gaps/distortion. |
| Night @ 390 | `p44-night-390.png` | **PASS.** Calm indigo scene; crescent moon + stars; white text readable. |
| Night @ 1440 | `p44-night-1440.png` | **PASS.** Covers edge-to-edge; moon upper-right clear of the greeting. |
| Night reduced-motion | `p44-night-390-reduced.png` | **PASS.** Clean static scene, motion frozen. |
| Manager Well Being tab | `p44-manager-wellbeing-1280.png` | **PASS.** Sidebar nav + heading read "Well Being"; Summary/Tracker sub-tabs work. |

## Judgment
Full-screen fit at every size ✓ · safe-area ✓ · time palettes ✓ · gentle motion +
reduced-motion freeze ✓ · text ≥4.5 on both ✓ · person wall unchanged ✓ · no
user-facing "Routine" ✓ · only `/person` visuals + the rename changed.
