"use client";

/**
 * The Well Being background (phase 44) — SHARED by the person /kid screen and the
 * manager Well Being tab (phase 46). A full-screen, code-rendered "soft 3D" dawn/dusk
 * scene: NO image assets, NO 3D libs — a multi-stop gradient sky, a warm glow, a
 * glowing sun (day) / crescent moon + soft stars (night), drifting clouds, and three
 * receding, shadowed hill layers that imply depth. Because it's all CSS + inline SVG
 * it scales to ANY container perfectly — no fixed aspect ratio, no gaps, no distortion.
 * Motion is slow, transform/opacity-only, and freezes under prefers-reduced-motion.
 * It fills its positioned ancestor (`absolute inset-0`) — on both screens that ancestor
 * is a STICKY, one-viewport `.wb-scene` backdrop layer, so the scene stays pinned and
 * fully composed while the (tall) content scrolls over it, rather than scrolling away.
 *
 * Colours here are intentional scene gradient stops (hex), documented as such.
 */
export function WellBeingScene({ night }: { night: boolean }) {
  return (
    <div
      aria-hidden
      className="psx-root pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: 0, background: night ? NIGHT_SKY : DAY_SKY }}
    >
      {/* Soft directional glow near the horizon. */}
      <div className="absolute inset-0" style={{ background: night ? NIGHT_GLOW : DAY_GLOW }} />

      {night ? (
        <>
          {/* Crescent moon (carved by an inset box-shadow) + soft halo. */}
          <div className="psx-anim psx-shimmer absolute" style={{ left: "72%", top: "9%", width: "clamp(46px,9vw,86px)", aspectRatio: "1", borderRadius: "50%", boxShadow: "inset -14px 8px 3px 1px rgba(233,238,250,0.96), 0 0 44px 10px rgba(210,220,255,0.28)" }} />
          {STARS.map((s, i) => (
            <span
              key={i}
              className="psx-anim psx-twinkle absolute rounded-full"
              style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.r, height: s.r, background: "#eef2ff", animationDelay: `${s.d}s`, opacity: 0.6 }}
            />
          ))}
        </>
      ) : (
        <>
          {/* Sun: a soft warm disc with a large blurred halo. */}
          <div className="absolute" style={{ left: "70%", top: "10%", width: "clamp(120px,26vw,240px)", aspectRatio: "1", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,247,224,0.9) 0%, rgba(255,214,150,0.5) 34%, rgba(255,214,150,0) 68%)", filter: "blur(2px)" }} />
          <div className="psx-anim psx-shimmer absolute" style={{ left: "74%", top: "13%", width: "clamp(52px,11vw,104px)", aspectRatio: "1", borderRadius: "50%", background: "radial-gradient(circle, #fffaf0 0%, #ffe6b0 60%, #ffd98a 100%)", boxShadow: "0 0 60px 18px rgba(255,222,160,0.45)" }} />
          {CLOUDS.map((c, i) => (
            <div
              key={i}
              className={`psx-anim ${c.dir === 1 ? "psx-drift-a" : "psx-drift-b"} absolute rounded-full`}
              style={{ left: `${c.x}%`, top: `${c.y}%`, width: c.w, height: c.h, background: "rgba(255,255,255,0.55)", filter: `blur(${c.b}px)`, animationDelay: `${c.d}s` }}
            />
          ))}
        </>
      )}

      {/* Three receding hill layers — hazier + higher = further back. Each floats
          slowly for a gentle parallax. SVG stretches to any width (no distortion
          that matters for soft abstract hills). */}
      {HILLS.map((h, i) => (
        <svg
          key={i}
          className={`psx-anim psx-float-${i} absolute bottom-0 left-0 w-full`}
          style={{ height: h.height, filter: `drop-shadow(0 -6px 14px rgba(0,0,0,${night ? 0.28 : 0.12}))`, opacity: h.opacity }}
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path d={h.d} fill={night ? h.night : h.day} />
        </svg>
      ))}

      <style>{SCENE_CSS}</style>
    </div>
  );
}

/* ── Palettes (intentional scene gradient stops) ─────────────────────────── */
const DAY_SKY = "linear-gradient(180deg, #9db9e8 0%, #bcc7ea 24%, #dcccdf 48%, #f0d3d1 72%, #fbe6d2 100%)";
const NIGHT_SKY = "linear-gradient(180deg, #0a1330 0%, #121d45 34%, #22234e 64%, #34285c 100%)";
const DAY_GLOW = "radial-gradient(60% 46% at 20% 90%, rgba(255,226,182,0.85) 0%, rgba(255,226,182,0) 68%)";
const NIGHT_GLOW = "radial-gradient(55% 42% at 20% 84%, rgba(150,120,214,0.34) 0%, rgba(150,120,214,0) 70%)";

const STARS = [
  { x: 10, y: 12, r: 3, d: 0 }, { x: 20, y: 26, r: 2, d: 1.4 }, { x: 33, y: 8, r: 2, d: 2.6 },
  { x: 44, y: 20, r: 3, d: 0.7 }, { x: 55, y: 30, r: 2, d: 3.1 }, { x: 30, y: 40, r: 2, d: 1.9 },
  { x: 88, y: 30, r: 2, d: 2.2 }, { x: 92, y: 16, r: 3, d: 0.4 }, { x: 64, y: 12, r: 2, d: 2.9 },
  { x: 15, y: 46, r: 2, d: 1.1 }, { x: 82, y: 44, r: 3, d: 3.4 }, { x: 50, y: 6, r: 2, d: 1.6 },
] as const;

const CLOUDS = [
  { x: 8, y: 30, w: "34vw", h: "7vw", b: 22, dir: 1, d: 0 },
  { x: 58, y: 44, w: "40vw", h: "8vw", b: 26, dir: -1, d: 4 },
  { x: 34, y: 20, w: "26vw", h: "6vw", b: 20, dir: 1, d: 8 },
] as const;

const HILLS = [
  { height: "42vh", opacity: 0.9, day: "#d7c3dc", night: "#2a2c5e", d: "M0,150 C260,90 520,180 760,140 C1000,100 1220,170 1440,130 L1440,320 L0,320 Z" },
  { height: "34vh", opacity: 0.95, day: "#c7add6", night: "#20244f", d: "M0,190 C300,140 560,210 820,175 C1080,140 1260,200 1440,170 L1440,320 L0,320 Z" },
  { height: "26vh", opacity: 1, day: "#b79ccb", night: "#171d40", d: "M0,235 C280,200 600,255 900,225 C1150,200 1300,240 1440,220 L1440,320 L0,320 Z" },
] as const;

const SCENE_CSS = `
.psx-root .psx-anim { will-change: transform, opacity; }
@keyframes psx-drift-a { from { transform: translate3d(-4%,0,0); } to { transform: translate3d(6%,0,0); } }
@keyframes psx-drift-b { from { transform: translate3d(5%,0,0); } to { transform: translate3d(-5%,0,0); } }
@keyframes psx-twinkle { 0%,100% { opacity: .3; } 50% { opacity: .95; } }
@keyframes psx-shimmer { 0%,100% { opacity: .92; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }
@keyframes psx-float { 0%,100% { transform: translate3d(0,0,0); } 50% { transform: translate3d(0,-1.4%,0); } }
.psx-drift-a { animation: psx-drift-a 34s ease-in-out infinite alternate; }
.psx-drift-b { animation: psx-drift-b 40s ease-in-out infinite alternate; }
.psx-twinkle { animation: psx-twinkle 4.5s ease-in-out infinite; }
.psx-shimmer { animation: psx-shimmer 9s ease-in-out infinite; }
.psx-float-0 { animation: psx-float 26s ease-in-out infinite; }
.psx-float-1 { animation: psx-float 22s ease-in-out infinite; animation-delay: -6s; }
.psx-float-2 { animation: psx-float 18s ease-in-out infinite; animation-delay: -3s; }
@media (prefers-reduced-motion: reduce) {
  .psx-root .psx-anim { animation: none !important; transform: none !important; }
}
`;
