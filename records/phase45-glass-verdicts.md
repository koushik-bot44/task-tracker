# Phase 45 — person screen: frosted-glass working panel + interactive polish — verdicts

Evidence in `records/evidence/phase45/`. ONLY `/person` (`PersonScreen`) styling changed —
the working UI became frosted glass over the phase-44 scene, with glassy interactive tabs
+ cells. No permission/data/endpoint change; the tap-cycle logic is untouched.

## The glassmorphism
- **One frosted-glass panel** holds the tabs + the active section: `background: var(--pk-bg)`
  (a semi-transparent white on day, a semi-transparent dark indigo on night), `backdrop-filter:
  blur(17px) saturate(150%)` (+ `-webkit-` prefix) so the scene (moon/stars/gradient/hills/sun)
  is softly visible through it, a 1px light **border + inset top sheen**, a soft outer shadow,
  rounded corners. **Fallback:** `@supports not (backdrop-filter)` bumps the panel opacity to
  ~0.85 (still readable, just less see-through).
- **Per-scene tint** via CSS custom properties (`.pk-day` / `.pk-night`, in globals.css so the
  tokens resolve): day → light glass + ink text; night → dark glass + near-white text. The
  reminder banner is glass too.

## Interactive polish
- **Tabs**: glassy pills; the active tab a brighter frosted glass (`--pk-active` + border +
  sheen); inactive tabs hover to a soft fill. `pk-press:active` scales to 0.95.
- **Habit cells** (via a `glass` prop on the shared `SegmentGrid` — the manager view never
  passes it, so it's unchanged): translucent resting cells, a row-hover lift, press scale, and
  soft **MET (green glass) / MISSED (red glass) / NA (grey glass)** states over the scene.
  The ✓/✗/N-A **tap-cycle behaviour is identical** (styling only).
- **Task rows** glassy (done → green glass); **rule cells** glassy (done → green, to-do → soft
  blue). Motion 150ms ease-out, **frozen under `prefers-reduced-motion`** (CSS `@media`).

## Readability — sampled contrast over the glass panel (text-free frames), ≥4.5 on BOTH
| Text | Day (dark on light glass) | Night (light on dark glass) |
|---|---|---|
| Tab labels | **8.05:1** | **5.21:1** |
| Segment title | **10.74:1** | **15.81:1** |
| Habit name | **10.99:1** | **9.00:1** |
| Weekday header | **5.48:1** | **10.94:1** |

All pass; no opacity bump needed beyond the chosen tints (the night secondary-text token was
made solid `#c6d0ee` for a clean check).

## Per-screen verdicts
| Screen | File | Verdict |
|---|---|---|
| Night — Habits | `p45-night-habits-390.png` | **PASS.** Cohesive + premium: the indigo scene shows through the frosted panel; glassy tabs; MET/MISSED/NA glass cells; white text readable. |
| Day — Habits | `p45-day-habits-390.png` | **PASS.** Dawn scene (sun/hills) visible through the light glass; ink text + soft cells readable. |
| Night — Tasks | `p45-night-tasks-390.png` | **PASS.** Glassy task rows (done → green glass), readable. |
| Day — Tasks | `p45-day-tasks-390.png` | **PASS.** Glassy rows, ink text. |
| Night / Day @ 1440 | `p45-night-habits-1440.png` / `p45-day-habits-1440.png` | **PASS.** Panel (max-w-2xl) floats centred; scene visible through it; no distortion. |
| Hover feedback | `p45-night-hover-390.png` | **PASS.** Hovered tab shows the soft fill. (Press = 0.95 scale; freezes under reduced-motion.) |
| Reduced-motion | `p45-night-reduced-390.png` | **PASS.** Clean static glass; no transforms. |
| Contrast frames | `p45-day-sample.png` / `p45-night-sample.png` | Text-free panel frames used for the contrast sample above. |

## Judgment
Cohesive ✓ (the panel reads as one frosted pane ON the scene, not a floating opaque card) ·
premium ✓ (blur + sheen + soft depth) · readable ✓ (≥4.5 on both scenes) · tap-cycle logic
unchanged ✓ · scene + motion unchanged ✓ · only `/person` changed (manager `SegmentGrid`
never gets `glass`).
