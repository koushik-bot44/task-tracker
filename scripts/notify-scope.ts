/**
 * Notification recipient-scoping proof (phase 8, feature 5).
 *
 * Verifies lib/notify.recipientsForEvent picks EXACTLY the right people:
 *   - project event  -> the project's lead + that project's task assignees
 *   - global event    -> every active lead + developer
 *   - never the creating manager; never a disabled account; deduped.
 *
 * Self-contained: creates its own throwaway users ("nstest-") and project, and
 * tests the pure scoping function — no notifications are written and no push is
 * sent, so no real inbox or device is touched. Tears everything down.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";
import { recipientsForEvent } from "../lib/notify";

const prisma = new PrismaClient();
const PREFIX = "nstest-";
let fail = 0;

function check(name: string, cond: boolean) {
  if (!cond) fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
}

async function mkUser(label: string, role: "MANAGER" | "TEAM_LEAD" | "RESOURCE") {
  return prisma.user.create({
    data: {
      email: `${PREFIX}${label}@orbit.local`,
      name: `NS ${label}`,
      role,
      passwordHash: await hashPassword("x".repeat(16)),
    },
    select: { id: true },
  });
}

async function main() {
  const manager = await mkUser("manager", "MANAGER");
  const lead = await mkUser("lead", "TEAM_LEAD");
  const dev1 = await mkUser("dev1", "RESOURCE"); // assigned in the project
  const dev2 = await mkUser("dev2", "RESOURCE"); // active but NOT in the project

  const project = await prisma.project.create({
    data: { name: "NS Scope Project", slug: `${PREFIX}proj`, color: "#2f68f0", orderKey: "n0", leadId: lead.id },
    select: { id: true },
  });
  await prisma.task.create({
    data: { projectId: project.id, title: "NS task", status: "IN_PROGRESS", orderKey: "a0", assigneeId: dev1.id },
  });

  const ev = (projectId: string | null, createdById: string) => ({
    id: "x",
    title: "t",
    date: new Date(0),
    projectId,
    createdById,
  });

  // ── scoped ────────────────────────────────────────────────────────────────
  const scoped = new Set(await recipientsForEvent(ev(project.id, manager.id)));
  check("scoped: includes the project lead", scoped.has(lead.id));
  check("scoped: includes the assigned dev", scoped.has(dev1.id));
  check("scoped: EXCLUDES an unrelated active dev", !scoped.has(dev2.id));
  check("scoped: EXCLUDES the creating manager", !scoped.has(manager.id));
  check("scoped: exactly {lead, dev1} among test users", scoped.has(lead.id) && scoped.has(dev1.id) && !scoped.has(dev2.id) && !scoped.has(manager.id));

  // ── creator exclusion (lead creates their own project's event) ─────────────
  const byLead = new Set(await recipientsForEvent(ev(project.id, lead.id)));
  check("scoped: creator excluded even when creator is the lead", !byLead.has(lead.id) && byLead.has(dev1.id));

  // ── disabled exclusion ──────────────────────────────────────────────────────
  await prisma.user.update({ where: { id: dev1.id }, data: { disabledAt: new Date() } });
  const afterDisable = new Set(await recipientsForEvent(ev(project.id, manager.id)));
  check("scoped: a disabled assignee is dropped", !afterDisable.has(dev1.id) && afterDisable.has(lead.id));
  await prisma.user.update({ where: { id: dev1.id }, data: { disabledAt: null } });

  // ── global ──────────────────────────────────────────────────────────────────
  const global = new Set(await recipientsForEvent(ev(null, manager.id)));
  check("global: includes all test leads+devs", global.has(lead.id) && global.has(dev1.id) && global.has(dev2.id));
  check("global: EXCLUDES the creating manager", !global.has(manager.id));
  const managers = await prisma.user.findMany({ where: { role: "MANAGER", disabledAt: null }, select: { id: true } });
  check("global: no manager is a recipient", managers.every((m) => !global.has(m.id)));

  // ── teardown ──────────────────────────────────────────────────────────────
  await prisma.task.deleteMany({ where: { projectId: project.id } });
  await prisma.project.delete({ where: { id: project.id } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  console.log(`\ncleanup: removed test project + ${4} nstest users`);
  console.log(fail === 0 ? "all notify-scope checks passed" : `${fail} FAILED`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
