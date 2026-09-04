# Phase 43 — person screen: time-based background — verdicts

Evidence in `records/evidence/phase43/`. ONLY the person screen (`/person`,
`PersonScreen`) changed — a full-screen, fixed, time-based background image with the
floating text (greeting, sign-out) adapting dark/light for readability. No permission,
data or endpoint change; the person gains nothing but a background image.

## The background
- Full-screen: a `fixed inset-0` layer, `background-size: cover`, `center`, `no-repeat`,
  behind the content (`z-0`; content `z-10`). It fills the viewport edge-to-edge,
  under the notch/home-indicator; the content sits inside the safe area via
  `padding: max(<base>, env(safe-area-inset-*))`. No stretch, no letterbox.
- Assets: the owner's PNGs are the masters (kept, un-distorted); the app loads optimized
  **webp** derivatives (`person-bg-morning.webp` 15KB, `person-bg-night.webp` 17KB — from
  1.6MB PNGs, same dimensions, `sharp` q82). See `scripts/_optimize-person-bg.ts`.

## The time switch (local time, Date-based — NOT a media query)
- `06:00–17:59` local → morning image; `18:00–05:59` → night image. Computed from
  `new Date().getHours()` client-only (after mount) so SSR/UTC can never mismatch the
  client's local time. **Live re-check every 5 min** so a screen left open flips across
  the 06:00 / 18:00 boundary on its own.

## Text readability (adapts by time) — contrast sampled on BOTH images (≥4.5)
| Text | Image | Colour | Worst-case contrast |
|---|---|---|---|
| Greeting | morning | ink `#16255b` | **5.25:1** PASS (no scrim) |
| Greeting | night | white `#ffffff` + soft scrim | **12.73:1** PASS (7.29:1 even at the scrim's blurred edge) |
| Sign-out | morning | ink | **5.81:1** PASS |
| Sign-out | night | white | **7.18:1** PASS (dark mountains, no scrim) |

The night greeting's raw worst-case is 1:1 where a sparse **star** (0.045% of the
greeting band) sits under a glyph; a soft, blurred dark halo (`rgba(9,13,38,0.9)`, the
one documented raw colour, spec-sanctioned for the bg) sits behind ONLY the greeting so
the sky/moon still show around it. Cards/tabs are their own opaque surfaces and keep
normal text.

## Per-screen verdicts (both time states, both widths)
| Screen | File | Verdict |
|---|---|---|
| Morning @ 390 | `p43-morning-390.png` | **PASS.** Dawn image full-screen; dark "Good morning, Aarav!" readable; tabs + task cards legible; clean (no error toast). |
| Morning @ 1440 | `p43-morning-1440.png` | **PASS.** Image covers the wide viewport edge-to-edge, no gaps/distortion; dark text readable. |
| Night @ 390 | `p43-night-390.png` | **PASS.** Starry dusk full-screen; white greeting readable over the subtle scrim (stars/moon visible around it); white sign-out clear on the mountains. |
| Night @ 1440 | `p43-night-1440.png` | **PASS.** Covers edge-to-edge; white text + scrim readable. |

## Person wall — unchanged
No logic touched; the `/kid` render is the only diff. Re-confirmed: phase-35 (42/42),
-36 (22/22), -37 (33/33), -38 (17/17), -39 (34/34) all pass; permission regression 56/56.

## Fix folded in (same screen, surfaced by verification)
`greeting()`/`sunEmoji()` used `new Date().getHours()` during SSR *and* client render —
a latent hydration mismatch (server UTC vs client local) that fired a "1 error" toast on
`/person` in production whenever the two landed in different greeting buckets. Made them
client-only (mount-gated), the same SSR-safe pattern as the background. Confirmed gone.

## Judgment
Full-screen cover ✓ · safe-area respected ✓ · time switch (local, Date-based) ✓ ·
text adapts + ≥4.5 on both ✓ · person wall unchanged ✓ · only `/person` changed.
