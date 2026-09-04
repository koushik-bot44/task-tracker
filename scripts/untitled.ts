/**
 * Enumerate (and optionally discard) tasks that never got a title.
 *
 * Read-only by default. Pass --apply to soft-delete.
 *
 * Safety cap: if more than MAX_DELETE rows match, this refuses to delete and
 * reports instead — that many empty tasks means the query is wrong, not that
 * the data is. Anything already soft-deleted is left alone, and the sandbox is
 * excluded so a rig artefact can never be mistaken for real data.
 */
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const MAX_DELETE = 15;
const APPLY = process.argv.includes("--apply");
const SANDBOX_SLUG = "rig-sandbox";

async function main() {
  const sandbox = await prisma.project.findUnique({
    where: { slug: SANDBOX_SLUG },
    select: { id: true },
  });

  const candidates = await prisma.task.findMany({
    where: {
      deletedAt: null,
      title: { in: ["", " "] },
      ...(sandbox ? { projectId: { not: sandbox.id } } : {}),
    },
    select: {
      id: true,
      title: true,
      projectId: true,
      parentId: true,
      createdAt: true,
      updatedAt: true,
      project: { select: { name: true, slug: true } },
      _count: { select: { children: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`untitled, not-deleted tasks: ${candidates.length}`);
  console.log(`safety cap                 : ${MAX_DELETE}`);
  console.log(`mode                       : ${APPLY ? "APPLY" : "report only"}`);
  console.log("");

  if (candidates.length === 0) {
    console.log("Nothing to discard.");
    return;
  }

  for (const t of candidates) {
    console.log(
      `  ${t.id}  ${(t.project?.slug ?? "(private)").padEnd(18)} children=${t._count.children}  ` +
        `created=${t.createdAt.toISOString()}`,
    );
  }

  // A task with children is not an abandoned stub — discarding it would orphan
  // real work. Those are reported and never touched.
  const withKids = candidates.filter((t) => t._count.children > 0);
  const discardable = candidates.filter((t) => t._count.children === 0);

  console.log("");
  console.log(`  discardable (no children): ${discardable.length}`);
  console.log(`  kept (has children)      : ${withKids.length}`);

  if (!APPLY) {
    console.log("\nReport only. Re-run with --apply to discard.");
    return;
  }

  if (discardable.length > MAX_DELETE) {
    console.log(
      `\nSTOP — ${discardable.length} rows exceeds the cap of ${MAX_DELETE}. ` +
        `That smells like a query bug. Nothing deleted.`,
    );
    process.exitCode = 1;
    return;
  }

  // Evidence before repair, every time — even when the repair is reversible
  // and planned. The full pre-state goes to disk before a single row changes.
  const ids = discardable.map((t) => t.id);
  const before = await prisma.task.findMany({ where: { id: { in: ids } } });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = `screenshots/untitled-discarded-${stamp}.json`;
  writeFileSync(file, JSON.stringify(before, null, 2), "utf8");
  console.log(`\nEvidence written: ${file} (${before.length} row(s))`);

  const now = new Date();
  const result = await prisma.task.updateMany({
    where: { id: { in: ids } },
    data: { deletedAt: now },
  });
  console.log(`Soft-deleted ${result.count} row(s) at ${now.toISOString()}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
