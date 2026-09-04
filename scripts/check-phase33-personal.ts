/**
 * Phase 33 — My Space rebuilt as a PRIVATE Department>Project>Task hierarchy.
 * Verifies against the running app + prod DB (throwaway p33- actors; hard teardown):
 *   - the owner CRUDs their own personal structure (200/201);
 *   - ISOLATION: another developer, a lead, a manager AND an admin are all 404'd
 *     on the owner's personal dept/project/task — no role override — and never see
 *     it in their own lists; a private task leaks into NO project query/dashboard;
 *   - the Prompt endpoint is DEVELOPER-only (dev 201, lead/manager/admin 403) and
 *     still caller-scoped;
 *   - delete-department-when-nonempty is blocked (409); deleting a project takes
 *     its tasks with it.
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const BASE = "http://localhost:3000";
const PREFIX = "p33-";
const prisma = new PrismaClient();
let pass = 0, fail = 0;
function rec(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(62)} got ${JSON.stringify(got)}`);
  ok ? pass++ : fail++;
}
type Actor = { id: string; cookie: string; email: string; role: string };
async function signIn(email: string, password: string) {
  const r = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`sign-in ${email}: ${r.status}`);
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
async function call(a: Actor, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie: a.cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let json: any = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
}
const newId = () => crypto.randomUUID();

async function teardown() {
  const ids = (await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } })).map((u) => u.id);
  await prisma.task.deleteMany({ where: { ownerId: { in: ids }, isPrivate: true } });
  await prisma.personalProject.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.personalDepartment.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

async function main() {
  await teardown();
  const mk = async (label: string, role: "MANAGER" | "TEAM_LEAD" | "RESOURCE" | "ADMIN"): Promise<Actor> => {
    const email = `${PREFIX}${label.toLowerCase()}@orbit.local`;
    const password = generateTempPassword(16);
    // ADMIN created directly (the API caps admins at one; a throwaway row is fine).
    const u = await prisma.user.create({ data: { email, name: `P33 ${label}`, role, status: "ACTIVE", passwordHash: await hashPassword(password) } });
    return { id: u.id, cookie: await signIn(email, password), email, role };
  };
  const A = await mk("devA", "RESOURCE");
  const B = await mk("devB", "RESOURCE");
  const L = await mk("lead", "TEAM_LEAD");
  const M = await mk("mgr", "MANAGER");
  const AD = await mk("admin", "ADMIN");

  const projectTasksBefore = await prisma.task.count({ where: { isPrivate: false } });

  console.log("\n-- owner builds their private structure --");
  const dept = await call(A, "POST", "/api/my-space/departments", { name: "Personal" });
  rec("dev A creates a personal department -> 201", dept.status, 201);
  const deptId = dept.json.id;
  const proj = await call(A, "POST", "/api/my-space/projects", { departmentId: deptId, name: "Side quests" });
  rec("dev A creates a personal project -> 201", proj.status, 201);
  const projId = proj.json.id;
  const root = await call(A, "POST", "/api/tasks", { id: newId(), isPrivate: true, personalProjectId: projId, parentId: null, title: "secret root", orderKey: "a1" });
  rec("dev A creates a private task -> 201", root.status, 201);
  rec("  it is private, owned by A, in A's personal project", [root.json?.isPrivate, root.json?.ownerId, root.json?.personalProjectId], [true, A.id, projId]);
  const sub = await call(A, "POST", "/api/tasks", { id: newId(), isPrivate: true, parentId: root.json.id, title: "secret subtask", orderKey: "a1" });
  rec("  a subtask inherits the project + owner, no label", [sub.json?.isPrivate, sub.json?.ownerId, sub.json?.personalProjectId], [true, A.id, projId]);
  rec("dev A sees both in their private list", (await call(A, "GET", "/api/tasks?scope=private")).json.filter((t: any) => t.personalProjectId === projId).length, 2);
  rec("dev A renames their department -> 200", (await call(A, "PATCH", `/api/my-space/departments/${deptId}`, { name: "Personal ✦" })).status, 200);

  console.log("\n-- ISOLATION: no other role can see or touch A's personal space --");
  for (const other of [B, L, M, AD]) {
    const r = other.role;
    rec(`  ${r} does NOT see A's dept in their own list`, (await call(other, "GET", "/api/my-space/departments")).json.some((d: any) => d.id === deptId), false);
    rec(`  ${r} PATCH A's dept -> 404`, (await call(other, "PATCH", `/api/my-space/departments/${deptId}`, { name: "hax" })).status, 404);
    rec(`  ${r} DELETE A's dept -> 404`, (await call(other, "DELETE", `/api/my-space/departments/${deptId}`)).status, 404);
    rec(`  ${r} PATCH A's project -> 404`, (await call(other, "PATCH", `/api/my-space/projects/${projId}`, { name: "hax" })).status, 404);
    rec(`  ${r} DELETE A's project -> 404`, (await call(other, "DELETE", `/api/my-space/projects/${projId}`)).status, 404);
    rec(`  ${r} GET A's private task -> 404`, (await call(other, "GET", `/api/tasks/${root.json.id}`)).status, 404);
    rec(`  ${r} PATCH A's private task -> 404`, (await call(other, "PATCH", `/api/tasks/${root.json.id}`, { title: "hax" })).status, 404);
    rec(`  ${r} private list excludes A's task`, (await call(other, "GET", "/api/tasks?scope=private")).json.some((t: any) => t.id === root.json.id), false);
  }

  console.log("\n-- NO leakage into any project query / aggregate --");
  rec("project-task count (isPrivate=false) unchanged by the private tasks", await prisma.task.count({ where: { isPrivate: false } }), projectTasksBefore);
  rec("dev A's ?view=all excludes their own private task", (await call(A, "GET", "/api/tasks?view=all")).json.some((t: any) => t.id === root.json.id), false);
  rec("lead's ?view=all excludes A's private task", (await call(L, "GET", "/api/tasks?view=all")).json.some((t: any) => t.id === root.json.id), false);

  console.log("\n-- Prompt endpoint: DEVELOPER-only + caller-scoped --");
  rec("developer A prompts into their own project -> 201", (await call(A, "POST", "/api/my-space/prompt", { personalProjectId: projId, text: "quick capture\nnotes here" })).status, 201);
  rec("lead prompts -> 403", (await call(L, "POST", "/api/my-space/prompt", { personalProjectId: projId, text: "x" })).status, 403);
  rec("manager prompts -> 403", (await call(M, "POST", "/api/my-space/prompt", { personalProjectId: projId, text: "x" })).status, 403);
  rec("admin prompts -> 403", (await call(AD, "POST", "/api/my-space/prompt", { personalProjectId: projId, text: "x" })).status, 403);
  rec("developer B prompts into A's project -> 404 (not B's)", (await call(B, "POST", "/api/my-space/prompt", { personalProjectId: projId, text: "x" })).status, 404);

  console.log("\n-- delete rules --");
  rec("delete a NON-EMPTY department -> 409 (blocked)", (await call(A, "DELETE", `/api/my-space/departments/${deptId}`)).status, 409);
  rec("delete the project -> 200", (await call(A, "DELETE", `/api/my-space/projects/${projId}`)).status, 200);
  rec("  the project's tasks went with it", (await call(A, "GET", "/api/tasks?scope=private")).json.some((t: any) => t.personalProjectId === projId), false);
  rec("  no orphan private tasks left for A", await prisma.task.count({ where: { ownerId: A.id, isPrivate: true } }), 0);
  rec("delete the now-empty department -> 200", (await call(A, "DELETE", `/api/my-space/departments/${deptId}`)).status, 200);

  await teardown();
  rec("teardown: no p33- residue", await prisma.user.count({ where: { email: { startsWith: PREFIX } } }), 0);
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
