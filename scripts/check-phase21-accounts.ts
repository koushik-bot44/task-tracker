/**
 * Phase 21 — manager account powers + single-admin cap.
 *
 * Managers and admins are now PEERS on account administration: either can
 * create/invite (developer, lead, manager), disable/enable, reset passwords and
 * change roles. Two invariants sit on top: only an ADMIN may touch the admin
 * account, and there is exactly ONE admin — minting or promoting a second is
 * refused (409). This proves the new matrix against the live server.
 *
 * The real admin is NEVER touched. A THROWAWAY admin (p21-admin) stands in for
 * every admin-actor / admin-target case, exactly as check-phase14-perms does;
 * the run records the admin count before and after and asserts it is restored,
 * so no stray admin is ever left behind. Hard teardown; p21- actors only.
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const BASE = "http://localhost:3000";
const PREFIX = "p21-";
const prisma = new PrismaClient();

let pass = 0,
  fail = 0;
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

async function main() {
  const adminsBefore = await prisma.user.count({ where: { role: "ADMIN" } });

  const mk = async (label: string, role: "MANAGER" | "TEAM_LEAD" | "RESOURCE" | "ADMIN"): Promise<Actor> => {
    const email = `${PREFIX}${label}@orbit.local`.toLowerCase();
    const password = generateTempPassword(16);
    const u = await prisma.user.upsert({
      where: { email },
      update: { passwordHash: await hashPassword(password), role, disabledAt: null, status: "ACTIVE" },
      create: { email, name: `P21 ${label}`, role, passwordHash: await hashPassword(password), status: "ACTIVE" },
    });
    return { id: u.id, email, password, cookie: await signIn(email, password) };
  };

  const admin = await mk("admin", "ADMIN"); // throwaway — real admin untouched
  const mgr1 = await mk("mgr1", "MANAGER");
  const mgr2 = await mk("mgr2", "MANAGER");
  const lead = await mk("lead", "TEAM_LEAD");
  const dev = await mk("dev", "RESOURCE");

  const createUser = (actor: Actor, role: string, label: string) =>
    call(actor, "POST", "/api/users", { name: `P21 ${label}`, email: `${PREFIX}c-${label}@orbit.local`, role });

  console.log("── create/invite: managers AND admins create accounts ──");
  rec("manager creates a DEVELOPER -> 201", (await createUser(mgr1, "RESOURCE", "d1")).status, 201);
  rec("manager creates a TEAM_LEAD -> 201", (await createUser(mgr1, "TEAM_LEAD", "l1")).status, 201);
  rec("manager creates a MANAGER -> 201", (await createUser(mgr1, "MANAGER", "m1")).status, 201);
  rec("manager creates an ADMIN -> 403", (await createUser(mgr1, "ADMIN", "a1")).status, 403);
  rec("admin creates a DEVELOPER -> 201", (await createUser(admin, "RESOURCE", "d2")).status, 201);
  rec("lead creates a developer -> 403 (not an account admin)", (await createUser(lead, "RESOURCE", "d3")).status, 403);

  console.log("\n── single-admin cap: exactly one admin ──");
  rec("admin creates a 2nd ADMIN -> 409 (cap)", (await createUser(admin, "ADMIN", "a2")).status, 409);
  rec("manager promotes a dev TO admin -> 403 (only admin grants admin)", (await call(mgr1, "PATCH", `/api/users/${dev.id}`, { role: "ADMIN" })).status, 403);
  rec("admin promotes a dev TO admin -> 409 (cap)", (await call(admin, "PATCH", `/api/users/${dev.id}`, { role: "ADMIN" })).status, 409);

  console.log("\n── manager disable / enable / reset / role (non-admin targets) ──");
  rec("manager disables a developer -> 200", (await call(mgr1, "PATCH", `/api/users/${dev.id}`, { disable: true })).status, 200);
  rec("manager re-enables the developer -> 200", (await call(mgr1, "PATCH", `/api/users/${dev.id}`, { disable: false })).status, 200);
  rec("manager disables a team lead -> 200", (await call(mgr1, "PATCH", `/api/users/${lead.id}`, { disable: true })).status, 200);
  await call(mgr1, "PATCH", `/api/users/${lead.id}`, { disable: false });
  rec("manager disables ANOTHER manager -> 200 (not last)", (await call(mgr1, "PATCH", `/api/users/${mgr2.id}`, { disable: true })).status, 200);
  await call(mgr1, "PATCH", `/api/users/${mgr2.id}`, { disable: false });
  const rd = await call(mgr1, "PATCH", `/api/users/${dev.id}`, { reset: true });
  rec("manager resets a developer password -> 200 + tempPassword", rd.status === 200 && Boolean(rd.json?.tempPassword), true);
  rec("manager resets a lead password -> 200", (await call(mgr1, "PATCH", `/api/users/${lead.id}`, { reset: true })).status, 200);
  rec("manager resets a manager password -> 200", (await call(mgr1, "PATCH", `/api/users/${mgr2.id}`, { reset: true })).status, 200);
  rec("manager changes a dev's role dev->lead -> 200", (await call(mgr1, "PATCH", `/api/users/${dev.id}`, { role: "TEAM_LEAD" })).status, 200);
  await call(mgr1, "PATCH", `/api/users/${dev.id}`, { role: "RESOURCE" });

  console.log("\n── the admin account is off-limits to a manager ──");
  rec("manager disables the admin -> 403", (await call(mgr1, "PATCH", `/api/users/${admin.id}`, { disable: true })).status, 403);
  rec("manager resets the admin -> 403", (await call(mgr1, "PATCH", `/api/users/${admin.id}`, { reset: true })).status, 403);
  rec("manager re-roles the admin -> 403", (await call(mgr1, "PATCH", `/api/users/${admin.id}`, { role: "MANAGER" })).status, 403);
  rec("manager deletes the admin -> 403", (await call(mgr1, "DELETE", `/api/users/${admin.id}`)).status, 403);

  console.log("\n── self / sole-admin guards ──");
  rec("manager disables self -> 403", (await call(mgr1, "PATCH", `/api/users/${mgr1.id}`, { disable: true })).status, 403);
  rec("manager deletes self -> 403", (await call(mgr1, "DELETE", `/api/users/${mgr1.id}`)).status, 403);
  rec("admin disables self -> 403 (no one disables their own account)", (await call(admin, "PATCH", `/api/users/${admin.id}`, { disable: true })).status, 403);

  console.log("\n── the cap predicate: COUNT(role=ADMIN, any status) >= 1 ──");
  rec("an admin already exists, so the cap is active", (await prisma.user.count({ where: { role: "ADMIN" } })) >= 1, true);

  // ── teardown ──────────────────────────────────────────────────────────────
  const ids = (await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } })).map((u) => u.id);
  await prisma.invite.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdById: { in: ids } }] } });
  await prisma.project.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.department.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });

  const residue = await prisma.user.count({ where: { email: { startsWith: PREFIX } } });
  const adminsAfter = await prisma.user.count({ where: { role: "ADMIN" } });
  rec("teardown: no p21- residue", residue, 0);
  rec("teardown: admin count restored (no stray admin)", adminsAfter, adminsBefore);

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
