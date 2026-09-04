export type Gate = {
  key: string;
  label: string;
  done: boolean;
  at?: string | null;
};

/** Applied to every new project, and copied onto every task at creation. */
export const DEFAULT_GATE_TEMPLATE: Gate[] = [
  { key: "built", label: "Built", done: false },
  { key: "reviewed", label: "Reviewed", done: false },
  { key: "tested", label: "Tested", done: false },
  { key: "deployed", label: "Deployed", done: false },
  { key: "verified", label: "Verified", done: false },
];

/** Prisma hands back `Json`, which is `unknown`-shaped. Narrow it defensively. */
export function asGates(value: unknown): Gate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((g) => {
    if (!g || typeof g !== "object") return [];
    const rec = g as Record<string, unknown>;
    if (typeof rec.key !== "string" || typeof rec.label !== "string") return [];
    return [
      {
        key: rec.key,
        label: rec.label,
        done: rec.done === true,
        at: typeof rec.at === "string" ? rec.at : null,
      },
    ];
  });
}

export function freshGatesFromTemplate(template: unknown): Gate[] {
  const gates = asGates(template);
  const source = gates.length > 0 ? gates : DEFAULT_GATE_TEMPLATE;
  return source.map((g) => ({ key: g.key, label: g.label, done: false, at: null }));
}

export function openGateCount(gates: Gate[]): number {
  return gates.filter((g) => !g.done).length;
}

/**
 * Gate roles, redrawn in phase 11 (this supersedes the old "Reviewed is
 * manager-only" rule):
 *   - Built / Tested / Deployed / Reviewed are the team's — a TEAM_LEAD or
 *     DEVELOPER ticks them; a MANAGER does not.
 *   - Verified is the manager's sign-off; only a MANAGER ticks it.
 * The Review log closes on Verified now, not Reviewed.
 */
export const VERIFIED_GATE_KEY = "verified";
export const DEV_GATE_KEYS = ["built", "tested", "deployed", "reviewed"] as const;

/** Which gate keys had their `done` flipped between two versions. */
export function gateDoneChanges(before: Gate[], after: Gate[]): string[] {
  const was = new Map(before.map((g) => [g.key, g.done]));
  const changed: string[] = [];
  for (const g of after) {
    const prev = was.get(g.key);
    if (prev !== undefined && prev !== g.done) changed.push(g.key);
  }
  return changed;
}
