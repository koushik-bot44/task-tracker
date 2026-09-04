/**
 * CHANGE 4 data step (phase 11): a subtask never carries an assignee. Phase 11
 * rejects new subtask assignment in code, but rows created under earlier code
 * still carry one. This dumps every assigned subtask as evidence, then clears
 * the assignee. Run AFTER phase 11 is deployed, so no new ones can accrue.
 *
 * The rig sandbox is left alone (its slug is excluded), same as integrity.ts.
 *
 *   npx tsx --env-file=.env scripts/phase11-clear-subtask-assignees.ts
 */
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();
const SANDBOX_SLUG = "rig-sandbox";

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const realProjects = await prisma.project.findMany({
    where: { NOT: { slug: SANDBOX_SLUG } },
    select: { id: true },
  });
  const projectIds = realProjects.map((p) => p.id);

  // Every assigned subtask (parent != null, assignee != null), live or deleted,
  // so the invariant "no subtask carries an assignee" becomes absolute.
  const before = await prisma.task.findMany({
    where: { projectId: { in: projectIds }, parentId: { not: null }, assigneeId: { not: null } },
    select: {
      id: true,
      projectId: true,
      parentId: true,
      title: true,
      assigneeId: true,
      deletedAt: true,
    },
    orderBy: { id: "asc" },
  });

  await mkdir(path.join("records", "snapshots"), { recursive: true });
  const file = path.join("records", "snapshots", `phase11-subtask-assignee-clear-final-${stamp}.json`);
  await writeFile(
    file,
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        note: "CHANGE 4 final data step: assignees on subtasks cleared post-deploy. Prior state below for full reversibility.",
        count: before.length,
        rows: before.map((r) => ({ ...r, deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null })),
      },
      null,
      2,
    ),
    "utf8",
  );

  const result = await prisma.task.updateMany({
    where: { projectId: { in: projectIds }, parentId: { not: null }, assigneeId: { not: null } },
    data: { assigneeId: null },
  });

  const remaining = await prisma.task.count({
    where: { projectId: { in: projectIds }, parentId: { not: null }, assigneeId: { not: null } },
  });

  console.log(`assigned subtasks found: ${before.length}`);
  console.log(`  live:    ${before.filter((r) => r.deletedAt === null).length}`);
  console.log(`  deleted: ${before.filter((r) => r.deletedAt !== null).length}`);
  console.log(`cleared:  ${result.count}`);
  console.log(`remaining assigned subtasks (must be 0): ${remaining}`);
  console.log(`evidence: ${file}`);

  await prisma.$disconnect();
  if (remaining !== 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
