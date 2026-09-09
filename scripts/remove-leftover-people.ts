/* One-off: remove the leftover people from the clone, keeping the accounts the
 * company actually runs on. Mirrors app/api/users/[id]/route.ts: the rows whose
 * FK is Restrict (invites, calendar events, routine invites) pass to a keeper
 * first; tasks/projects/notes SetNull by themselves. */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const KEEP = [
  "founder@orbit.local",        // the only CEO
  "test-manager@orbit.local",   // owns all four real projects
  "hod-dev@orbit.local",        // heads Development
  "admin@orbit.local",          // the only remaining admin
  "sgogineni122@gmail.com",     // Raju
];

async function main() {
  const dry = process.argv.includes("--dry");
  const heir = await prisma.user.findUnique({ where: { email: "founder@orbit.local" }, select: { id: true } });
  if (!heir) throw new Error("no founder to inherit the restricted rows");

  const going = await prisma.user.findMany({
    where: { email: { notIn: KEEP } },
    select: { id: true, email: true, name: true, role: true, _count: { select: { assignedTasks: true, ledProjects: true, ownedProjects: true, projectMemberships: true } } },
    orderBy: { createdAt: "asc" },
  });

  console.log(`${going.length} accounts to remove:\n`);
  for (const u of going) {
    const c = u._count;
    console.log(`  ${u.email.padEnd(34)} ${(u.name ?? "").padEnd(12)} ${u.role.padEnd(10)} tasks:${c.assignedTasks} leads:${c.ledProjects} owns:${c.ownedProjects} member:${c.projectMemberships}`);
  }
  const blocked = going.filter((u) => u._count.ownedProjects > 0);
  if (blocked.length) throw new Error(`refusing: ${blocked.map((u) => u.email).join(", ")} own projects`);
  if (dry) { console.log("\n(dry run — nothing written)"); return; }

  const ids = going.map((u) => u.id);
  const freed = going.reduce((n, u) => n + u._count.assignedTasks, 0);
  const leadless = going.reduce((n, u) => n + u._count.ledProjects, 0);

  await prisma.$transaction(async (tx) => {
    await tx.invite.updateMany({ where: { createdById: { in: ids } }, data: { createdById: heir.id } });
    await tx.calendarEvent.updateMany({ where: { createdById: { in: ids } }, data: { createdById: heir.id } });
    await tx.routineCollaborator.updateMany({ where: { invitedById: { in: ids } }, data: { invitedById: heir.id } });
    await tx.user.deleteMany({ where: { id: { in: ids } } });
  });

  const left = await prisma.user.findMany({ select: { email: true, name: true, role: true }, orderBy: { createdAt: "asc" } });
  console.log(`\nremoved ${ids.length}. ${freed} tasks are now unassigned; ${leadless} projects have no lead.`);
  console.log(`\n${left.length} accounts remain:`);
  for (const u of left) console.log(`  ${u.email.padEnd(30)} ${(u.name ?? "").padEnd(14)} ${u.role}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
