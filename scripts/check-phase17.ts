/**
 * Phase 17 — members popover endpoint scope + shape.
 *
 * GET /api/projects/[id]/team returns {name, lead:{name}|null, developers:[{name}]}
 * to anyone who can SEE the project, and 404s a caller who can't (admin: 403, no
 * project access). Lead is a separate field (lead-first by construction).
 *
 * Throwaway p17- actors only; hard teardown; runs against the live dev server.
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const BASE = "http://localhost:3000";
const PREFIX = "p17-";
const prisma = new PrismaClient();

let pass = 0, fail = 0;
function rec(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(52)} got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
type Actor = { id: string; email: string; password: string; cookie: string; name: string };
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

async function main() {
  const mk = async (label: string, role: "MANAGER" | "TEAM_LEAD" | "RESOURCE" | "ADMIN"): Promise<Actor> => {
    const email = `${PREFIX}${label}@orbit.local`.toLowerCase();
    const password = generateTempPassword(16);
    const name = `P17 ${label}`;
    const u = await prisma.user.upsert({ where: { email }, update: { passwordHash: await hashPassword(password), role, disabledAt: null, status: "ACTIVE" }, create: { email, name, role, passwordHash: await hashPassword(password), status: "ACTIVE" } });
    return { id: u.id, email, password, name, cookie: await signIn(email, password) };
  };
  const mgrA = await mk("mgrA", "MANAGER");
  const mgrB = await mk("mgrB", "MANAGER");
  const lead = await mk("lead", "TEAM_LEAD");
  const dev1 = await mk("dev1", "RESOURCE");
  const dev2 = await mk("dev2", "RESOURCE");
  const admin = await mk("admin", "ADMIN");

  const dept = (await call(mgrA, "POST", "/api/departments", { name: "P17 Dept", color: "#475569" })).json;
  const pA = (await call(mgrA, "POST", "/api/projects", { name: "P17 PA", description: "d", leadId: lead.id, departmentId: dept.id, developerIds: [dev1.id] })).json;

  console.log("── team endpoint: shape + lead-first ──");
  const t = await call(mgrA, "GET", `/api/projects/${pA.id}/team`);
  rec("owner GET team -> 200", t.status, 200);
  rec("name is the project name", t.json?.name, "P17 PA");
  rec("lead is a separate field (lead-first) = the lead", t.json?.lead?.name, lead.name);
  rec("developers lists the member dev", (t.json?.developers ?? []).map((d: any) => d.name), [dev1.name]);
  rec("no ids/roles leaked (only name + lead marker)", Object.keys(t.json ?? {}).sort().join(), "developers,lead,name");

  console.log("\n── scope: only a caller who can SEE the project ──");
  rec("member developer GET team -> 200", (await call(dev1, "GET", `/api/projects/${pA.id}/team`)).status, 200);
  rec("non-member developer -> 404", (await call(dev2, "GET", `/api/projects/${pA.id}/team`)).status, 404);
  rec("other manager (can't see) -> 404", (await call(mgrB, "GET", `/api/projects/${pA.id}/team`)).status, 404);
  rec("admin (no project access) -> 403", (await call(admin, "GET", `/api/projects/${pA.id}/team`)).status, 403);
  rec("bogus project id -> 404", (await call(mgrA, "GET", `/api/projects/nope/team`)).status, 404);

  console.log("\n── no-lead + no-dev states ──");
  await call(mgrA, "PATCH", `/api/projects/${pA.id}`, { leadId: null });
  rec("cleared lead -> lead is null", (await call(mgrA, "GET", `/api/projects/${pA.id}/team`)).json?.lead, null);
  await call(mgrA, "DELETE", `/api/projects/${pA.id}/members`, { userId: dev1.id });
  rec("removed the only dev -> developers empty", (await call(mgrA, "GET", `/api/projects/${pA.id}/team`)).json?.developers, []);

  // teardown
  const ids = [mgrA.id, mgrB.id, lead.id, dev1.id, dev2.id, admin.id];
  await prisma.projectMember.deleteMany({ where: { userId: { in: ids } } });
  await prisma.task.deleteMany({ where: { project: { name: { startsWith: "P17 " } } } });
  await prisma.project.deleteMany({ where: { name: { startsWith: "P17 " } } });
  await prisma.department.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  const resU = await prisma.user.count({ where: { email: { startsWith: PREFIX } } });
  const resP = await prisma.project.count({ where: { name: { startsWith: "P17 " } } });
  console.log(`\nresidue -> users:${resU} projects:${resP}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0 || resU || resP) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
