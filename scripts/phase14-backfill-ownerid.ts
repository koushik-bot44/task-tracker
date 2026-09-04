/**
 * Phase-14 ownerId backfill (the one data step). Project has no createdById
 * column, so "owner = creator" is not available; every pre-phase-14 tool has
 * been run by the single manager, who is therefore its natural owner. This
 * sets Project.ownerId = the sole active manager for every project that has no
 * owner yet, so existing tools stay visible to that manager under the new
 * per-owner silo.
 *
 * Dumps the full before-state as evidence first. Idempotent: only touches
 * projects whose ownerId IS NULL, so it is safe to re-run as a post-deploy
 * sweep for anything created in the window.
 *
 *   npx tsx --env-file=.env scripts/phase14-backfill-ownerid.ts
 */
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const managers = await prisma.user.findMany({
    where: { role: "MANAGER", disabledAt: null, status: "ACTIVE" },
    select: { id: true, name: true },
  });
  if (managers.length !== 1) {
    console.error(`Expected exactly ONE active manager to own legacy tools; found ${managers.length}. Aborting — decide ownership by hand.`);
    console.error(JSON.stringify(managers));
    await prisma.$disconnect();
    process.exit(1);
  }
  const owner = managers[0];

  const before = await prisma.project.findMany({
    select: { id: true, name: true, slug: true, ownerId: true },
    orderBy: { id: "asc" },
  });
  const toBackfill = before.filter((p) => p.ownerId === null);

  await mkdir(path.join("records", "snapshots"), { recursive: true });
  const file = path.join("records", "snapshots", `phase14-ownerid-backfill-${stamp}.json`);
  await writeFile(
    file,
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        note: "Project has no createdById; the sole active manager owns all legacy tools. Before-state below; ownerId set to the manager for every null-owner project.",
        chosenOwner: owner,
        projectsBefore: before,
        backfilledCount: toBackfill.length,
      },
      null,
      2,
    ),
    "utf8",
  );

  const result = await prisma.project.updateMany({
    where: { ownerId: null },
    data: { ownerId: owner.id },
  });

  const remaining = await prisma.project.count({ where: { ownerId: null } });
  console.log(`sole manager (owner): ${owner.name} (${owner.id})`);
  console.log(`projects total: ${before.length} | had no owner: ${toBackfill.length}`);
  console.log(`backfilled: ${result.count} | remaining null-owner (must be 0): ${remaining}`);
  console.log(`evidence: ${file}`);

  await prisma.$disconnect();
  if (remaining !== 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
