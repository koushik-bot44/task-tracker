/**
 * GROUP_TINTS (phase 15) — the soft background bands a task's editor can drop
 * behind a parent and its whole subtree so a group's extent reads at a glance.
 *
 * These are DATA, not theme tokens: the chosen key is stored on Task.groupColor
 * and the same literal hue must render identically wherever the task appears, so
 * they live here as fixed hexes (the intentional hex exception in the close
 * greps) rather than as CSS variables — the app has a single light theme.
 *
 * Every tint is a very light, low-saturation pastel (L ~ 95–97%) chosen so the
 * row's own `text-ink` and `text-muted` both clear the 4.5 contrast bar against
 * the band; that pairing is verified in the contrast sweep.
 */
export type GroupTint = { key: string; name: string; bg: string };

export const GROUP_TINTS: GroupTint[] = [
  { key: "rose", name: "Rose", bg: "#fdeef1" },
  { key: "amber", name: "Amber", bg: "#fbf1e2" },
  { key: "lime", name: "Lime", bg: "#eef6e3" },
  { key: "teal", name: "Teal", bg: "#e3f4ef" },
  { key: "sky", name: "Sky", bg: "#e7f1fc" },
  { key: "violet", name: "Violet", bg: "#efecfa" },
  { key: "plum", name: "Plum", bg: "#f8ecf4" },
  { key: "slate", name: "Slate", bg: "#e9edf5" },
];

const BY_KEY = new Map(GROUP_TINTS.map((t) => [t.key, t]));

/** True if `key` names a real tint — the write path rejects anything else. */
export function isGroupTint(key: string): boolean {
  return BY_KEY.has(key);
}

/** The band colour for a stored key, or null for "no colour" / an unknown key. */
export function groupTintBg(key: string | null | undefined): string | null {
  if (!key) return null;
  return BY_KEY.get(key)?.bg ?? null;
}
