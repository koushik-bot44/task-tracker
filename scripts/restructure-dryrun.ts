/* Run the restructure migration inside BEGIN…ROLLBACK against the DB in
 * DATABASE_URL, print the audit counts, and roll back. Nothing persists.
 * Usage: npx tsx --env-file=.env.local scripts/restructure-dryrun.ts */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();
const SQL = readFileSync("prisma/migrations/20260904120000_restructure/migration.sql", "utf8");

function statements(sql: string): string[] {
  const noComments = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  return noComments.split(";").map((s) => s.trim()).filter(Boolean);
}

class Rollback extends Error {}

async function main() {
  const stmts = statements(SQL);
  console.log(`statements: ${stmts.length}`);
  const audit: Record<string, unknown> = {};
  try {
    await prisma.$transaction(
      async (tx) => {
        // --audit-only: print the counts against the CURRENT schema (after apply).
        if (!process.argv.includes("--audit-only")) for (const s of stmts) await tx.$executeRawUnsafe(s);
        const q = async (label: string, sql: string) => {
          const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(sql);
          audit[label] = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v])));
        };
        await q("usersPlaced", `SELECT count(*)::int AS placed FROM "User" WHERE "departmentId" IS NOT NULL`);
        await q("usersNotPlaced", `SELECT name, role FROM "User" WHERE "departmentId" IS NULL AND role <> 'PERSON' ORDER BY name`);
        await q("usersByDepartment", `SELECT d.name, count(u.id)::int AS people FROM "Department" d LEFT JOIN "User" u ON u."departmentId" = d.id GROUP BY d.name ORDER BY d.name`);
        await q("tasksByStatus", `SELECT status, count(*)::int AS n FROM "Task" GROUP BY status ORDER BY status`);
        await q("tasksImportant", `SELECT count(*)::int AS n FROM "Task" WHERE important`);
        await q("tasksArchived", `SELECT count(*)::int AS n FROM "Task" WHERE archived`);
        await q("projects", `SELECT name, status, "startDate", progress FROM "Project" ORDER BY name`);
        await q("comments", `SELECT "targetType", count(*)::int AS n FROM "Comment" GROUP BY "targetType"`);
        await q("membersCanManage", `SELECT count(*)::int AS n FROM "ProjectMember" WHERE "canManage"`);
        await q("milestones", `SELECT count(*)::int AS n FROM "Milestone"`);
        await q("attendeesReplied", `SELECT count(*)::int AS n FROM "EventAttendee" WHERE response IS NOT NULL`);
        await q("droppedTables", `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('TaskNote','ProjectNote','ProjectManager')`);
        if (!process.argv.includes("--audit-only")) throw new Rollback("rollback");
      },
      { timeout: 60_000 },
    );
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  console.log(JSON.stringify(audit, null, 2));
  console.log(process.argv.includes("--audit-only") ? "AUDIT ONLY — no statements run" : "ROLLED BACK — nothing persisted");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
