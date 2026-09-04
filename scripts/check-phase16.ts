/**
 * Phase 16 — Departments: department-required project creation, per-manager
 * siloing, move-between-departments (owner-only), delete-when-empty, and the
 * data-preserving rename + General backfill assertions.
 *
 * Throwaway p16- actors only; hard teardown; runs against the live dev server.
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const BASE = "http://localhost:3000";
const PREFIX = "p16-";
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
const listHas = async (a: Actor, path: string, id: string) =>
  ((await call(a, "GET", path)).json ?? []).some?.((x: any) => x.id === id) ?? false;

async function main() {
  // ── rename + backfill audit (real data, read-only) ──
  console.log("── rename + backfill audit ──");
  const nullDept = await prisma.project.count({ where: { departmentId: null } });
  rec("0 projects with null departmentId (all filed)", nullDept, 0);
  const general = await prisma.department.findFirst({ where: { name: "General" }, select: { id: true } });
  rec("General department exists", !!general, true);
  const totalProjects = await prisma.project.count();
  const filed = await prisma.project.count({ where: { departmentId: { not: null } } });
  rec("every project has a department", filed, totalProjects);

  const mk = async (label: string, role: "MANAGER" | "TEAM_LEAD" | "RESOURCE" | "ADMIN"): Promise<Actor> => {
    const email = `${PREFIX}${label}@orbit.local`.toLowerCase();
    const password = generateTempPassword(16);
    const passwordHash = await hashPassword(password);
    const u = await prisma.user.upsert({ where: { email }, update: { passwordHash, role, disabledAt: null, status: "ACTIVE" }, create: { email, name: `P16 ${label}`, role, passwordHash, status: "ACTIVE" } });
    return { id: u.id, email, password, cookie: await signIn(email, password) };
  };
  const mgrA = await mk("mgrA", "MANAGER");
  const mgrB = await mk("mgrB", "MANAGER");
  const lead = await mk("lead", "TEAM_LEAD");
  const admin = await mk("admin", "ADMIN");

  console.log("\n── departments are per-manager (siloed) ──");
  const deptA = (await call(mgrA, "POST", "/api/departments", { name: "P16 A", color: "#475569" })).json;
  const deptB = (await call(mgrB, "POST", "/api/departments", { name: "P16 B", color: "#0369a1" })).json;
  rec("manager creates a department -> id", typeof deptA?.id === "string", true);
  rec("mgrA sees own department", await listHas(mgrA, "/api/departments", deptA.id), true);
  rec("mgrA does NOT see mgrB's department", await listHas(mgrA, "/api/departments", deptB.id), false);
  rec("empty own department still shows to its manager", await listHas(mgrA, "/api/departments", deptA.id), true);
  rec("admin GET departments -> 403", (await call(admin, "GET", "/api/departments")).status, 403);
  rec("lead sees all departments", (await listHas(lead, "/api/departments", deptA.id)) && (await listHas(lead, "/api/departments", deptB.id)), true);

  console.log("\n── caller-scoped department writes ──");
  rec("mgrA edits mgrB's department -> 404", (await call(mgrA, "PATCH", `/api/departments/${deptB.id}`, { name: "hax" })).status, 404);
  rec("mgrA deletes mgrB's department -> 404", (await call(mgrA, "DELETE", `/api/departments/${deptB.id}`)).status, 404);
  rec("mgrA renames own department -> 200", (await call(mgrA, "PATCH", `/api/departments/${deptA.id}`, { name: "P16 A2" })).status, 200);

  console.log("\n── project create REQUIRES a department the caller owns ──");
  rec("create with NO department -> 400", (await call(mgrA, "POST", "/api/projects", { name: "P16 P", description: "d", leadId: lead.id })).status, 400);
  rec("create in another mgr's department -> 404", (await call(mgrA, "POST", "/api/projects", { name: "P16 P", description: "d", leadId: lead.id, departmentId: deptB.id })).status, 404);
  const pA = (await call(mgrA, "POST", "/api/projects", { name: "P16 PA", description: "d", leadId: lead.id, departmentId: deptA.id })).json;
  rec("create in own department -> project with that department", pA?.departmentId, deptA.id);

  console.log("\n── move between departments (owner-only) ──");
  const deptA2 = (await call(mgrA, "POST", "/api/departments", { name: "P16 A-two", color: "#7c3aed" })).json;
  rec("owner moves project to own department -> 200", (await call(mgrA, "PATCH", `/api/projects/${pA.id}`, { departmentId: deptA2.id })).status, 200);
  rec("project now in the new department", (await call(mgrA, "GET", "/api/projects")).json.find((p: any) => p.id === pA.id)?.departmentId, deptA2.id);
  rec("move to another mgr's department -> 404", (await call(mgrA, "PATCH", `/api/projects/${pA.id}`, { departmentId: deptB.id })).status, 404);
  rec("cannot un-file (departmentId null) -> 400", (await call(mgrA, "PATCH", `/api/projects/${pA.id}`, { departmentId: null })).status, 400);
  // collaborator can't move
  await call(mgrA, "POST", `/api/projects/${pA.id}/managers`, { userId: mgrB.id });
  await call(mgrB, "POST", `/api/collaboration-invites/${pA.id}`, {});
  rec("collaborator moves the project -> 403", (await call(mgrB, "PATCH", `/api/projects/${pA.id}`, { departmentId: deptB.id })).status, 403);

  console.log("\n── delete department only when empty ──");
  rec("delete NON-empty department -> 409", (await call(mgrA, "DELETE", `/api/departments/${deptA2.id}`)).status, 409);
  rec("delete EMPTY department -> 200", (await call(mgrA, "DELETE", `/api/departments/${deptA.id}`)).status, 200);

  // ── teardown ──
  const ids = [mgrA.id, mgrB.id, lead.id, admin.id];
  await prisma.projectManager.deleteMany({ where: { userId: { in: ids } } });
  await prisma.task.deleteMany({ where: { project: { name: { startsWith: "P16 " } } } });
  await prisma.project.deleteMany({ where: { name: { startsWith: "P16 " } } });
  await prisma.department.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  const resU = await prisma.user.count({ where: { email: { startsWith: PREFIX } } });
  const resD = await prisma.department.count({ where: { name: { startsWith: "P16 " } } });
  const resP = await prisma.project.count({ where: { name: { startsWith: "P16 " } } });
  console.log(`\nresidue -> users:${resU} departments:${resD} projects:${resP}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0 || resU || resD || resP) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
