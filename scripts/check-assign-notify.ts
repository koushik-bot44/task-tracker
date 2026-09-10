/* Assigning work, and what reaches the person (2026-09-10) — test plan section 3.
 *   npx tsx --env-file=.env.local scripts/check-assign-notify.ts   (dev server up)
 *   DEV_LOG=<path to the dev server's output>   (default: records/evidence/accounts-notify/dev-server.log)
 *
 * Each case gives or moves a task, then checks all three ways it can reach the
 * receiver:
 *   bell  — a Notification row for that task, and the unread count moving;
 *   push  — whether the server holds VAPID keys and whether the receiver has a
 *           saved browser subscription to deliver to;
 *   email — read from the dev server's own output, which says for every address
 *           whether it was attempted and why it did not leave (a domain that can
 *           never receive mail, or not listed in EMAIL_DEV_ALLOW).
 * Plus: the person acting is never notified by their own action; somebody who
 * has not joined yet gets the bell and no task mail; reading lowers the count.
 * Everything it makes ("AN " tasks, notify-probe-* people) is removed in `finally`.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, statSync } from "node:fs";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const LOG = process.env.DEV_LOG ?? "records/evidence/accounts-notify/dev-server.log";
const PASSWORD = "orbit123";
const PROBE_PASSWORD = "Probe-Notify-77";

let pass = 0;
let fail = 0;
const made: string[] = [];

function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const logSize = () => { try { return statSync(LOG).size; } catch { return 0; } };
const logSince = (from: number) => { try { return readFileSync(LOG).subarray(from).toString("utf8"); } catch { return ""; } };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What the dev server said about mail for one address since a point in its output. */
function emailOutcome(text: string, address: string): "refused: can never receive mail" | "held back: not in EMAIL_DEV_ALLOW" | "sent" | "failed" | "not attempted" {
  const a = address.toLowerCase();
  if (text.includes(`not sending to ${a} — that domain can never receive mail`)) return "refused: can never receive mail";
  if (text.includes(`dev: not sending to ${a}`)) return "held back: not in EMAIL_DEV_ALLOW";
  if (text.includes(`send failed`) && text.includes(a)) return "failed";
  return "not attempted";
}

function vapidConfigured(): boolean {
  // The dev server reads .env and .env.local; the keys live in .env.
  const text = ["./.env", "./.env.local"].map((f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } }).join("\n");
  return ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"].every((k) => new RegExp(`^${k}=\\S+`, "m").test(text));
}

type Account = { email: string; id: string; name: string; cookie: string };

async function signIn(email: string, password = PASSWORD): Promise<Account> {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`sign-in ${email}: ${res.status}`);
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  return { email, id: u!.id, name: u!.name, cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] };
}

async function call(as: Account, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie: as.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null;
  try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, json };
}

async function unread(as: Account): Promise<number> {
  return (await call(as, "GET", "/api/notifications")).json?.unread ?? -1;
}

/**
 * Run one action, then report what reached each receiver and whether the actor
 * heard from themselves. `expect` lists the notification types each receiver
 * should get exactly once; `mail` says whether their channel should be tried.
 */
async function observe(
  name: string,
  actor: Account,
  act: () => Promise<{ status: number; taskId: string | null }>,
  receivers: { who: Account; expect: string[]; mail: boolean }[],
  wantStatus: number[],
): Promise<string | null> {
  const t0 = new Date();
  const from = logSize();
  const before = new Map<string, number>();
  for (const r of receivers) before.set(r.who.id, await unread(r.who));

  const { status, taskId } = await act();
  await pause(1800);
  const text = logSince(from);

  record(`${name} — the move is ${wantStatus.includes(201) || wantStatus.includes(200) ? "allowed" : "refused"}`, wantStatus.includes(status), `HTTP ${status}`);
  if (!taskId || !(status === 200 || status === 201)) return taskId;

  for (const r of receivers) {
    const rows = await prisma.notification.findMany({ where: { userId: r.who.id, taskId, createdAt: { gte: t0 } }, select: { type: true, readAt: true } });
    const types = rows.map((x) => x.type);
    const missing = r.expect.filter((t) => !types.includes(t));
    const dupes = [...new Set(types)].filter((t) => types.filter((x) => x === t).length > 1);
    const after = await unread(r.who);
    const subs = await prisma.pushSubscription.count({ where: { userId: r.who.id } });
    const mail = emailOutcome(text, r.who.email);
    const bellOk = missing.length === 0 && dupes.length === 0 && after - (before.get(r.who.id) ?? 0) === rows.filter((x) => !x.readAt).length;
    const mailOk = r.mail ? mail !== "not attempted" : mail === "not attempted";
    record(
      `${name} — ${r.who.name}: bell`,
      bellOk,
      `got [${types.join(", ") || "nothing"}], wanted [${r.expect.join(", ") || "nothing"}]${dupes.length ? `, DUPLICATE ${dupes.join(",")}` : ""}; unread ${before.get(r.who.id)} → ${after}`,
    );
    record(`${name} — ${r.who.name}: email`, mailOk, `${mail}${r.mail ? "" : " (none expected)"}`);
    console.log(`INFO  ${name} — ${r.who.name}: push  (server keys: ${vapidConfigured() ? "yes" : "no"}; saved subscriptions: ${subs}${subs === 0 ? " → nothing to deliver to" : " → sent to the push service"})`);
  }

  const mine = await prisma.notification.count({ where: { userId: actor.id, taskId, createdAt: { gte: t0 } } });
  const actorMail = emailOutcome(text, actor.email);
  record(`${name} — ${actor.name} (acting) hears nothing from their own move`, mine === 0 && actorMail === "not attempted", `${mine} notifications, email ${actorMail}`);
  return taskId;
}

async function main() {
  const accounts = await prisma.department.findFirst({ where: { name: "Accounts" }, select: { id: true } });
  const hr = await prisma.department.findFirst({ where: { name: "HR" }, select: { id: true } });
  const erm = await prisma.department.findFirst({ where: { name: "ERM" }, select: { id: true } });

  const ceo = await signIn("founder@orbit.local");
  const cofounder = await signIn("salyush@orbit.local");
  const hrHead = await signIn("staff-hr-head@orbit.local");
  const manager = await signIn("staff-accounts-manager@orbit.local");
  const lead = await signIn("staff-accounts-lead@orbit.local");
  const member1 = await signIn("staff-accounts-member-1@orbit.local");
  const member2 = await signIn("staff-accounts-member-2@orbit.local");
  const ermMember = await signIn("staff-erm-member-1@orbit.local");

  console.log(`INFO  push: VAPID keys on the server: ${vapidConfigured() ? "yes" : "no"}`);
  // Say how the allowlist is set, never what is in it: evidence files get committed.
  const allow = (readFileSync(".env.local", "utf8").match(/^EMAIL_DEV_ALLOW="?([^"\n]*)"?$/m)?.[1] ?? "").split(",").map((a) => a.trim()).filter(Boolean);
  console.log(`INFO  email: EMAIL_DEV_ALLOW is ${allow.includes("*") ? "everyone" : `${allow.length} address(es)`}; dev server output read from ${LOG}\n`);

  const raise = (as: Account, title: string, assigneeId: string, departmentId?: string) => async () => {
    const r = await call(as, "POST", "/api/tasks", { title, type: "GENERAL", priority: "MEDIUM", assigneeId, ...(departmentId ? { departmentId } : {}) });
    if (r.json?.id) made.push(r.json.id);
    return { status: r.status, taskId: r.json?.id ?? null };
  };

  /* i. same department, manager → lead */
  await observe("i. Accounts manager → Accounts lead", manager, raise(manager, "AN i Reconcile petty cash", lead.id, accounts!.id),
    [{ who: lead, expect: ["task_given"], mail: true }], [201]);

  /* ii. same department, lead → member 1 (kept for v and vi) */
  const taskII = await observe("ii. Accounts lead → Accounts member 1", lead, raise(lead, "AN ii File the expense claims", member1.id, accounts!.id),
    [{ who: member1, expect: ["task_given"], mail: true }], [201]);

  /* iii. across departments, HR head → ERM member.
     The rule (assignment.ts): on a task with no team and no project, "a lead or
     above may name anyone". So this should be allowed. */
  await observe("iii. HR head → ERM member (task sits in HR)", hrHead, raise(hrHead, "AN iii Share the leave policy draft", ermMember.id),
    [{ who: ermMember, expect: ["task_given"], mail: true }], [201]);
  await observe("iii-b. HR head → ERM member (task filed straight into ERM)", hrHead, raise(hrHead, "AN iii-b Risk training slot", ermMember.id, erm!.id),
    [{ who: ermMember, expect: ["task_given"], mail: true }], [201, 403]);

  /* iv. from the top */
  await observe("iv-a. CEO → Accounts manager", ceo, raise(ceo, "AN iv-a Budget review deck", manager.id, accounts!.id),
    [{ who: manager, expect: ["task_given"], mail: true }], [201]);
  await observe("iv-b. co-founder → HR head", cofounder, raise(cofounder, "AN iv-b Hiring plan numbers", hrHead.id, hr!.id),
    [{ who: hrHead, expect: ["task_given"], mail: true }], [201, 403]);

  /* v. reassign ii from member 1 to member 2 */
  if (taskII) {
    await observe("v. reassign ii: member 1 → member 2", lead, async () => {
      const r = await call(lead, "POST", `/api/tasks/${taskII}/assign`, { assigneeId: member2.id });
      return { status: r.status, taskId: taskII };
    }, [
      { who: member2, expect: ["task_given"], mail: true },
      { who: member1, expect: ["work.reassigned"], mail: false },
    ], [200]);

    /* vi. a chat message, then resolve: the requester (the lead) hears both */
    await observe("vi-a. member 2 writes on the task", member2, async () => {
      const r = await call(member2, "POST", `/api/tasks/${taskII}/comments`, { body: "AN done the first batch, two receipts missing" });
      return { status: r.status, taskId: taskII };
    }, [{ who: lead, expect: ["task_note"], mail: true }], [201]);

    await call(member2, "POST", `/api/tasks/${taskII}/start`, {});
    await pause(800);
    await observe("vi-b. member 2 resolves it", member2, async () => {
      const r = await call(member2, "POST", `/api/tasks/${taskII}/resolve`, { resolutionCode: "COMPLETED", resolutionNotes: "AN all claims filed" });
      return { status: r.status, taskId: taskII };
    }, [{ who: lead, expect: ["task_resolved"], mail: true }], [200]);

    /* Reading lowers the count. */
    const leadRows = await prisma.notification.findMany({ where: { userId: lead.id, taskId: taskII, readAt: null }, select: { id: true } });
    const beforeRead = await unread(lead);
    for (const n of leadRows) await call(lead, "POST", "/api/notifications/read", { id: n.id });
    const afterRead = await unread(lead);
    record("the bell count drops after reading", afterRead === beforeRead - leadRows.length, `${beforeRead} → ${afterRead} after reading ${leadRows.length}`);
  }

  /* Somebody who has not joined yet: the bell, and no task mail.
     Their address is at a real-looking domain, so a wrongly attempted send
     would show in the server's output — and the ACTIVE control proves it does. */
  const hash = await hashPassword(PROBE_PASSWORD);
  const pending = await prisma.user.create({ data: { email: "notify-probe-pending@example.org", name: "Probe Pending", role: "RESOURCE", status: "PENDING", passwordHash: null, departmentId: accounts!.id } });
  const active = await prisma.user.create({ data: { email: "notify-probe-active@example.org", name: "Probe Active", role: "RESOURCE", status: "ACTIVE", passwordHash: hash, departmentId: accounts!.id } });
  const pendingAcc: Account = { email: pending.email, id: pending.id, name: pending.name, cookie: "" };
  const activeAcc = await signIn(active.email, PROBE_PASSWORD);

  const t0 = new Date();
  const from = logSize();
  const pr = await call(manager, "POST", "/api/tasks", { title: "AN pending probe", type: "GENERAL", assigneeId: pending.id, departmentId: accounts!.id });
  if (pr.json?.id) made.push(pr.json.id);
  const ar = await call(manager, "POST", "/api/tasks", { title: "AN active probe", type: "GENERAL", assigneeId: active.id, departmentId: accounts!.id });
  if (ar.json?.id) made.push(ar.json.id);
  await pause(1800);
  const probeText = logSince(from);
  const pendingBell = await prisma.notification.count({ where: { userId: pending.id, createdAt: { gte: t0 }, type: "task_given" } });
  record("not joined yet — the task waits in their bell", pendingBell === 1, `${pendingBell} bell rows`);
  record("not joined yet — no task mail", emailOutcome(probeText, pendingAcc.email) === "not attempted", emailOutcome(probeText, pendingAcc.email));
  record("control: an active person at the same kind of address IS mailed (so the check can see mail)", emailOutcome(probeText, activeAcc.email) !== "not attempted", emailOutcome(probeText, activeAcc.email));
}

main()
  .catch((e) => { console.error(e); fail++; })
  .finally(async () => {
    const probes = await prisma.user.findMany({ where: { email: { startsWith: "notify-probe-" } }, select: { id: true } });
    const tasks = await prisma.task.findMany({ where: { OR: [{ id: { in: made } }, { title: { startsWith: "AN " } }] }, select: { id: true } });
    const taskIds = tasks.map((t) => t.id);
    await prisma.notification.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.taskActivity.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
    await prisma.user.deleteMany({ where: { id: { in: probes.map((p) => p.id) } } });
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  });
