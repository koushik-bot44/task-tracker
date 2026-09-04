import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const IDS = process.argv.slice(2);

async function main() {
  const rows = await prisma.task.findMany({
    where: { id: { in: IDS } },
    include: { project: { select: { slug: true } } },
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = `screenshots/evidence-${stamp}.json`;
  writeFileSync(file, JSON.stringify(rows, null, 2), "utf8");
  console.log(`evidence: ${file}`);
  for (const r of rows) {
    console.log(
      `${r.id}\n  project=${r.project?.slug ?? "(private)"} title=${JSON.stringify(r.title)}\n` +
        `  status=${r.status} parentId=${r.parentId} orderKey=${r.orderKey}\n` +
        `  createdAt=${r.createdAt.toISOString()} updatedAt=${r.updatedAt.toISOString()}\n` +
        `  assigneeId=${r.assigneeId} dueDate=${r.dueDate?.toISOString() ?? null}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
