/**
 * Phase 21 — event notifications fire BOTH channels (verify-only).
 *
 * The event lifecycle was already dual-channel (phase 8 bell + phase 9 email),
 * both fanned out from lib/notify.ts `notifyEvent`. This drives the REAL
 * `notifyEvent("created", …)` against a sandbox and proves:
 *
 *   BELL  — a Notification row is inserted for every ACTIVE scoped recipient
 *           (the project's lead + assigned developers), opt-in irrelevant; the
 *           CREATOR is excluded and a DISABLED assignee is excluded.
 *   EMAIL — the email is attempted for exactly scoped ∩ emailOptIn ∩ active
 *           (creator excluded), the same set `emailEventRecipients` narrows to.
 *           An opted-OUT recipient gets the bell but no email.
 *
 * SMTP is pointed at a dead host so the fire-and-forget send never actually
 * mails anyone (and, since sendEmail releases its EmailLog reservation on send
 * failure, the definitive email proof is the target SET — the reservation/dedupe
 * mechanics themselves are covered by scripts/email-scope.ts). Throwaway en21-
 * users; hard teardown.
 */
process.env.SMTP_HOST = process.env.SMTP_HOST || "smtp.invalid.local";
process.env.SMTP_PORT = process.env.SMTP_PORT || "587";
process.env.SMTP_USER = process.env.SMTP_USER || "u";
process.env.SMTP_PASS = process.env.SMTP_PASS || "p";
process.env.EMAIL_FROM = process.env.EMAIL_FROM || "Orbit <no-reply@orbit.local>";

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";
import { notifyEvent, recipientsForEvent } from "../lib/notify";

const prisma = new PrismaClient();
const PREFIX = "en21-";
let pass = 0,
  fail = 0;
function rec(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(56)} got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

async function mkUser(label: string, role: "MANAGER" | "TEAM_LEAD" | "RESOURCE", emailOptIn: boolean, disabled = false) {
  return prisma.user.create({
    data: {
      email: `${PREFIX}${label}@orbit.local`,
      name: `EN21 ${label}`,
      role,
      emailOptIn,
      disabledAt: disabled ? new Date() : null,
      passwordHash: await hashPassword("x".repeat(16)),
    },
    select: { id: true },
  });
}

async function main() {
  const mgr = await mkUser("mgr", "MANAGER", true); // creator
  const lead = await mkUser("lead", "TEAM_LEAD", true); // scoped, opted-in
  const dev1 = await mkUser("dev1", "RESOURCE", true); // scoped, opted-in
  const dev2 = await mkUser("dev2", "RESOURCE", false); // scoped, opted-OUT
  const dev3 = await mkUser("dev3", "RESOURCE", true, true); // scoped but DISABLED

  const project = await prisma.project.create({
    data: { name: "EN21 proj", slug: `${PREFIX}proj`, color: "#2f68f0", orderKey: "e0", leadId: lead.id },
    select: { id: true, name: true },
  });
  const mkTask = (assigneeId: string, ord: string) =>
    prisma.task.create({ data: { projectId: project.id, title: "t", status: "IN_PROGRESS", orderKey: ord, assigneeId } });
  await mkTask(dev1.id, "a0");
  await mkTask(dev2.id, "a1");
  await mkTask(dev3.id, "a2");

  const event = await prisma.calendarEvent.create({
    data: { title: "EN21 kickoff", description: "d", date: new Date("2026-09-01T00:00:00.000Z"), projectId: project.id, createdById: mgr.id },
    include: { createdBy: { select: { name: true } }, project: { select: { name: true } } },
  });

  // Drive the REAL production notifier (create path).
  await notifyEvent(event, "created", project.name);
  // Let the fire-and-forget email path settle (it will reserve+release under the
  // dead SMTP, so we assert the target SET below, not persisted EmailLog rows).
  await new Promise((r) => setTimeout(r, 1500));

  // ── BELL channel: Notification rows ─────────────────────────────────────────
  const everyone = [mgr.id, lead.id, dev1.id, dev2.id, dev3.id];
  const notified = new Set(
    (await prisma.notification.findMany({ where: { userId: { in: everyone }, type: "event.created" }, select: { userId: true } })).map((n) => n.userId),
  );
  rec("bell: lead notified", notified.has(lead.id), true);
  rec("bell: opted-in dev1 notified", notified.has(dev1.id), true);
  rec("bell: opted-OUT dev2 STILL notified (bell ignores opt-in)", notified.has(dev2.id), true);
  rec("bell: creator (manager) NOT notified", notified.has(mgr.id), false);
  rec("bell: disabled dev3 NOT notified", notified.has(dev3.id), false);
  rec("bell: exactly 3 recipients (lead + dev1 + dev2)", notified.size, 3);

  // ── EMAIL channel: the set emailEventRecipients targets (scoped ∩ optIn ∩ active) ─
  const recips = await recipientsForEvent(event);
  const emailTargets = new Set(
    (await prisma.user.findMany({ where: { id: { in: recips }, emailOptIn: true, disabledAt: null }, select: { id: true } })).map((u) => u.id),
  );
  rec("email: lead is a target", emailTargets.has(lead.id), true);
  rec("email: opted-in dev1 is a target", emailTargets.has(dev1.id), true);
  rec("email: opted-OUT dev2 is NOT a target (bell only)", emailTargets.has(dev2.id), false);
  rec("email: creator (manager) is NOT a target", emailTargets.has(mgr.id), false);
  rec("email: disabled dev3 is NOT a target", emailTargets.has(dev3.id), false);
  rec("email: exactly 2 targets (lead + dev1)", emailTargets.size, 2);

  // ── teardown ────────────────────────────────────────────────────────────────
  await prisma.notification.deleteMany({ where: { userId: { in: everyone } } });
  await prisma.emailLog.deleteMany({ where: { userId: { in: everyone } } });
  await prisma.calendarEvent.deleteMany({ where: { id: event.id } });
  await prisma.task.deleteMany({ where: { projectId: project.id } });
  await prisma.project.delete({ where: { id: project.id } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  const residue = await prisma.user.count({ where: { email: { startsWith: PREFIX } } });
  rec("teardown: no en21- residue", residue, 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
