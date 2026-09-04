/**
 * Collaboration-invite EMAIL accept/decline (phase 18) — in sync with in-app.
 *
 * The email link carries a signed token bound to ONE ProjectManager row. This
 * proves: email-accept updates the app (in-app pending list drops it), app-accept
 * makes the email link stale ("already-handled"), decline both ways, an invalid
 * token, and that an old (declined) link can never act on a re-invite.
 *
 * Throwaway p18- actors only; hard teardown; runs against the live dev server.
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";
import { signCollabToken } from "../lib/collab-invite";

const BASE = "http://localhost:3000";
const PREFIX = "p18-";
const prisma = new PrismaClient();

let pass = 0, fail = 0;
function rec(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(56)} got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
type Actor = { id: string; email: string; password: string; cookie: string };
async function signIn(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`sign-in ${email}: ${res.status}`);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}
async function call(a: Actor | null, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...(a ? { cookie: a.cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let json: any = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const invitePending = async (invitee: Actor, projectId: string) =>
  ((await call(invitee, "GET", "/api/collaboration-invites")).json ?? []).some((i: any) => i.projectId === projectId);
const respond = (token: string, action: "accept" | "decline") =>
  call(null, "POST", "/api/collaboration-invites/respond", { token, action });

async function main() {
  const mk = async (label: string, role: "MANAGER" | "TEAM_LEAD"): Promise<Actor> => {
    const email = `${PREFIX}${label}@orbit.local`.toLowerCase();
    const password = generateTempPassword(16);
    const u = await prisma.user.upsert({ where: { email }, update: { passwordHash: await hashPassword(password), role, disabledAt: null, status: "ACTIVE" }, create: { email, name: `P18 ${label}`, role, passwordHash: await hashPassword(password), status: "ACTIVE" } });
    return { id: u.id, email, password, cookie: await signIn(email, password) };
  };
  const owner = await mk("owner", "MANAGER");
  const invitee = await mk("invitee", "MANAGER");
  const lead = await mk("lead", "TEAM_LEAD");

  const dept = (await call(owner, "POST", "/api/departments", { name: "P18 Dept", color: "#475569" })).json;
  const proj = (await call(owner, "POST", "/api/projects", { name: "P18 P", description: "d", leadId: lead.id, departmentId: dept.id })).json;

  // The token is what the email would carry; we mint it directly (bound to the row).
  const tokenFor = async () => {
    const row = await prisma.projectManager.findUnique({ where: { projectId_userId: { projectId: proj.id, userId: invitee.id } }, select: { id: true } });
    return row ? signCollabToken(row.id) : "";
  };
  const invite = () => call(owner, "POST", `/api/projects/${proj.id}/managers`, { userId: invitee.id });
  const clearRow = () => prisma.projectManager.deleteMany({ where: { projectId: proj.id, userId: invitee.id } });

  console.log("── email ACCEPT updates the app ──");
  rec("owner invites -> 201", (await invite()).status, 201);
  rec("shows as pending in the app", await invitePending(invitee, proj.id), true);
  const tA = await tokenFor();
  rec("email accept -> accepted", (await respond(tA, "accept")).json?.status, "accepted");
  rec("row is ACCEPTED", (await prisma.projectManager.findFirst({ where: { projectId: proj.id, userId: invitee.id }, select: { status: true } }))?.status, "ACCEPTED");
  rec("app pending list dropped it", await invitePending(invitee, proj.id), false);
  rec("same email link now stale -> already-handled", (await respond(tA, "accept")).json?.status, "already-handled");

  console.log("\n── app ACCEPT makes the email link stale ──");
  await clearRow();
  await invite();
  const tB = await tokenFor();
  rec("invitee accepts IN-APP -> 200", (await call(invitee, "POST", `/api/collaboration-invites/${proj.id}`, {})).status, 200);
  rec("email link now -> already-handled", (await respond(tB, "accept")).json?.status, "already-handled");

  console.log("\n── email DECLINE removes the invite (and app agrees) ──");
  await clearRow();
  await invite();
  const tC = await tokenFor();
  rec("email decline -> declined", (await respond(tC, "decline")).json?.status, "declined");
  rec("row is gone", await prisma.projectManager.count({ where: { projectId: proj.id, userId: invitee.id } }), 0);
  rec("app pending list empty", await invitePending(invitee, proj.id), false);

  console.log("\n── an old (declined) link can't act on a re-invite ──");
  await invite(); // fresh invite -> new row id
  rec("re-invite is pending again", await invitePending(invitee, proj.id), true);
  rec("OLD declined link -> already-handled (not the new invite)", (await respond(tC, "accept")).json?.status, "already-handled");
  rec("new invite still pending (old link did nothing)", await invitePending(invitee, proj.id), true);

  console.log("\n── bad token ──");
  rec("garbage token -> invalid", (await respond("not-a-real-token", "accept")).json?.status, "invalid");

  // teardown
  const ids = [owner.id, invitee.id, lead.id];
  await prisma.projectManager.deleteMany({ where: { userId: { in: ids } } });
  await prisma.emailLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.project.deleteMany({ where: { name: { startsWith: "P18 " } } });
  await prisma.department.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  const resU = await prisma.user.count({ where: { email: { startsWith: PREFIX } } });
  console.log(`\nresidue -> users:${resU}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0 || resU) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
