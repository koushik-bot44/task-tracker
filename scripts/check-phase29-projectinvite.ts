/**
 * Phase 29 — invite-into-project (Change 1) + added-to-project bell (Change 2) +
 * delete-block for project owners (Change 3). Against the running app + prod DB
 * with throwaway p29- actors; hard teardown.
 *
 * The in-app BELL (Notification "project.added") is asserted here (it is created
 * synchronously, SMTP-independent). The EMAIL opt-in (project_added EmailLog for
 * opted-in, none for opted-out) is asserted in the PROD smoke, where SMTP is live
 * and the relay persists the reservation — locally there is no SMTP so no row is
 * written for anyone.
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const BASE = "http://localhost:3000";
const PREFIX = "p29-";
const prisma = new PrismaClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function rec(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(58)} got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
type Actor = { id: string; cookie: string; email: string };
async function signIn(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`sign-in ${email}: ${res.status}`);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}
async function call(a: Actor, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie: a.cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let json: any = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const bells = (userId: string) => prisma.notification.count({ where: { userId, type: "project.added" } });

async function teardown() {
  const ids = (await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } })).map((u) => u.id);
  await prisma.taskNote.deleteMany({ where: { authorId: { in: ids } } });
  await prisma.projectNote.deleteMany({ where: { authorId: { in: ids } } });
  await prisma.project.deleteMany({ where: { ownerId: { in: ids } } }); // cascades members/tasks/notes/events
  await prisma.projectMember.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.emailLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.invite.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdById: { in: ids } }] } });
  await prisma.calendarEvent.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.department.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

async function main() {
  await teardown();
  const mk = async (label: string, role: "MANAGER" | "TEAM_LEAD" | "RESOURCE", emailOptIn = true): Promise<Actor> => {
    const email = `${PREFIX}${label}@orbit.local`;
    const password = generateTempPassword(16);
    const u = await prisma.user.create({ data: { email, name: `P29 ${label}`, role, status: "ACTIVE", emailOptIn, passwordHash: await hashPassword(password) } });
    return { id: u.id, cookie: await signIn(email, password), email };
  };
  const M = await mk("owner", "MANAGER");
  const M2 = await mk("mgr2", "MANAGER");
  const L = await mk("lead", "TEAM_LEAD");
  const L2 = await mk("lead2", "TEAM_LEAD");
  const V = await mk("dev-optin", "RESOURCE", true);
  const W = await mk("dev-optout", "RESOURCE", false);
  const dept = await prisma.department.create({ data: { name: "P29 Dept", color: "#475569", orderKey: "a0", createdById: M.id } });

  console.log("\n-- CHANGE 1: invite-new into project on create --");
  const newEmail = `${PREFIX}newinvite@orbit.local`;
  const created = await call(M, "POST", "/api/projects", {
    name: "P29 Proj", description: "d", leadId: L.id, departmentId: dept.id,
    inviteNew: [{ name: "New Person", email: newEmail }, { name: "Existing V", email: V.email }],
  });
  rec("manager creates project with inviteNew -> 201", created.status, 201);
  const projId = created.json.id;
  await sleep(600);
  const newUser = await prisma.user.findUnique({ where: { email: newEmail } });
  rec("  brand-new email -> PENDING developer created", `${newUser?.status}/${newUser?.role}`, "PENDING/DEVELOPER");
  rec("  new user is a project member", newUser ? await prisma.projectMember.count({ where: { projectId: projId, userId: newUser.id } }) : 0, 1);
  rec("  an invite token was issued for the new user", newUser ? await prisma.invite.count({ where: { userId: newUser.id } }) : 0, 1);
  rec("  new user gets NO project.added bell (invite email covers it)", newUser ? await bells(newUser.id) : 99, 0);
  rec("  EXISTING email (V) is added as a member", await prisma.projectMember.count({ where: { projectId: projId, userId: V.id } }), 1);
  rec("  no DUPLICATE user created for V's email", await prisma.user.count({ where: { email: V.email } }), 1);
  rec("  existing V gets a project.added bell", (await bells(V.id)) >= 1, true);

  console.log("\n-- CHANGE 2: added-to-project bell (member + lead) --");
  const p2 = (await call(M, "POST", "/api/projects", { name: "P29 Proj2", description: "d", leadId: L.id, departmentId: dept.id })).json;
  await call(M, "POST", `/api/projects/${p2.id}/members`, { userId: W.id });
  await sleep(400);
  rec("member-add: opted-OUT dev W still gets the BELL (bell is always-on)", (await bells(W.id)) >= 1, true);
  const wBefore = await bells(W.id);
  await call(M, "POST", `/api/projects/${p2.id}/members`, { userId: W.id });
  await sleep(300);
  rec("re-adding an existing member is idempotent (no duplicate bell)", await bells(W.id), wBefore);
  await call(M, "PATCH", `/api/projects/${p2.id}`, { leadId: L2.id });
  await sleep(400);
  rec("lead-assign: the new lead L2 gets a project.added bell", (await bells(L2.id)) >= 1, true);
  const l2Before = await bells(L2.id);
  await call(M, "PATCH", `/api/projects/${p2.id}`, { leadId: L2.id });
  await sleep(300);
  rec("re-assigning the SAME lead sends no new bell", await bells(L2.id), l2Before);

  console.log("\n-- CHANGE 3: delete-block for project owners --");
  const delOwner = await call(M2, "DELETE", `/api/users/${M.id}`);
  rec("delete a manager who OWNS projects -> 409 (blocked)", delOwner.status, 409);
  rec("  409 reports ownedProjectCount (2)", delOwner.json?.ownedProjectCount, 2);
  rec("  the blocked owner still exists", (await prisma.user.findUnique({ where: { id: M.id } })) !== null, true);
  rec("  a delete-blocked owner can still be DISABLED -> 200", (await call(M2, "PATCH", `/api/users/${M.id}`, { disable: true })).status, 200);
  await call(M2, "PATCH", `/api/users/${M.id}`, { disable: false });
  const D = await mk("del-target", "RESOURCE");
  rec("delete a member-only user (owns nothing) -> 200", (await call(M2, "DELETE", `/api/users/${D.id}`)).status, 200);
  rec("  the member-only user is gone", (await prisma.user.findUnique({ where: { id: D.id } })) === null, true);
  rec("self-delete -> 403", (await call(M, "DELETE", `/api/users/${M.id}`)).status, 403);

  await teardown();
  rec("teardown: no p29- residue", await prisma.user.count({ where: { email: { startsWith: PREFIX } } }), 0);
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
