/* Look for things that should never be true (2026-09-09).
 *   npx tsx --env-file=.env.local scripts/check-data-integrity.ts   (local)
 *   npx tsx --env-file=.env      scripts/check-data-integrity.ts    (production)
 *
 * Read-only. Every check states an invariant and lists what breaks it, so a
 * clean run is evidence rather than silence.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
let bad = 0;

function report(name: string, offenders: string[]) {
  if (offenders.length === 0) return console.log(`  OK    ${name}`);
  bad += offenders.length;
  console.log(`  BAD   ${name} — ${offenders.length}`);
  for (const o of offenders.slice(0, 5)) console.log(`          ${o}`);
  if (offenders.length > 5) console.log(`          …and ${offenders.length - 5} more`);
}

async function main() {
  console.log(`\nchecking ${process.env.DATABASE_URL?.includes("127.0.0.1") ? "the LOCAL clone" : "PRODUCTION"}\n`);

  /* Somebody wrote on a task they cannot see. A note only needs sight of the
     task, but sight has limits: its department, its team, its project, or being
     on it. Anyone outside all of those should never have written. */
  const notes = await prisma.taskActivity.findMany({
    where: { type: { in: ["COMMENT", "WORK_NOTE"] }, authorId: { not: null } },
    select: {
      author: { select: { id: true, name: true, role: true, departmentId: true } },
      task: { select: { number: true, departmentId: true, projectId: true, assigneeId: true, requesterId: true, givenById: true, assignmentGroupId: true } },
    },
  });
  const strangers: string[] = [];
  for (const n of notes) {
    const a = n.author!;
    const t = n.task;
    if (a.role === "FOUNDER" || a.role === "CO_FOUNDER") continue;      // company-wide sight
    if (t.assigneeId === a.id || t.requesterId === a.id || t.givenById === a.id) continue;  // on it
    if (t.departmentId && t.departmentId === a.departmentId) continue;   // their department
    const onProject = t.projectId ? await prisma.projectMember.count({ where: { projectId: t.projectId, userId: a.id } }) : 0;
    if (onProject) continue;
    const heads = t.departmentId ? await prisma.department.count({ where: { id: t.departmentId, hodId: a.id } }) : 0;
    if (heads) continue;
    strangers.push(`TASK${String(t.number).padStart(7, "0")} written on by ${a.name} (${a.role}), who is outside it`);
  }
  report("every note was written by somebody who can see the task", strangers);

  /* A shared task is a group; a group of one is a leftover key. */
  const keys = await prisma.task.groupBy({ by: ["siblingKey"], where: { siblingKey: { not: null }, deletedAt: null }, _count: { _all: true } });
  report("no task is 'shared' with only itself", keys.filter((k) => k._count._all < 2).map((k) => `key ${k.siblingKey} has 1 record`));

  /* A holder and a date go together. */
  const heldNoDate = await prisma.task.findMany({ where: { deletedAt: null, assigneeId: { not: null }, assignedAt: null }, select: { number: true } });
  report("every held task has an assigned date", heldNoDate.map((t) => `TASK${String(t.number).padStart(7, "0")}`));
  const dateNoHolder = await prisma.task.findMany({ where: { deletedAt: null, assigneeId: null, assignedAt: { not: null } }, select: { number: true } });
  report("no unheld task claims an assigned date", dateNoHolder.map((t) => `TASK${String(t.number).padStart(7, "0")}`));

  /* A task in a project belongs to that project's department. */
  const mismatched = await prisma.$queryRawUnsafe<{ number: number }[]>(`
    SELECT t."number" FROM "Task" t JOIN "Project" p ON p.id = t."projectId"
    WHERE t."deletedAt" IS NULL AND t."departmentId" IS DISTINCT FROM p."departmentId"`);
  report("a task sits in its project's department", mismatched.map((t) => `TASK${String(t.number).padStart(7, "0")}`));

  /* Somebody switched off should not still be holding work. */
  const disabledHolders = await prisma.task.findMany({ where: { deletedAt: null, assignee: { disabledAt: { not: null } } }, select: { number: true, assignee: { select: { name: true } } } });
  report("nobody disabled is still holding a task", disabledHolders.map((t) => `TASK${String(t.number).padStart(7, "0")} held by ${t.assignee?.name}`));

  /* One address, one person — across both places an address can live. */
  const dupes = await prisma.$queryRawUnsafe<{ email: string; n: bigint }[]>(`
    SELECT email, count(*) AS n FROM (
      SELECT lower(email) AS email FROM "User"
      UNION ALL SELECT lower(email) FROM "UserEmail") x GROUP BY email HAVING count(*) > 1`);
  report("no address belongs to two people", dupes.map((d) => `${d.email} appears ${d.n} times`));

  /* Every project is filed somewhere. */
  const homeless = await prisma.project.findMany({ where: { departmentId: null }, select: { name: true } });
  report("every project is in a department", homeless.map((p) => p.name));

  /* Exactly one CEO, at most one admin. */
  const founders = await prisma.user.count({ where: { role: "FOUNDER" } });
  report("there is exactly one CEO", founders === 1 ? [] : [`${founders} CEO accounts`]);
  const admins = await prisma.user.count({ where: { role: "ADMIN" } });
  report("there is at most one admin", admins <= 1 ? [] : [`${admins} admin accounts`]);

  /* An active account can be signed into. */
  const noPassword = await prisma.user.findMany({ where: { status: "ACTIVE", passwordHash: null, disabledAt: null }, select: { email: true } });
  report("every active account has a password", noPassword.map((u) => u.email));

  console.log(`\n${bad === 0 ? "nothing broken" : `${bad} things to look at`}\n`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
