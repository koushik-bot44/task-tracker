/**
 * Diffs the two integrity snapshots row by row. Standing incident rule: when
 * the hash moves, every changed row gets named and attributed before anything
 * is concluded or repaired.
 */
import { readFileSync } from "node:fs";

type Row = {
  id: string;
  parentId: string | null;
  status: string;
  orderKey: string;
  completedById: string | null;
  deletedAt: string | null;
};

// Snapshots are timestamped now (fixed names let one session's baseline
// overwrite the previous session's closing shot), so take them as arguments.
const [beforePath, afterPath] = process.argv.slice(2);
const before: Row[] = JSON.parse(
  readFileSync(beforePath ?? "screenshots/integrity-before.json", "utf8"),
);
const after: Row[] = JSON.parse(
  readFileSync(afterPath ?? "screenshots/integrity-after.json", "utf8"),
);

const byIdBefore = new Map(before.map((r) => [r.id, r]));
const byIdAfter = new Map(after.map((r) => [r.id, r]));

const added = after.filter((r) => !byIdBefore.has(r.id));
const removed = before.filter((r) => !byIdAfter.has(r.id));
const changed = after.filter((r) => {
  const old = byIdBefore.get(r.id);
  return old && JSON.stringify(old) !== JSON.stringify(r);
});

console.log(
  `before: ${before.length} rows   after: ${after.length} rows`,
);
console.log(
  `added: ${added.length}   removed: ${removed.length}   changed: ${changed.length}\n`,
);

for (const r of added) console.log(`ADDED   ${r.id}  status=${r.status}  parent=${r.parentId}`);
for (const r of removed) console.log(`REMOVED ${r.id}  status=${r.status}`);
for (const r of changed) {
  const old = byIdBefore.get(r.id)!;
  console.log(`CHANGED ${r.id}`);
  for (const k of ["parentId", "status", "orderKey", "completedById", "deletedAt"] as const) {
    if (old[k] !== r[k]) console.log(`    ${k}: ${old[k]} -> ${r[k]}`);
  }
}
