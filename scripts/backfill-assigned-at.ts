/* Fill in when a task was handed to its holder (2026-09-09).
 *   npx tsx --env-file=.env.local scripts/backfill-assigned-at.ts        (local)
 *   npx tsx --env-file=.env      scripts/backfill-assigned-at.ts        (production)
 *   … --dry   to see what would change
 *
 * Task.assignedAt arrived after these records did, and anything assigned while
 * the older build was serving never stamped it — so the Assigned column reads
 * blank. The activity stream knows the true moment: the last time the holder
 * changed. Where the stream has nothing, the task was assigned as it was
 * raised, so its own creation time stands.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const dry = process.argv.includes("--dry");
  const tasks = await prisma.task.findMany({
    where: { deletedAt: null, assigneeId: { not: null }, assignedAt: null },
    select: { id: true, number: true, title: true, createdAt: true },
  });
  console.log(`${tasks.length} tasks hold somebody but have no assigned date`);

  let fromTrail = 0;
  let fromCreation = 0;

  for (const t of tasks) {
    // The last time "Assigned to" changed is when the current holder got it.
    const change = await prisma.taskActivity.findFirst({
      where: { taskId: t.id, type: "FIELD_CHANGE" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, metadata: true },
    });
    const field = (change?.metadata as { field?: string } | null)?.field;
    const when = field === "assigneeId" && change ? change.createdAt : t.createdAt;
    if (field === "assigneeId" && change) fromTrail++;
    else fromCreation++;
    if (!dry) await prisma.task.update({ where: { id: t.id }, data: { assignedAt: when } });
  }

  console.log(`${fromTrail} dated from the activity trail, ${fromCreation} from when the task was raised${dry ? " (dry run — nothing written)" : ""}`);
  const left = await prisma.task.count({ where: { deletedAt: null, assigneeId: { not: null }, assignedAt: null } });
  console.log(`still without an assigned date: ${left}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
