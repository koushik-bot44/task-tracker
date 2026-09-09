/* Run the work-model migration inside BEGIN…ROLLBACK against the DB in
 * DATABASE_URL, print the audit counts, and roll back. Nothing persists.
 *   npx tsx --env-file=.env.local scripts/work-model-dryrun.ts
 *   npx tsx --env-file=.env.local scripts/work-model-dryrun.ts --audit-only   (after apply)
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();
const SQL = readFileSync("prisma/migrations/20260909120000_work_model/migration.sql", "utf8");

function statements(sql: string): string[] {
  const noComments = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  return noComments.split(";").map((s) => s.trim()).filter(Boolean);
}

class Rollback extends Error {}

async function main() {
  const auditOnly = process.argv.includes("--audit-only");
  const stmts = statements(SQL);
  console.log(`statements: ${stmts.length}`);
  const audit: Record<string, unknown> = {};
  try {
    await prisma.$transaction(
      async (tx) => {
        if (!auditOnly) for (const s of stmts) await tx.$executeRawUnsafe(s);
        const q = async (label: string, sql: string) => {
          const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(sql);
          audit[label] = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v])));
        };
        await q("tasksNumbered", `SELECT count(*)::int AS n, min("number")::int AS lowest, max("number")::int AS highest FROM "Task"`);
        await q("numbersUnique", `SELECT count(*)::int AS dupes FROM (SELECT "number" FROM "Task" GROUP BY "number" HAVING count(*) > 1) d`);
        await q("tasksByState", `SELECT "state", count(*)::int AS n FROM "Task" WHERE "deletedAt" IS NULL AND "isPrivate" = false GROUP BY "state" ORDER BY "state"`);
        await q("statusStateAgree", `SELECT count(*)::int AS disagree FROM "Task" WHERE "isPrivate" = false AND (
            ("status" = 'DONE' AND "state" NOT IN ('RESOLVED','CLOSED','CANCELLED')) OR
            ("status" = 'DOING' AND "state" NOT IN ('IN_PROGRESS','ESCALATED')) OR
            ("status" = 'STUCK' AND "state" <> 'WAITING') OR
            ("status" = 'TODO' AND "state" NOT IN ('NEW','ASSIGNED','REOPENED')))`);
        await q("tasksByType", `SELECT "type", count(*)::int AS n FROM "Task" WHERE "deletedAt" IS NULL GROUP BY "type" ORDER BY "type"`);
        await q("tasksByPriority", `SELECT "priority", count(*)::int AS n FROM "Task" WHERE "deletedAt" IS NULL AND "isPrivate" = false GROUP BY "priority" ORDER BY "priority"`);
        await q("requesterFilled", `SELECT count(*) FILTER (WHERE "requesterId" IS NOT NULL)::int AS filled, count(*) FILTER (WHERE "requesterId" IS NULL)::int AS empty FROM "Task" WHERE "isPrivate" = false AND "deletedAt" IS NULL`);
        await q("departmentFilled", `SELECT count(*) FILTER (WHERE "departmentId" IS NOT NULL)::int AS filled, count(*) FILTER (WHERE "departmentId" IS NULL)::int AS empty FROM "Task" WHERE "isPrivate" = false AND "deletedAt" IS NULL`);
        await q("closedHaveResolution", `SELECT count(*)::int AS missing FROM "Task" WHERE "state" = 'CLOSED' AND ("resolutionCode" IS NULL OR "resolvedAt" IS NULL OR "closedAt" IS NULL)`);
        await q("waitingHaveReason", `SELECT count(*)::int AS missing FROM "Task" WHERE "state" = 'WAITING' AND "waitingReason" IS NULL`);
        await q("activities", `SELECT "type", "visibility", count(*)::int AS n FROM "TaskActivity" GROUP BY "type", "visibility"`);
        await q("taskCommentsLeft", `SELECT count(*)::int AS n FROM "Comment" WHERE "targetType" = 'TASK'`);
        await q("commentsByTarget", `SELECT "targetType", count(*)::int AS n FROM "Comment" GROUP BY "targetType"`);
        await q("notificationsLinked", `SELECT count(*) FILTER (WHERE "taskId" IS NOT NULL)::int AS "withTask", count(*) FILTER (WHERE "eventId" IS NOT NULL)::int AS "withEvent", count(*)::int AS total FROM "Notification"`);
        await q("newTables", `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('AssignmentGroup','AssignmentGroupMember','TaskCategory','AssignmentRule','TaskActivity') ORDER BY table_name`);
        await q("commentAuthorNullable", `SELECT is_nullable FROM information_schema.columns WHERE table_name='Comment' AND column_name='authorId'`);
        if (!auditOnly) throw new Rollback("rollback");
      },
      { timeout: 120_000 },
    );
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  console.log(JSON.stringify(audit, null, 2));
  console.log(auditOnly ? "AUDIT ONLY — no statements run" : "ROLLED BACK — nothing persisted");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
