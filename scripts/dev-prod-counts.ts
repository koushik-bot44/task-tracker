/* Read-only connectivity check + row counts against the DB in DATABASE_URL_UNPOOLED. */
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error("DATABASE_URL_UNPOOLED not set");
const prisma = new PrismaClient({ datasourceUrl: url });

async function main() {
  const counts: Record<string, number> = {
    user: await prisma.user.count(),
    department: await prisma.department.count(),
    project: await prisma.project.count(),
    task: await prisma.task.count(),
    projectMember: await prisma.projectMember.count(),
    projectManager: await prisma.projectManager.count(),
    taskNote: await prisma.taskNote.count(),
    projectNote: await prisma.projectNote.count(),
    calendarEvent: await prisma.calendarEvent.count(),
    eventAttendee: await prisma.eventAttendee.count(),
    notification: await prisma.notification.count(),
    person: await prisma.person.count(),
    habitSegment: await prisma.habitSegment.count(),
    habit: await prisma.habit.count(),
    habitMark: await prisma.habitMark.count(),
    personalDepartment: await prisma.personalDepartment.count(),
    personalProject: await prisma.personalProject.count(),
  };
  console.log(JSON.stringify(counts, null, 2));
  const users = await prisma.user.findMany({ select: { email: true, name: true, role: true, status: true } });
  console.log(users.map((u) => `${u.role}\t${u.status}\t${u.email}\t${u.name}`).join("\n"));
  const departments = await prisma.department.findMany({ select: { name: true, createdBy: { select: { email: true } } } });
  console.log("DEPTS: " + departments.map((d) => `${d.name} (by ${d.createdBy?.email ?? "-"})`).join(", "));
}

main().finally(() => prisma.$disconnect());
