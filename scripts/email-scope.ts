/**
 * Email scoping + dedupe proof (phase 9).
 *   - meeting emails reach exactly the scoped, opted-in, active recipients
 *     (an opted-out person still gets the bell/push, never email);
 *   - task-due reaches the assignee + the tool's lead, opt-in respected;
 *   - the unique dedupeKey stops a second send.
 *
 * Self-contained: throwaway "estest-" users + project; the dedupe check uses a
 * dummy SMTP config so sendEmail reaches the reservation step but the SKIP path
 * never actually sends. Tears everything down.
 */
process.env.SMTP_HOST = process.env.SMTP_HOST || "smtp.invalid.local";
process.env.SMTP_PORT = process.env.SMTP_PORT || "587";
process.env.SMTP_USER = process.env.SMTP_USER || "u";
process.env.SMTP_PASS = process.env.SMTP_PASS || "p";
process.env.EMAIL_FROM = process.env.EMAIL_FROM || "Orbit <no-reply@orbit.local>";

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";
import { recipientsForEvent } from "../lib/notify";
import { sendEmail } from "../lib/email";
import { istDayKey, istDayRange } from "../lib/timezone";

const prisma = new PrismaClient();
const PREFIX = "estest-";
let fail = 0;
const check = (n: string, cond: boolean) => { if (!cond) fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${n}`); };

async function mkUser(label: string, role: "MANAGER" | "TEAM_LEAD" | "RESOURCE", emailOptIn: boolean) {
  return prisma.user.create({
    data: { email: `${PREFIX}${label}@orbit.local`, name: `ES ${label}`, role, emailOptIn, passwordHash: await hashPassword("x".repeat(16)) },
    select: { id: true, email: true },
  });
}

/** The exact filter emailEventRecipients uses: scoped ∩ opted-in ∩ active. */
async function emailSet(recipients: string[]): Promise<Set<string>> {
  const rows = await prisma.user.findMany({ where: { id: { in: recipients }, emailOptIn: true, disabledAt: null }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

async function main() {
  const manager = await mkUser("manager", "MANAGER", true);
  const lead = await mkUser("lead", "TEAM_LEAD", true);
  const dev1 = await mkUser("dev1", "RESOURCE", true); // opted-in, assigned
  const dev2 = await mkUser("dev2", "RESOURCE", false); // opted-OUT, assigned

  const project = await prisma.project.create({ data: { name: "ES proj", slug: `${PREFIX}proj`, color: "#2f68f0", orderKey: "e0", leadId: lead.id }, select: { id: true } });
  const todayKey = istDayKey(new Date());
  const { start } = istDayRange(todayKey);
  await prisma.task.create({ data: { projectId: project.id, title: "ES due task", status: "IN_PROGRESS", orderKey: "a0", assigneeId: dev1.id, dueDate: start } });
  await prisma.task.create({ data: { projectId: project.id, title: "ES due task 2", status: "IN_PROGRESS", orderKey: "a1", assigneeId: dev2.id, dueDate: start } });

  // ── meeting email scoping ───────────────────────────────────────────────────
  const recips = await recipientsForEvent({ id: "x", title: "t", date: new Date(), projectId: project.id, createdById: manager.id });
  const emails = await emailSet(recips);
  check("meeting: opted-in lead is emailed", emails.has(lead.id));
  check("meeting: opted-in assigned dev1 is emailed", emails.has(dev1.id));
  check("meeting: opted-OUT dev2 is NOT emailed (still gets bell/push)", !emails.has(dev2.id) && recips.includes(dev2.id));
  check("meeting: creating manager not emailed", !emails.has(manager.id));

  // ── task-due candidate scoping (assignee + lead, opt-in) ───────────────────
  const dueTasks = await prisma.task.findMany({
    where: { projectId: project.id, dueDate: { gte: start, lte: istDayRange(todayKey).end }, status: { notIn: ["DONE", "CANCELLED"] }, assigneeId: { not: null }, deletedAt: null },
    select: { id: true, assignee: { select: { id: true, emailOptIn: true, disabledAt: true } }, project: { select: { lead: { select: { id: true, emailOptIn: true, disabledAt: true } } } } },
  });
  const t1 = dueTasks.find((t) => t.assignee?.id === dev1.id)!;
  const cand1 = [t1.assignee, t1.project?.lead].filter(Boolean).filter((u) => u && !u.disabledAt && u.emailOptIn).map((u) => u!.id);
  check("task-due: dev1 task emails assignee + lead", new Set(cand1).size === 2 && cand1.includes(dev1.id) && cand1.includes(lead.id));
  const t2 = dueTasks.find((t) => t.assignee?.id === dev2.id)!;
  const cand2 = [t2.assignee, t2.project?.lead].filter(Boolean).filter((u) => u && !u.disabledAt && u.emailOptIn).map((u) => u!.id);
  check("task-due: opted-out assignee dropped, lead still emailed", !cand2.includes(dev2.id) && cand2.includes(lead.id));

  // ── dedupe: a reserved key means a second send SKIPS (no double email) ─────
  const key = `task_due:probe:${dev1.id}:${todayKey}`;
  await prisma.emailLog.create({ data: { userId: dev1.id, kind: "task_due", refId: "probe", dedupeKey: key } });
  const before = await prisma.emailLog.count({ where: { dedupeKey: key } });
  const res = await sendEmail({ to: "x@x", subject: "s", html: "h", text: "t", dedupeKey: key, userId: dev1.id, kind: "task_due", refId: "probe" });
  const after = await prisma.emailLog.count({ where: { dedupeKey: key } });
  check("dedupe: duplicate key skips (no send)", res.skipped === true && res.sent === false);
  check("dedupe: no extra EmailLog row", before === 1 && after === 1);

  // ── teardown ────────────────────────────────────────────────────────────────
  await prisma.emailLog.deleteMany({ where: { refId: { in: ["probe"] } } });
  await prisma.task.deleteMany({ where: { projectId: project.id } });
  await prisma.project.delete({ where: { id: project.id } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  console.log("\ncleanup: removed estest users + project");
  console.log(fail === 0 ? "all email-scope checks passed" : `${fail} FAILED`);
  if (fail > 0) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
