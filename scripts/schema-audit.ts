/**
 * Post-migration audit. Proves the migration was additive against the live
 * database rather than against the SQL I intended to write.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const enums = await prisma.$queryRawUnsafe<{ typname: string; labels: string }[]>(`
    SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname IN ('Role','Status') GROUP BY t.typname`);
  for (const e of enums) console.log(`enum ${e.typname}: ${e.labels}`);

  const cols = await prisma.$queryRawUnsafe<
    { table_name: string; column_name: string; is_nullable: string; column_default: string | null }[]
  >(`
    SELECT table_name, column_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public'
      AND ((table_name='Project' AND column_name IN ('description','leadId'))
        OR (table_name='Task'    AND column_name = 'assigneeId'))
    ORDER BY table_name, column_name`);
  console.log("");
  for (const c of cols) {
    console.log(
      `${c.table_name}.${c.column_name}  nullable=${c.is_nullable}  default=${c.column_default ?? "none"}`,
    );
  }

  console.log("");
  console.log(`ProjectNote rows      : ${await prisma.projectNote.count()}`);
  console.log(`projects              : ${await prisma.project.count()}`);
  console.log(`projects w/ lead      : ${await prisma.project.count({ where: { leadId: { not: null } } })}`);
  console.log(`projects w/ empty desc: ${await prisma.project.count({ where: { description: "" } })}`);
  console.log(`tasks                 : ${await prisma.task.count()}`);
  console.log(`tasks w/ assignee     : ${await prisma.task.count({ where: { assigneeId: { not: null } } })}`);
  console.log(`tasks ON_HOLD         : ${await prisma.task.count({ where: { status: "ON_HOLD" } })}`);

  console.log("\nUSERS — must be untouched:");
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, disabledAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  for (const u of users) {
    console.log(`  ${u.role.padEnd(9)} ${u.email.padEnd(34)} ${u.id}  disabled=${u.disabledAt ? "yes" : "no"}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
