/* Scale (2026-09-11), on the clone: the Work list, search, a task and Today with
 * 10,000 tasks.
 *   npx tsx --env-file=.env.local scripts/check-scale.ts      (dev server up; run alone)
 *
 * Makes a throwaway department ("SCL …") with a manager, a lead and 20 members, a
 * project, and 10,000 tasks spread over them straight into the database: most in
 * progress, some waiting, unassigned, resolved or closed, a fifth overdue, a tenth
 * in the project, ten carrying a search word. Then asks, as each person, what the
 * screens ask for, and checks each answer is right (its total matches the database)
 * as well as quick. The dev server compiles a route on first use, so each request
 * is warmed once and timed over five runs; the budget is for the median, sized for
 * a laptop dev build. Everything is removed and every table recounted.
 */
import { PrismaClient, type WorkState } from "@prisma/client";
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";
import { istDayKey, istDayRange } from "../lib/timezone";
import { statusOf } from "../lib/work/workflow";

if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "")) {
  console.error("DATABASE_URL is not the local clone. Refusing.");
  process.exit(1);
}

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PASSWORD = "Rig-Scale-2026";
const RUN = Date.now().toString(36);
const TASKS = Number(process.env.SCALE_TASKS ?? 10_000);
const BUDGET_MS = Number(process.env.SCALE_BUDGET_MS ?? 1500);
const PAGE = 50;
const OPEN: WorkState[] = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING", "ESCALATED", "REOPENED"];

let pass = 0;
let fail = 0;
function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

let ipSeq = 0;
async function signIn(email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `10.63.0.${++ipSeq}` }, body: JSON.stringify({ email, password: PASSWORD }) });
  const set = res.headers.get("set-cookie") ?? "";
  if (!set.startsWith("orbit_session=")) throw new Error(`sign-in ${email}: ${res.status}`);
  return set.split(";")[0];
}

/** Warm once, then five timed runs: the median and the slowest, and the last answer. */
async function timed(cookie: string, path: string): Promise<{ status: number; json: any; median: number; max: number }> {
  const once = async () => {
    const t0 = performance.now();
    const res = await fetch(BASE + path, { headers: { cookie } });
    const json = await res.json().catch(() => null);
    return { status: res.status, json, ms: performance.now() - t0 };
  };
  await once();
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push(await once());
  const ms = runs.map((r) => r.ms).sort((a, b) => a - b);
  const last = runs[runs.length - 1];
  return { status: last.status, json: last.json, median: Math.round(ms[2]), max: Math.round(ms[4]) };
}
const took = (t: { median: number; max: number }) => `median ${t.median} ms, slowest ${t.max} ms`;

async function countAll(): Promise<Record<string, number>> {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%' ORDER BY tablename`);
  const out: Record<string, number> = {};
  for (const { tablename } of tables) {
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${tablename}"`);
    out[tablename] = Number(n);
  }
  return out;
}

async function cleanup(started: Date | null) {
  const ids = (await prisma.user.findMany({ where: { email: { startsWith: "scl-" } }, select: { id: true } })).map((u) => u.id);
  const departments = (await prisma.department.findMany({ where: { name: { startsWith: "SCL " } }, select: { id: true } })).map((d) => d.id);
  const where = { OR: [{ departmentId: { in: departments } }, { assigneeId: { in: ids } }, { requesterId: { in: ids } }] };
  const taskIds = (await prisma.task.findMany({ where, select: { id: true } })).map((t) => t.id);
  await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { taskId: { in: taskIds } }] } });
  await prisma.taskActivity.deleteMany({ where: { taskId: { in: taskIds } } });
  await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  await prisma.project.deleteMany({ where: { name: { startsWith: "SCL " } } });
  if (started) await prisma.loginAttempt.deleteMany({ where: { createdAt: { gte: started } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.department.deleteMany({ where: { id: { in: departments } } });
}

async function scale() {
  const hash = await hashPassword(PASSWORD);
  const lastDept = await prisma.department.findFirst({ orderBy: { orderKey: "desc" }, select: { orderKey: true } });
  const dept = await prisma.department.create({ data: { name: `SCL Department ${RUN}`, color: "#475569", orderKey: generateKeyBetween(lastDept?.orderKey ?? null, null) } });
  const mk = (key: string, role: "MANAGER" | "TEAM_LEAD" | "RESOURCE") =>
    prisma.user.create({ data: { email: `scl-${key}@example.com`, name: `SCL ${key}`, role, passwordHash: hash, status: "ACTIVE", departmentId: dept.id } });
  const manager = await mk("manager", "MANAGER");
  const lead = await mk("lead", "TEAM_LEAD");
  const members: Awaited<ReturnType<typeof mk>>[] = [];
  for (let i = 0; i < 20; i++) members.push(await mk(`member-${i}`, "RESOURCE"));
  const lastProject = await prisma.project.findFirst({ orderBy: { orderKey: "desc" }, select: { orderKey: true } });
  const project = await prisma.project.create({
    data: { name: `SCL Project ${RUN}`, slug: `scl-project-${RUN}`, color: "#475569", orderKey: generateKeyBetween(lastProject?.orderKey ?? null, null), departmentId: dept.id, ownerId: manager.id, leadId: lead.id, members: { create: members.map((m) => ({ userId: m.id })) } },
  });

  const inProject = Math.floor(TASKS / 10);
  const alone = TASKS - inProject;
  const lastAlone = await prisma.task.findFirst({ where: { isPrivate: false, projectId: null, parentId: null, deletedAt: null }, orderBy: { orderKey: "desc" }, select: { orderKey: true } });
  const aloneKeys = generateNKeysBetween(lastAlone?.orderKey ?? null, null, alone);
  const projectKeys = generateNKeysBetween(null, null, inProject);
  const today = istDayRange(istDayKey(new Date()));
  const DAY = 86_400_000;
  const t0 = performance.now();
  const rows = Array.from({ length: TASKS }, (_, i) => {
    const slot = i % 10;
    const state: WorkState = slot < 6 ? "IN_PROGRESS" : slot === 6 ? "WAITING" : slot === 7 ? "NEW" : slot === 8 ? "RESOLVED" : "CLOSED";
    const holder = state === "NEW" ? null : members[i % members.length].id;
    const project_ = i < inProject;
    const due = i % 5 === 0 ? new Date(today.start.getTime() - ((i % 30) + 1) * DAY) : i % 5 === 1 ? new Date(today.start.getTime() + ((i % 60) + 1) * DAY) : null;
    return {
      title: `SCL task ${i}${i % 1000 === 7 ? " needle" : ""}`,
      orderKey: project_ ? projectKeys[i] : aloneKeys[i - inProject],
      state,
      status: statusOf(state),
      type: project_ ? ("PROJECT_TASK" as const) : ("GENERAL" as const),
      requesterId: manager.id,
      givenById: holder ? manager.id : null,
      assigneeId: holder,
      assignedAt: holder ? new Date() : null,
      departmentId: dept.id,
      projectId: project_ ? project.id : null,
      dueDate: due,
      waitingReason: state === "WAITING" ? ("OTHER" as const) : null,
      resolvedAt: state === "RESOLVED" || state === "CLOSED" ? new Date() : null,
      closedAt: state === "CLOSED" ? new Date() : null,
    };
  });
  for (let i = 0; i < rows.length; i += 1000) await prisma.task.createMany({ data: rows.slice(i, i + 1000) });
  console.log(`INFO  made ${TASKS} tasks in ${Math.round(performance.now() - t0)} ms`);

  const ceo = await signIn(process.env.CEO_EMAIL ?? "founder@orbit.local").catch(async () => {
    const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "10.63.1.1" }, body: JSON.stringify({ email: process.env.CEO_EMAIL ?? "founder@orbit.local", password: process.env.CEO_PASSWORD ?? "orbit123" }) });
    return (res.headers.get("set-cookie") ?? "").split(";")[0];
  });
  const mgr = await signIn(manager.email);
  const member = members[3];
  const mem = await signIn(member.email);

  const openHere = { departmentId: dept.id, deletedAt: null, isPrivate: false, state: { in: OPEN } };
  const within = (t: { median: number }) => t.median <= BUDGET_MS;

  const first = await timed(mgr, "/api/work?rows=tasks&open=true");
  const expected = await prisma.task.count({ where: openHere });
  record(`the manager's Work list, first page: ${PAGE} rows and the right total, within ${BUDGET_MS} ms`, first.status === 200 && first.json?.items?.length === PAGE && first.json?.total === expected && within(first), `${first.json?.total} of ${expected}; ${took(first)}`);
  const pages = Math.ceil((first.json?.total ?? 0) / PAGE);
  const last = await timed(mgr, `/api/work?rows=tasks&open=true&page=${pages}`);
  record(`…its last page (page ${pages}) holds what is left over`, last.status === 200 && last.json?.items?.length === expected - PAGE * (pages - 1) && within(last), `${last.json?.items?.length} rows; ${took(last)}`);

  const ceoAll = await timed(ceo, "/api/work?rows=tasks&open=true");
  const everyOpen = await prisma.task.count({ where: { deletedAt: null, isPrivate: false, state: { in: OPEN } } });
  record("the CEO's All list: the right total, within budget", ceoAll.status === 200 && ceoAll.json?.total === everyOpen && within(ceoAll), `${ceoAll.json?.total} of ${everyOpen}; ${took(ceoAll)}`);

  const mine = await timed(mem, "/api/work?rows=tasks&open=true&mine=assigned");
  const theirs = await prisma.task.count({ where: { ...openHere, assigneeId: member.id } });
  record("a member's Your work: only theirs, within budget", mine.status === 200 && mine.json?.total === theirs && within(mine), `${mine.json?.total} of ${theirs}; ${took(mine)}`);

  const overdue = await timed(mgr, "/api/work?rows=tasks&open=true&overdue=1");
  const late = await prisma.task.count({ where: { ...openHere, dueDate: { lt: today.start } } });
  record("Overdue: the right total, within budget", overdue.status === 200 && overdue.json?.total === late && within(overdue), `${overdue.json?.total} of ${late}; ${took(overdue)}`);

  const search = await timed(mgr, "/api/work?rows=tasks&open=false&q=needle");
  record("a search over 10,000 finds the ten, within budget", search.status === 200 && search.json?.total === Math.ceil(TASKS / 1000) && within(search), `${search.json?.total}; ${took(search)}`);

  const one = await prisma.task.findFirst({ where: { departmentId: dept.id, assigneeId: member.id, state: "IN_PROGRESS" }, select: { number: true } });
  const record_ = await timed(mem, `/api/work/${one?.number}`);
  record("one task's record, within budget", record_.status === 200 && within(record_), took(record_));

  const todayMember = await timed(mem, "/api/today");
  record("Today for a member holding 300 tasks, within budget", todayMember.status === 200 && within(todayMember), took(todayMember));
  const todayManager = await timed(mgr, "/api/today");
  record("Today for the manager who gave all 10,000, within budget", todayManager.status === 200 && within(todayManager), took(todayManager));
}

async function main() {
  await cleanup(null);
  const before = await countAll();
  const started = new Date();
  try {
    await scale();
  } catch (e) {
    record("the checks ran to the end", false, (e instanceof Error ? e.message : String(e)).split("\n")[0]);
  } finally {
    await cleanup(started);
    const after = await countAll();
    const changed = Object.keys({ ...before, ...after }).filter((t) => before[t] !== after[t]);
    record("the run leaves no trace: every table holds what it held before", changed.length === 0, changed.map((t) => `${t} ${before[t]}→${after[t]}`).join(", "));
  }
}

main()
  .catch((e) => {
    console.error(e);
    fail++;
  })
  .finally(async () => {
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  });
