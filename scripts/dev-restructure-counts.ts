/* Row counts the restructure migration needs, read from whichever DB the env
 * points at. Usage: npx tsx --env-file=.env.local scripts/dev-restructure-counts.ts */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const out: Record<string, unknown> = {};
  out.users = await p.user.count();
  out.usersByRole = await p.user.groupBy({ by: ["role"], _count: true });
  out.departments = await p.department.findMany({ select: { id: true, name: true, hodId: true, _count: { select: { projects: true } } } });
  out.projects = await p.project.count();
  out.projectsByHealth = await p.project.groupBy({ by: ["health"], _count: true });
  out.projectsWithDeadline = await p.project.count({ where: { deadline: { not: null } } });
  out.projectMembers = await p.projectMember.count();
  out.projectManagers = await p.projectManager.groupBy({ by: ["status"], _count: true });
  out.tasks = await p.task.count();
  out.tasksLive = await p.task.count({ where: { deletedAt: null } });
  out.tasksPrivate = await p.task.count({ where: { isPrivate: true } });
  out.tasksProject = await p.task.count({ where: { isPrivate: false, projectId: { not: null } } });
  out.tasksByStatus = await p.task.groupBy({ by: ["status"], _count: true, where: { isPrivate: false } });
  out.tasksByPriority = await p.task.groupBy({ by: ["priority"], _count: true, where: { isPrivate: false } });
  out.tasksWithParent = await p.task.count({ where: { parentId: { not: null } } });
  const depth = await p.$queryRawUnsafe<{ depth: number; n: number }[]>(`
    WITH RECURSIVE t AS (
      SELECT id, "parentId", 0 AS depth FROM "Task" WHERE "parentId" IS NULL
      UNION ALL
      SELECT c.id, c."parentId", t.depth + 1 FROM "Task" c JOIN t ON c."parentId" = t.id
    ) SELECT depth, count(*)::int AS n FROM t GROUP BY depth ORDER BY depth`);
  out.taskDepth = depth;
  out.tasksWithGates = await p.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Task" WHERE gates::text <> '[]'`);
  out.tasksWithTags = await p.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Task" WHERE array_length(tags,1) > 0`);
  out.tasksWithLinks = await p.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Task" WHERE links::text <> '[]'`);
  out.tasksPinned = await p.task.count({ where: { pinnedAt: { not: null } } });
  out.tasksColor = await p.task.count({ where: { color: { not: null } } });
  out.tasksGroupColor = await p.task.count({ where: { groupColor: { not: null } } });
  out.tasksWithDescription = await p.task.count({ where: { descriptionMd: { not: "" } } });
  out.tasksWithDeliverable = await p.task.count({ where: { deliverableUrl: { not: null } } });
  out.taskNotes = await p.taskNote.count();
  out.projectNotes = await p.projectNote.count();
  out.events = await p.calendarEvent.count();
  out.meetings = await p.calendarEvent.count({ where: { isMeeting: true } });
  out.attendees = await p.eventAttendee.count();
  out.notifications = await p.notification.count();
  out.emailLogs = await p.emailLog.count();
  out.whatsappLogs = await p.whatsAppLog.count();
  out.pushSubs = await p.pushSubscription.count();
  out.invites = await p.invite.count();
  out.persons = await p.person.count();
  out.personalDepartments = await p.personalDepartment.count();
  out.personalProjects = await p.personalProject.count();
  out.usersWithPhone = await p.user.count({ where: { phone: { not: null } } });
  // departmentId backfill preview: HOD → headed dept; owner → most-owned dept; member/assignee → dept of that project
  const users = await p.user.findMany({ where: { role: { notIn: ["PERSON"] } }, select: { id: true, name: true, role: true, headedDepartments: { select: { id: true, name: true } }, ownedProjects: { select: { departmentId: true } }, ledProjects: { select: { departmentId: true } }, projectMemberships: { select: { project: { select: { departmentId: true } } } }, assignedTasks: { where: { deletedAt: null, isPrivate: false }, select: { project: { select: { departmentId: true } } } } } });
  const backfill = users.map((u) => {
    const tally = new Map<string, number>();
    const add = (d: string | null | undefined, w: number) => { if (d) tally.set(d, (tally.get(d) ?? 0) + w); };
    for (const d of u.headedDepartments) add(d.id, 1000);
    for (const pr of u.ownedProjects) add(pr.departmentId, 10);
    for (const pr of u.ledProjects) add(pr.departmentId, 5);
    for (const m of u.projectMemberships) add(m.project.departmentId, 2);
    for (const t of u.assignedTasks) add(t.project?.departmentId, 1);
    const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    return { id: u.id, name: u.name, role: u.role, departmentId: best?.[0] ?? null };
  });
  out.departmentBackfill = { placed: backfill.filter((b) => b.departmentId).length, nulls: backfill.filter((b) => !b.departmentId).map((b) => `${b.name} (${b.role})`) };
  console.log(JSON.stringify(out, (_, v) => (typeof v === "bigint" ? Number(v) : v), 2));
}
main().finally(() => p.$disconnect());
