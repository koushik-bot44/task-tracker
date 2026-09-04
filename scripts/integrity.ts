/**
 * Fingerprints every task outside the disposable rig sandbox, so any change
 * to real data during a rig run is provable rather than argued about.
 *
 *   npm run integrity            -> screenshots/integrity-<utc>.json
 *   npm run integrity -- anchor  -> same, tagged in the ledger
 *
 * Written because a previous rig silently completed twelve tasks and
 * reparented three others, and a row count did not notice.
 *
 * SNAPSHOTS live in records/snapshots/, not screenshots/. They were beside the
 * captures until `clean:shots` was introduced, which then deleted them before
 * every matrix run — so by the time a hash moved there was nothing left to diff
 * it against. A snapshot is evidence, not capture output.
 *
 * The LEDGER lives in records/, not screenshots/. It used to sit beside the
 * snapshots in a gitignored folder, and clearing that folder destroyed the
 * whole chain of custody — the one file whose entire job is to survive. The
 * per-run JSON stays in screenshots/ (disposable); the ledger is tracked.
 *
 * Filenames carry a UTC timestamp and every run appends to a ledger, because
 * fixed names meant `before` and `after` overwrote each other run to run: a
 * later session's baseline destroyed the previous session's closing snapshot,
 * and the gap between them became unprovable.
 *
 * WIDENED after phase 5. The original six fields were chosen in phase 4, when
 * assignees, estimated-completion dates, tool descriptions and leads did not
 * exist. During the phase-5 review the hash reported a byte-match while the
 * owner had just assigned two tool leads and posted two tool notes — the
 * instrument said "nothing changed" about changes it could not see, which is
 * the same failure as the row count that missed twelve completions.
 *
 * Two hashes now: `tasks` keeps the original six fields so the historical
 * series stays comparable, and `full` covers everything phase 5 added. A
 * ledger line carries both.
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();
const SANDBOX_SLUG = "rig-sandbox";

async function main() {
  const label = process.argv[2] ?? "snapshot";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const projects = await prisma.project.findMany({
    where: { NOT: { slug: SANDBOX_SLUG } },
    select: { id: true, slug: true },
  });

  const rows = await prisma.task.findMany({
    where: { projectId: { in: projects.map((p) => p.id) } },
    select: {
      id: true,
      parentId: true,
      status: true,
      orderKey: true,
      completedById: true,
      deletedAt: true,
      // Phase 5 additions — invisible to the original fingerprint.
      assigneeId: true,
      dueDate: true,
      dueProvisional: true,
    },
    orderBy: { id: "asc" },
  });

  const tools = await prisma.project.findMany({
    where: { NOT: { slug: SANDBOX_SLUG } },
    select: { id: true, slug: true, description: true, leadId: true },
    orderBy: { id: "asc" },
  });

  /* Restructure: a project note is a Comment row with targetType PROJECT
     (targetId = the project). Only the `full` hash sees these; the historical
     6-field task fingerprint below is untouched. */
  const notes = await prisma.comment.findMany({
    where: { targetType: "PROJECT" },
    select: { id: true, targetId: true, authorId: true, body: true },
    orderBy: { id: "asc" },
  });

  /* The original six fields, unchanged, so every prior ledger line stays
     comparable. Do not add to this shape. */
  const snapshot = rows.map((r) => ({
    id: r.id,
    parentId: r.parentId,
    status: r.status,
    orderKey: r.orderKey,
    completedById: r.completedById,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }));

  const full = {
    tasks: rows.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      status: r.status,
      orderKey: r.orderKey,
      completedById: r.completedById,
      deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
      assigneeId: r.assigneeId,
      dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      dueProvisional: r.dueProvisional,
    })),
    tools,
    projectNotes: notes,
  };

  const json = JSON.stringify(snapshot, null, 2);
  const hash = createHash("sha256").update(json).digest("hex");
  const fullJson = JSON.stringify(full, null, 2);
  const fullHash = createHash("sha256").update(fullJson).digest("hex");

  await mkdir(path.join("records", "snapshots"), { recursive: true });
  const file = `integrity-${stamp}.json`;
  await writeFile(path.join("records", "snapshots", file), json, "utf8");
  const fullFile = `integrity-full-${stamp}.json`;
  await writeFile(path.join("records", "snapshots", fullFile), fullJson, "utf8");

  // The ledger is the chain of custody: one line per run, append-only, so a
  // later snapshot can always be diffed against whatever preceded it.
  await appendFile(
    path.join("records", "integrity-ledger.txt"),
    `${new Date().toISOString()}\t${label}\t${snapshot.length}\t${hash}\t${file}\n`,
    "utf8",
  );

  console.log(`projects fingerprinted: ${projects.map((p) => p.slug).join(", ")}`);
  console.log(`tasks: ${snapshot.length}`);
  console.log(`tasks sha256 (6-field, historical): ${hash}`);
  console.log(`full  sha256 (+assignee/date/tools/notes): ${fullHash}`);
  console.log(`tools: ${tools.length}, project notes: ${notes.length}`);
  console.log(`files: records/snapshots/${file}`);
  console.log(`       records/snapshots/${fullFile}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
