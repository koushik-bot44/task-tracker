/**
 * Department-rollup test (phase 12). Proves the department-scoped overview aggregates
 * EXACTLY that department's tools and that its rollup equals the sum of those tools'
 * per-project stats — no leakage from tools in other departments.
 *
 * Throwaway manager + disposable "FR-" fixtures, torn down at the end. Never
 * touches real projects.
 *
 *   npx tsx --env-file=.env scripts/check-department-rollup.ts
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PREFIX = "frtest-";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, detail = "") {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

let cookie = "";
async function signIn(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in ${email}: ${res.status}`);
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
}
async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

const METRICS = ["doneLeaves", "totalLeaves", "inFlight", "blocked", "overdue", "atRisk", "unscheduled"] as const;
const sum = (rows: any[], key: string) => rows.reduce((n, r) => n + (r[key] ?? 0), 0);

async function main() {
  const email = `${PREFIX}manager@orbit.local`;
  const password = generateTempPassword(16);
  const mgr = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: await hashPassword(password), role: "MANAGER", disabledAt: null, status: "ACTIVE" },
    create: { email, name: "FR Manager", role: "MANAGER", passwordHash: await hashPassword(password), status: "ACTIVE" },
  });
  const lead = await prisma.user.upsert({
    where: { email: `${PREFIX}lead@orbit.local` },
    update: { passwordHash: await hashPassword(password), role: "TEAM_LEAD", disabledAt: null, status: "ACTIVE" },
    create: { email: `${PREFIX}lead@orbit.local`, name: "FR Lead", role: "TEAM_LEAD", passwordHash: await hashPassword(password), status: "ACTIVE" },
  });
  await signIn(email, password);

  const day = 86_400_000;
  const iso = (d: number) => new Date(Date.now() + d).toISOString();

  const departmentA = await api<{ id: string }>("POST", "/api/departments", { name: "FR- Dept A", color: "#0d9488" });
  const departmentB = await api<{ id: string }>("POST", "/api/departments", { name: "FR- Dept B", color: "#7c3aed" });

  const mkProject = async (name: string, departmentId: string | null) =>
    api<{ id: string; slug: string }>("POST", "/api/projects", {
      name, description: "department-rollup fixture", leadId: lead.id, departmentId,
    });
  const mkTask = async (projectId: string, over: Record<string, unknown>) =>
    api<{ id: string }>("POST", "/api/tasks", { projectId, dueDate: iso(3 * day), ...over });

  const A1 = await mkProject("FR- A1", departmentA.id);
  const A2 = await mkProject("FR- A2", departmentA.id);
  const B1 = await mkProject("FR- B1", departmentB.id);
  const U1 = await mkProject("FR- Unfiled", null);

  // A mix so the metrics are non-trivial.
  await mkTask(A1.id, { title: "FR- a1 overdue", status: "IN_PROGRESS", dueDate: iso(-2 * day) });
  await mkTask(A1.id, { title: "FR- a1 done", status: "DONE" });
  await mkTask(A2.id, { title: "FR- a2 blocked", status: "BLOCKED", dueDate: iso(-2 * day) });
  await mkTask(A2.id, { title: "FR- a2 done", status: "DONE" });
  // Root tasks require a date at creation, so make an unscheduled one by clearing
  // the date afterward.
  const undated = await mkTask(A2.id, { title: "FR- a2 undated", status: "BACKLOG" });
  await api("PATCH", `/api/tasks/${undated.id}`, { dueDate: null });
  await mkTask(B1.id, { title: "FR- b1 overdue", status: "IN_PROGRESS", dueDate: iso(-2 * day) });
  await mkTask(U1.id, { title: "FR- u1 done", status: "DONE" });

  const global = await api<any>("GET", "/api/overview");
  const departmentAov = await api<any>("GET", `/api/overview?departmentId=${departmentA.id}`);

  // 1) Department overview contains EXACTLY department A's projects.
  const aIds = new Set(departmentAov.projects.map((p: any) => p.id));
  ok("department overview holds exactly {A1, A2}",
    aIds.size === 2 && aIds.has(A1.id) && aIds.has(A2.id),
    [...aIds].join(","));
  ok("department overview EXCLUDES B1 (other department)", !aIds.has(B1.id));
  ok("department overview EXCLUDES the unfiled tool", !aIds.has(U1.id));

  // 2) Department rollup global == sum of the department's own per-project rows. The
  // global block carries the schedule + flow fields; leaf counts live on the
  // per-project rows.
  ok("rollup overdue == sum(project.overdue)",
    departmentAov.global.overdue === sum(departmentAov.projects, "overdue"),
    `${departmentAov.global.overdue} vs ${sum(departmentAov.projects, "overdue")}`);
  ok("rollup blocked == sum(project.blocked)",
    departmentAov.global.blocked === sum(departmentAov.projects, "blocked"));
  ok("rollup inFlight == sum(project.inFlight)",
    departmentAov.global.inFlight === sum(departmentAov.projects, "inFlight"));
  ok("rollup unscheduled == sum(project.unscheduled)",
    departmentAov.global.unscheduled === sum(departmentAov.projects, "unscheduled"));

  // 3) Department rollup == the same projects taken from the GLOBAL overview.
  const globalA = global.projects.filter((p: any) => p.id === A1.id || p.id === A2.id);
  for (const m of METRICS) {
    ok(`department sum(${m}) == global sum(${m}) for A1+A2`,
      sum(departmentAov.projects, m) === sum(globalA, m),
      `${sum(departmentAov.projects, m)} vs ${sum(globalA, m)}`);
  }

  // 4) The department rollup must be strictly smaller than global (B1+U1 excluded).
  ok("department totalLeaves < global totalLeaves",
    sum(departmentAov.projects, "totalLeaves") < sum(global.projects, "totalLeaves"),
    `${sum(departmentAov.projects, "totalLeaves")} < ${sum(global.projects, "totalLeaves")}`);

  // ── teardown ──
  await prisma.task.deleteMany({ where: { title: { startsWith: "FR- " } } });
  await prisma.project.deleteMany({ where: { name: { startsWith: "FR- " } } });
  await prisma.department.deleteMany({ where: { name: { startsWith: "FR- " } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0) process.exitCode = 1;
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
