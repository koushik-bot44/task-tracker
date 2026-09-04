/**
 * WCAG contrast audit over the real token values, parsed straight out of
 * globals.css so the table can never drift from the stylesheet.
 *
 *   npm run contrast
 *
 * Thresholds: 4.5 for body text, 3.0 for large text and UI glyphs, and a
 * pragmatic 1.2 for hairlines — a border only has to be findable.
 */
import { readFileSync } from "node:fs";

type Rgb = { r: number; g: number; b: number };

function parseTheme(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const block = css.slice(open + 1, close);

  const tokens: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const match = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i);
    if (match) tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

type Rgba = Rgb & { a: number };

function toRgba(value: string): Rgba | null {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }

  // rgb(54 114 248 / 0.12) and rgba(54, 114, 248, 0.12)
  const fn = value.match(
    /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[/,]\s*([\d.]+)\s*)?\)$/i,
  );
  if (fn) {
    return {
      r: Number(fn[1]),
      g: Number(fn[2]),
      b: Number(fn[3]),
      a: fn[4] === undefined ? 1 : Number(fn[4]),
    };
  }
  return null;
}

/** Composite a translucent colour onto an opaque one. */
function flatten(top: Rgba, base: Rgb): Rgb {
  return {
    r: Math.round(top.r * top.a + base.r * (1 - top.a)),
    g: Math.round(top.g * top.a + base.g * (1 - top.a)),
    b: Math.round(top.b * top.a + base.b * (1 - top.a)),
  };
}

function toRgb(value: string): Rgb | null {
  const c = toRgba(value);
  return c && c.a === 1 ? { r: c.r, g: c.g, b: c.b } : null;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Pairs actually rendered by the UI (restructure, 2026-09), with the bar each
 * has to clear. Every token named here exists in globals.css `:root`.
 *
 * Soft tints are translucent, so a chip's real backdrop is the tint composited
 * over whatever sits behind it. `over` names that base and the tint is flattened
 * against it before measuring — otherwise pastel chips get graded against a
 * colour nobody ever sees.
 */
const PAIRS: Array<{
  fg: string;
  bg: string;
  min: number;
  what: string;
  over?: string;
}> = [
  // Body and secondary text on the page, a card, and the rail.
  { fg: "--ink", bg: "--bg", min: 4.5, what: "body text on page" },
  { fg: "--ink", bg: "--surface", min: 4.5, what: "body text on card" },
  { fg: "--ink", bg: "--surface-2", min: 4.5, what: "body text on rail" },
  { fg: "--muted", bg: "--bg", min: 4.5, what: "secondary text on page" },
  { fg: "--muted", bg: "--surface", min: 4.5, what: "secondary text on card" },
  { fg: "--muted", bg: "--surface-2", min: 4.5, what: "secondary text on rail" },

  // A hue used as text sits on a card.
  { fg: "--primary-ink", bg: "--surface", min: 4.5, what: "primary text on card" },
  { fg: "--ok-ink", bg: "--surface", min: 4.5, what: "done text on card" },
  { fg: "--info-ink", bg: "--surface", min: 4.5, what: "to-do text on card" },
  { fg: "--danger-ink", bg: "--surface", min: 4.5, what: "stuck / overdue text on card" },
  { fg: "--warn-ink", bg: "--surface", min: 4.5, what: "needs-work text on card" },

  // Status chips: hue-ink on a 10-14% tint of the same hue, over a card...
  { fg: "--primary-ink", bg: "--primary-soft", over: "--surface", min: 4.5, what: "chip on card: doing" },
  { fg: "--ok-ink", bg: "--ok-soft", over: "--surface", min: 4.5, what: "chip on card: done" },
  { fg: "--info-ink", bg: "--info-soft", over: "--surface", min: 4.5, what: "chip on card: to do" },
  { fg: "--danger-ink", bg: "--danger-soft", over: "--surface", min: 4.5, what: "chip on card: stuck" },
  { fg: "--warn-ink", bg: "--warn-soft", over: "--surface", min: 4.5, what: "chip on card: needs work" },

  // ...and the same chips on the page backdrop. A tint flattens against the
  // tinted page differently than against white, so each is its own pair.
  { fg: "--primary-ink", bg: "--primary-soft", over: "--bg", min: 4.5, what: "chip on page: doing" },
  { fg: "--ok-ink", bg: "--ok-soft", over: "--bg", min: 4.5, what: "chip on page: done" },
  { fg: "--info-ink", bg: "--info-soft", over: "--bg", min: 4.5, what: "chip on page: to do" },
  { fg: "--danger-ink", bg: "--danger-soft", over: "--bg", min: 4.5, what: "chip on page: stuck" },
  { fg: "--warn-ink", bg: "--warn-soft", over: "--bg", min: 4.5, what: "chip on page: needs work" },

  // Solid fills. Primary is the only one dark enough to carry white; the
  // brighter hues carry ink instead.
  { fg: "--on-primary", bg: "--primary", min: 4.5, what: "label on primary button" },
  { fg: "--on-fill", bg: "--ok", min: 3.0, what: "label on done fill" },
  { fg: "--on-fill", bg: "--danger", min: 3.0, what: "label on stuck fill" },
  { fg: "--on-fill", bg: "--warn", min: 3.0, what: "label on needs-work fill" },
  { fg: "--on-fill", bg: "--info", min: 3.0, what: "label on to-do fill" },
  { fg: "--on-fill", bg: "--accent", min: 3.0, what: "label on accent fill" },

  // Standalone dots and glyphs use the ink variant, so a 6px circle is still
  // findable against white.
  { fg: "--primary", bg: "--surface", min: 3.0, what: "primary dot / focus ring" },
  { fg: "--ok-ink", bg: "--surface", min: 3.0, what: "done dot" },
  { fg: "--warn-ink", bg: "--surface", min: 3.0, what: "needs-work dot" },
  { fg: "--danger-ink", bg: "--surface", min: 3.0, what: "stuck dot" },
  { fg: "--info-ink", bg: "--surface", min: 3.0, what: "to-do dot" },

  // Hairlines only have to be findable. `--line` is documented in globals.css
  // as "dividers inside a card and input edges only", so its backdrop is the
  // card; the page-level rule is `--guide`. (`--line` on `--bg` measures 1.15 —
  // below the bar, and not a pair the app draws.)
  { fg: "--line", bg: "--surface", min: 1.2, what: "hairline on card" },
  { fg: "--guide", bg: "--bg", min: 1.2, what: "guide line on page" },

  // The tooltip is an inverted surface; its text cannot use --ink/--muted.
  { fg: "--on-ink", bg: "--ink", min: 4.5, what: "tooltip: primary text" },
  { fg: "--on-ink-muted", bg: "--ink", min: 4.5, what: "tooltip: secondary text" },
];

/* One theme: a single set of values behind every pair. */
const css = readFileSync("app/globals.css", "utf8");
const tokens = parseTheme(css, ":root");

let failures = 0;
const rows: string[] = [];

rows.push("| Pair | What | Min | Ratio | |");
rows.push("|---|---|---|---|---|");

for (const pair of PAIRS) {
  const fg = toRgb(tokens[pair.fg] ?? pair.fg);

  const rawBg = toRgba(tokens[pair.bg] ?? pair.bg);
  const over = pair.over ? toRgb(tokens[pair.over] ?? pair.over) : null;
  const bg =
    rawBg && rawBg.a < 1
      ? over
        ? flatten(rawBg, over)
        : null
      : rawBg
        ? { r: rawBg.r, g: rawBg.g, b: rawBg.b }
        : null;

  if (!fg || !bg) {
    failures++;
    rows.push(
      `| \`${pair.fg}\` on \`${pair.bg}\` | ${pair.what} | ${pair.min.toFixed(1)} | — | **MISSING TOKEN** |`,
    );
    continue;
  }

  const r = ratio(fg, bg);
  const ok = r >= pair.min;
  if (!ok) failures++;

  rows.push(
    `| \`${pair.fg}\` on \`${pair.bg}\` | ${pair.what} | ${pair.min.toFixed(1)} | ${r.toFixed(2)} | ${ok ? "PASS" : "**FAIL**"} |`,
  );
}

console.log(rows.join("\n"));
console.log(
  failures === 0
    ? `\nAll ${PAIRS.length} pairs pass.`
    : `\n${failures} FAILING pair(s).`,
);
process.exit(failures === 0 ? 0 : 1);
