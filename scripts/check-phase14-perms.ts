/**
 * Phase-14 permission + lifecycle regression, against a running server.
 * Throwaway accounts, own fixtures, hard teardown. Covers the inverted model:
 * admin = accounts-only (no projects); managers siloed to owned ∪ collaborating;
 * owner-vs-collaborator; collaboration invites; password-reset requests; and the
 * delete-manager owned-project cascade.
 *
 *   npx tsx --env-file=.env scripts/check-phase14-perms.ts
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PREFIX = "p14-";
let pass = 0, fail = 0;
function rec(name: string, got: number | boolean, want: number | boolean) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(56)} got ${got}, want ${want}`);
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
  const mk = async (label: string, role: "MANAGER" | "TEAM_LEAD" | "RESOURCE" | "ADMIN"): Promise<Actor> => {
    // Emails are lowercased everywhere they enter the product (the invite POST
    // and the sign-in route both `.toLowerCase()`), so a fixture minted straight
    // through Prisma must match — a mixed-case label like "mgrA" would store a
    // row the lowercasing sign-in lookup could never find.
    const email = `${PREFIX}${label}@orbit.local`.toLowerCase();
    const password = generateTempPassword(16);
    const u = await prisma.user.upsert({
      where: { email },
      update: { passwordHash: await hashPassword(password), role, disabledAt: null, status: "ACTIVE" },
      create: { email, name: `P14 ${label}`, role, passwordHash: await hashPassword(password), status: "ACTIVE" },
    });
    return { id: u.id, email, password, cookie: await signIn(email, password) };
  };
  const admin = await mk("admin", "ADMIN");
  const mgrA = await mk("mgrA", "MANAGER");
  const mgrB = await mk("mgrB", "MANAGER");
  const lead = await mk("lead", "TEAM_LEAD");
  const dev = await mk("dev", "RESOURCE");

  const day = 86_400_000;
  const iso = (d: number) => new Date(Date.now() + d).toISOString();
  // Phase 16: every project is created inside one of the owner's own departments.
  const deptCache = new Map<string, string>();
  const deptFor = async (owner: Actor) => {
    const cached = deptCache.get(owner.id);
    if (cached) return cached;
    const d = (await call(owner, "POST", "/api/departments", { name: "P14 Dept", color: "#475569" })).json;
    deptCache.set(owner.id, d.id);
    return d.id as string;
  };
  const mkProj = async (owner: Actor, name: string) =>
    call(owner, "POST", "/api/projects", { name, description: "p14", leadId: lead.id, departmentId: await deptFor(owner) });

  const pA = (await mkProj(mgrA, "P14 A")).json;
  const rootA = (await call(mgrA, "POST", "/api/tasks", { projectId: pA.id, title: "P14 task", dueDate: iso(3 * day), status: "DONE" })).json;

  console.log("\n── CHANGE 1: admin = accounts-only (no project access) ──");
  rec("admin GET projects -> 403", (await call(admin, "GET", "/api/projects")).status, 403);
  rec("admin GET tasks -> 403", (await call(admin, "GET", `/api/tasks?projectId=${pA.id}`)).status, 403);
  rec("admin GET departments -> 403", (await call(admin, "GET", "/api/departments")).status, 403);
  rec("admin GET overview -> 403", (await call(admin, "GET", "/api/overview")).status, 403);
  rec("admin GET review -> 403", (await call(admin, "GET", "/api/review")).status, 403);
  rec("admin reads a task -> 403", (await call(admin, "GET", `/api/tasks/${rootA.id}`)).status, 403);
  rec("admin edits a project -> 403", (await call(admin, "PATCH", `/api/projects/${pA.id}`, { name: "no" })).status, 403);
  rec("admin lists users -> 200", (await call(admin, "GET", "/api/users")).status, 200);

  console.log("\n── account writes (phase 21: managers + admins are peers) ──");
  rec("admin creates a manager -> 201", (await call(admin, "POST", "/api/users", { name: "P14 m2", email: `${PREFIX}m2@orbit.local`, role: "MANAGER" })).status, 201);
  rec("manager creates a developer -> 201 (phase 21)", (await call(mgrA, "POST", "/api/users", { name: "x", email: `${PREFIX}x@orbit.local`, role: "RESOURCE" })).status, 201);
  rec("lead creates a developer -> 403 (not an account admin)", (await call(lead, "POST", "/api/users", { name: "y", email: `${PREFIX}y@orbit.local`, role: "RESOURCE" })).status, 403);
  rec("manager can't touch the admin -> 403 (phase 21)", (await call(mgrA, "PATCH", `/api/users/${admin.id}`, { disable: true })).status, 403);
  rec("manager lists users -> 200 (dropdowns)", (await call(mgrA, "GET", "/api/users")).status, 200);
  rec("lead lists users -> 200", (await call(lead, "GET", "/api/users")).status, 200);

  console.log("\n── CHANGE 2: managers siloed by ownership ──");
  rec("owner sees their tool", await listHas(mgrA, "/api/projects", pA.id), true);
  rec("other manager does NOT see it", await listHas(mgrB, "/api/projects", pA.id), false);
  rec("other manager reads its tasks -> 404", (await call(mgrB, "GET", `/api/tasks?projectId=${pA.id}`)).status, 404);
  rec("other manager edits it -> 404 (don't disclose)", (await call(mgrB, "PATCH", `/api/projects/${pA.id}`, { name: "no" })).status, 404);
  rec("lead sees every tool", await listHas(lead, "/api/projects", pA.id), true);

  console.log("\n── owner vs collaborator ──");
  rec("owner renames own tool -> 200", (await call(mgrA, "PATCH", `/api/projects/${pA.id}`, { name: "P14 A" })).status, 200);
  rec("owner invites a manager -> 201", (await call(mgrA, "POST", `/api/projects/${pA.id}/managers`, { userId: mgrB.id })).status, 201);
  rec("invited manager sees the invite", ((await call(mgrB, "GET", "/api/collaboration-invites")).json ?? []).some((i: any) => i.projectId === pA.id), true);
  rec("before accepting, collaborator can't see the tool", await listHas(mgrB, "/api/projects", pA.id), false);
  rec("collaborator accepts -> 200", (await call(mgrB, "POST", `/api/collaboration-invites/${pA.id}`, {})).status, 200);
  rec("after accepting, collaborator SEES the tool", await listHas(mgrB, "/api/projects", pA.id), true);
  rec("collaborator edits a task -> 200 (works in-project)", (await call(mgrB, "PATCH", `/api/tasks/${rootA.id}`, { priority: "P1" })).status, 200);
  const gates = (await call(mgrB, "GET", `/api/tasks/${rootA.id}`)).json?.gates ?? [];
  const flip = (k: string, d: boolean) => gates.map((g: any) => g.key === k ? { ...g, done: d } : g);
  rec("collaborator ticks Verified -> 200", (await call(mgrB, "PATCH", `/api/tasks/${rootA.id}`, { gates: flip("verified", true) })).status, 200);
  rec("collaborator manages members -> 200", (await call(mgrB, "POST", `/api/projects/${pA.id}/members`, { userId: dev.id })).status, 200);
  rec("collaborator renames the tool -> 403 (owner-only)", (await call(mgrB, "PATCH", `/api/projects/${pA.id}`, { name: "no" })).status, 403);
  rec("collaborator deletes the tool -> 403 (owner-only)", (await call(mgrB, "DELETE", `/api/projects/${pA.id}`)).status, 403);
  rec("collaborator invites another manager -> 403 (owner-only)", (await call(mgrB, "POST", `/api/projects/${pA.id}/managers`, { userId: mgrA.id })).status, 403);

  console.log("\n── collaboration: OTHER projects + revoke + decline ──");
  const pA2 = (await mkProj(mgrA, "P14 A2")).json;
  rec("collaborator does NOT see owner's OTHER tool", await listHas(mgrB, "/api/projects", pA2.id), false);
  rec("owner revokes collaborator -> 200", (await call(mgrA, "DELETE", `/api/projects/${pA.id}/managers/${mgrB.id}`)).status, 200);
  rec("after revoke, collaborator loses access -> 404", (await call(mgrB, "GET", `/api/tasks?projectId=${pA.id}`)).status, 404);
  await call(mgrA, "POST", `/api/projects/${pA.id}/managers`, { userId: mgrB.id }); // re-invite
  rec("collaborator declines -> 200", (await call(mgrB, "DELETE", `/api/collaboration-invites/${pA.id}`)).status, 200);
  rec("after decline, no access", await listHas(mgrB, "/api/projects", pA.id), false);

  console.log("\n── CHANGE 4: password reset ──");
  rec("forgot for a real email -> 200 (generic)", (await call(null, "POST", "/api/password-reset/request", { email: dev.email })).status, 200);
  rec("forgot for a bogus email -> 200 (generic)", (await call(null, "POST", "/api/password-reset/request", { email: "nobody-p14@orbit.local" })).status, 200);
  const q1 = (await call(admin, "GET", "/api/password-reset")).json ?? [];
  rec("admin sees the pending request", q1.some((r: any) => r.userId === dev.id), true);
  rec("bogus email created NO request", q1.some((r: any) => r.email === "nobody-p14@orbit.local"), false);
  await call(null, "POST", "/api/password-reset/request", { email: dev.email }); // dedupe
  const q2 = (await call(admin, "GET", "/api/password-reset")).json ?? [];
  rec("dedupe: still ONE request for the user", q2.filter((r: any) => r.userId === dev.id).length, 1);
  const reqId = q2.find((r: any) => r.userId === dev.id).id;
  rec("admin resolves the request -> 200", (await call(admin, "POST", `/api/password-reset/${reqId}/resolve`, {})).status, 200);
  rec("request is gone from the queue", ((await call(admin, "GET", "/api/password-reset")).json ?? []).some((r: any) => r.id === reqId), false);
  // Old password STILL works — the reset only changes it once the link is used.
  const stillWorks = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: dev.email, password: dev.password }) });
  rec("old password still valid after resolve", stillWorks.ok, true);

  console.log("\n── SAFETY: guards + delete-BLOCK for project owners (phase 29) ──");
  rec("admin disables self -> 403", (await call(admin, "PATCH", `/api/users/${admin.id}`, { disable: true })).status, 403);
  rec("admin deletes self -> 403", (await call(admin, "DELETE", `/api/users/${admin.id}`)).status, 403);
  // A member-only user (owns no projects) CAN now be deleted (throwaway, so the
  // main `dev` actor survives for the rest of the suite).
  const devDel = await mk("devDel", "RESOURCE");
  rec("delete a member-only user (owns nothing) -> 200", (await call(admin, "DELETE", `/api/users/${devDel.id}`)).status, 200);
  // A manager who OWNS projects is BLOCKED (409) — the projects are NOT cascaded.
  const mgrC = await mk("mgrC", "MANAGER");
  const pC1 = (await mkProj(mgrC, "P14 C1")).json;
  const pC2 = (await mkProj(mgrC, "P14 C2")).json;
  await call(mgrA, "POST", `/api/projects/${pA.id}/managers`, { userId: mgrC.id });
  await call(mgrC, "POST", `/api/collaboration-invites/${pA.id}`, {}); // mgrC collaborates on pA
  const blocked = await call(admin, "DELETE", `/api/users/${mgrC.id}`);
  rec("delete a manager who OWNS projects -> 409 (blocked)", blocked.status, 409);
  rec("409 reports the owned-project count (2)", blocked.json?.ownedProjectCount, 2);
  rec("owned project C1 SURVIVES (not cascaded)", (await prisma.project.findUnique({ where: { id: pC1.id } })) !== null, true);
  rec("owned project C2 SURVIVES (not cascaded)", (await prisma.project.findUnique({ where: { id: pC2.id } })) !== null, true);
  // Once the owned projects are removed, the manager deletes (200); the project
  // they only collaborated on (owner mgrA) survives.
  await call(mgrC, "DELETE", `/api/projects/${pC1.id}`);
  await call(mgrC, "DELETE", `/api/projects/${pC2.id}`);
  rec("with no owned projects, the manager deletes -> 200", (await call(admin, "DELETE", `/api/users/${mgrC.id}`)).status, 200);
  rec("the collaborated-on project (owner mgrA) SURVIVES", (await prisma.project.findUnique({ where: { id: pA.id } })) !== null, true);

  console.log("\n── retained: task/gate roles ──");
  const devTask = (await call(dev, "POST", "/api/tasks", { projectId: pA.id, title: "P14 dev", dueDate: iso(2 * day) })).json;
  // dev must be a member/assignee to see pA — they were added as a member above and this task auto-assigns to them.
  rec("dev creates a task in a member project -> 201", devTask?.id ? 201 : 0, 201);
  const dg = (await call(mgrA, "GET", `/api/tasks/${devTask.id}`)).json?.gates ?? [];
  const dflip = (k: string, d: boolean) => dg.map((g: any) => g.key === k ? { ...g, done: d } : g);
  rec("dev flips a build gate -> 200", (await call(dev, "PATCH", `/api/tasks/${devTask.id}`, { gates: dflip("built", true) })).status, 200);
  rec("dev flips Verified -> 403", (await call(dev, "PATCH", `/api/tasks/${devTask.id}`, { gates: dflip("verified", true) })).status, 403);

  // ── teardown ──
  const ids = [admin.id, mgrA.id, mgrB.id, mgrC.id, lead.id, dev.id];
  await prisma.invite.deleteMany({ where: { OR: [{ user: { email: { startsWith: PREFIX } } }, { createdById: { in: ids } }] } });
  await prisma.passwordResetRequest.deleteMany({ where: { user: { email: { startsWith: PREFIX } } } });
  await prisma.task.deleteMany({ where: { project: { name: { startsWith: "P14 " } } } });
  await prisma.taskNote.deleteMany({ where: { authorId: { in: ids } } });
  await prisma.projectNote.deleteMany({ where: { authorId: { in: ids } } });
  await prisma.project.deleteMany({ where: { name: { startsWith: "P14 " } } });
  // Departments (createdById Restrict) must go before their creators.
  await prisma.department.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
