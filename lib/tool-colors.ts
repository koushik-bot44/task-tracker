/**
 * The liveliness engine. A tool's colour drives its ring, its sidebar dot, its
 * badges and its board accent, so a Home full of tools reads as a colourful
 * grid rather than a list of grey boxes.
 *
 * This is the one file allowed to hold literal hues: they are per-tool data
 * stored on the row, not theme tokens, and they must stay identical in both
 * themes so a tool is recognisable either way.
 */
export type ToolColor = { name: string; value: string };

export const TOOL_COLORS: ToolColor[] = [
  { name: "Blue", value: "#3672f8" },
  { name: "Orange", value: "#ff7a45" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Pink", value: "#ec4899" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Green", value: "#22c55e" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Sky", value: "#0ea5e9" },
];

/** Deterministic pick, so a tool created without a choice still looks intentional. */
export function defaultToolColor(index: number): string {
  return TOOL_COLORS[index % TOOL_COLORS.length].value;
}

/**
 * A translucent wash of the tool's own colour, for card accents and ring
 * tracks. Kept as a helper so no component hand-rolls an alpha string.
 */
export function toolTint(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}
