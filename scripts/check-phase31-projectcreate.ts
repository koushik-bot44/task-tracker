/**
 * Phase 31 — New Project modal changes on the create endpoint:
 *   - the team lead is OPTIONAL (a project can start with no lead);
 *   - each invite-new person carries a ROLE — a new DEVELOPER joins as a member,
 *     a new TEAM_LEAD is created and, when no lead was picked, BECOMES this
 *     project's lead (first one wins); an unroled entry defaults to DEVELOPER.
 * Against the running app + prod DB with throwaway p31- actors; hard teardown.
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const BASE = "http://localhost:3000";
const PREFIX = "p31-";
const prisma = new PrismaClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function rec(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(60)} got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
async function signIn(email: string, password: string) {
  const r = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`sign-in ${email}: ${r.status}`);
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
async function call(cookie: string, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let json: any = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
}
const leadOf = (id: string) => prisma.project.findUnique({ where: { id }, select: { leadId: true } }).then((p) => p?.leadId ?? null);
const isMember = (projectId: string, userId: string) => prisma.projectMember.count({ where: { projectId, userId } });
const inviteCount = (userId: string) => prisma.invite.count({ where: { userId } });

async function teardown() {
  const ids = (await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } })).map((u) => u.id);
  // Projects owned by throwaway managers OR led by a throwaway invitee.
  await prisma.project.deleteMany({ where: { OR: [{ ownerId: { in: ids } }, { leadId: { in: ids } }] } });
  await prisma.projectMember.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.emailLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.invite.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdById: { in: ids } }] } });
  await prisma.department.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

async function main() {
  await teardown();
  const mk = async (label: string, role: "MANAGER" | "TEAM_LEAD" | "RESOURCE") => {
    const email = `${PREFIX}${label}@orbit.local`;
    const password = generateTempPassword(16);
    const u = await prisma.user.create({ data: { email, name: `P31 ${label}`, role, status: "ACTIVE", passwordHash: await hashPassword(password) } });
    return { id: u.id, email, cookie: await signIn(email, password) };
  };
  const M = await mk("owner", "MANAGER");
  const L = await mk("lead", "TEAM_LEAD");
  const V = await mk("dev", "RESOURCE");
  const dept = await prisma.department.create({ data: { name: "P31 Dept", color: "#475569", orderKey: "a0", createdById: M.id } });

  console.log("\n-- optional lead --");
  const noLead = await call(M.cookie, "POST", "/api/projects", { name: "P31 NoLead", description: "d", departmentId: dept.id });
  rec("create WITHOUT leadId -> 201", noLead.status, 201);
  rec("  project.leadId is null", await leadOf(noLead.json.id), null);
  const withLead = await call(M.cookie, "POST", "/api/projects", { name: "P31 WithLead", description: "d", leadId: L.id, departmentId: dept.id });
  rec("create WITH a valid leadId -> 201", withLead.status, 201);
  rec("  project.leadId set to the picked lead", await leadOf(withLead.json.id), L.id);
  rec("leadId pointing at a developer -> 400", (await call(M.cookie, "POST", "/api/projects", { name: "P31 BadLead", description: "d", leadId: V.id, departmentId: dept.id })).status, 400);

  console.log("\n-- invite-new roles --");
  const p = await call(M.cookie, "POST", "/api/projects", {
    name: "P31 Roles", description: "d", departmentId: dept.id,
    inviteNew: [
      { name: "New Dev", email: `${PREFIX}newdev@orbit.local`, role: "RESOURCE" },
      { name: "New Def", email: `${PREFIX}newdef@orbit.local` },
    ],
  });
  rec("create with dev + unroled invites -> 201", p.status, 201);
  await sleep(700);
  const nd = await prisma.user.findUnique({ where: { email: `${PREFIX}newdev@orbit.local` } });
  rec("  DEVELOPER invite -> PENDING/DEVELOPER", `${nd?.status}/${nd?.role}`, "PENDING/DEVELOPER");
  rec("  DEVELOPER invite is a project member", nd ? await isMember(p.json.id, nd.id) : 0, 1);
  rec("  DEVELOPER invite has an invite token", nd ? await inviteCount(nd.id) : 0, 1);
  const nf = await prisma.user.findUnique({ where: { email: `${PREFIX}newdef@orbit.local` } });
  rec("  unroled invite defaults to DEVELOPER + member", `${nf?.role}/${nf ? await isMember(p.json.id, nf.id) : 0}`, "DEVELOPER/1");

  console.log("\n-- new team lead becomes THIS project's lead (no lead picked) --");
  const q = await call(M.cookie, "POST", "/api/projects", {
    name: "P31 NewLead", description: "d", departmentId: dept.id,
    inviteNew: [{ name: "New Lead", email: `${PREFIX}newlead@orbit.local`, role: "TEAM_LEAD" }],
  });
  rec("create + invite a NEW team lead (no dropdown lead) -> 201", q.status, 201);
  await sleep(700);
  const nl = await prisma.user.findUnique({ where: { email: `${PREFIX}newlead@orbit.local` } });
  rec("  new lead -> PENDING/TEAM_LEAD", `${nl?.status}/${nl?.role}`, "PENDING/TEAM_LEAD");
  rec("  new lead is NOT a member (leads aren't members)", nl ? await isMember(q.json.id, nl.id) : 99, 0);
  rec("  new lead has an invite token", nl ? await inviteCount(nl.id) : 0, 1);
  rec("  project.leadId is the new lead", await leadOf(q.json.id), nl?.id ?? "?");
  rec("  the create response already reports the new lead", q.json.leadId, nl?.id ?? "?");

  console.log("\n-- a picked lead is NOT overridden by an invited team lead --");
  const r2 = await call(M.cookie, "POST", "/api/projects", {
    name: "P31 KeepLead", description: "d", leadId: L.id, departmentId: dept.id,
    inviteNew: [{ name: "Extra Lead", email: `${PREFIX}extralead@orbit.local`, role: "TEAM_LEAD" }],
  });
  rec("create WITH a lead + invite another team lead -> 201", r2.status, 201);
  await sleep(600);
  rec("  the picked lead is kept (not overridden)", await leadOf(r2.json.id), L.id);
  rec("  the extra lead account is still created", (await prisma.user.findUnique({ where: { email: `${PREFIX}extralead@orbit.local` } }))?.role, "TEAM_LEAD");

  await teardown();
  rec("teardown: no p31- residue", await prisma.user.count({ where: { email: { startsWith: PREFIX } } }), 0);
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
