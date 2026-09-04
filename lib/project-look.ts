/**
 * A project's look (owner, 2026-09-04: "keep an option for the project — we
 * can add the logo"). A project carries a colour, an icon name, and optionally
 * an uploaded logo. The colour and icon are user data, like a Face's hue, so
 * the palette lives here rather than in the theme tokens.
 */

export const PROJECT_COLORS = [
  { hex: "#2563eb", name: "Blue" },
  { hex: "#0ea5e9", name: "Sky" },
  { hex: "#14b8a6", name: "Teal" },
  { hex: "#22c55e", name: "Green" },
  { hex: "#eab308", name: "Yellow" },
  { hex: "#f97316", name: "Orange" },
  { hex: "#ef4444", name: "Red" },
  { hex: "#ec4899", name: "Pink" },
  { hex: "#8b5cf6", name: "Violet" },
  { hex: "#64748b", name: "Slate" },
] as const;

/** The icons a project may wear, by their stored name. */
export const PROJECT_ICON_NAMES = [
  "rocket",
  "globe",
  "smartphone",
  "monitor",
  "shopping-cart",
  "briefcase",
  "megaphone",
  "book-open",
  "wrench",
  "building-2",
  "car",
  "heart",
  "camera",
  "music",
  "palette",
  "truck",
  "webhook",
  "line-chart",
  "users",
  "calendar",
  "file-text",
  "coffee",
  "leaf",
  "star",
] as const;
export type ProjectIconName = (typeof PROJECT_ICON_NAMES)[number];

function hexToHue(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 220;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  return h < 0 ? h + 360 : h;
}

/**
 * The tile behind a project's icon or initial: a pastel of the project's hue
 * with a dark ink of the same hue — the same recipe as a Face, so the two
 * sit together and the ink always clears 4.5:1 on the tile.
 */
export function tileColors(hex: string): { bg: string; fg: string } {
  const h = hexToHue(hex) ?? 220;
  return { bg: `hsl(${h} 55% 88%)`, fg: `hsl(${h} 45% 28%)` };
}

/** A dot in the project's own colour (for pickers). */
export function isProjectColor(hex: string): boolean {
  return PROJECT_COLORS.some((c) => c.hex.toLowerCase() === hex.toLowerCase());
}
