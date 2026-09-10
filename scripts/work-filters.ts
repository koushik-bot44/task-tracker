/* The Work list's filters, every way round (owner, 2026-09-10 — "go through
 * them like loops, loops inside loops, cross-check all types").
 *
 *   npm run work-filters
 *
 * Seeds throwaway work (title "WFX …") and a throwaway team, then checks:
 *   A. API × database — every tab × Show × Priority × Type, every page, for
 *      seven people; the four orders; sub-steps never listed
 *   B. the real screen — the same controls changed one at a time in a browser,
 *      so a list that did not refresh shows up as a row that breaks the filter
 *   C. the scenarios that went wrong — links that land with hidden filters,
 *      search, paging, a change made elsewhere, the department tree, counts
 * Everything it made is removed afterwards, pass or fail.
 */
import { chromium, type Browser, type Page } from "playwright";
import { PrismaClient, type WorkPriority, type WorkState, type WorkType } from "@prisma/client";
import { istDayKey, istDayRange } from "../lib/timezone";

const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PASSWORD = "orbit123";
const PREFIX = "WFX ";
const PAGE_SIZE = 50;
const prisma = new PrismaClient();

const OPEN: WorkState[] = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING", "ESCALATED", "REOPENED"];
const STATES: WorkState[] = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED", "CANCELLED", "ESCALATED", "REOPENED"];
const PRIORITIES: WorkPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const TYPES: WorkType[] = ["GENERAL", "ISSUE", "REQUEST", "PROJECT_TASK", "APPROVAL", "SUPPORT"];
// Show: Unassigned is gone and Awaiting meeting is new (owner, 2026-09-11).
const SLICES = ["open", "meeting", "overdue", "high", "waiting", "resolved", "finished", "everything"] as const;
type Slice = (typeof SLICES)[number];
type ScopeKey = "all" | "department" | "individual" | "team" | "requested" | "assigned";
const TAB_LABEL: Record<string, ScopeKey> = { All: "all", Departments: "department", Individual: "individual", "Your team's work": "team", "Assigned by you": "requested", "Your work": "assigned" };

// ── bookkeeping ─────────────────────────────────────────────────────────────
const sections: { name: string; checks: number; fails: string[] }[] = [];
let current = { name: "", checks: 0, fails: [] as string[] };
function section(name: string) {
  current = { name, checks: 0, fails: [] };
  sections.push(current);
  console.log(`\n── ${name} ${"─".repeat(Math.max(4, 66 - name.length))}`);
}
function check(ok: boolean, label: string) {
  current.checks++;
  if (!ok) {
    current.fails.push(label);
    if (current.fails.length <= 12) console.log(`FAIL  ${label}`);
  }
}

// ── the data, as the database holds it ──────────────────────────────────────
type Row = {
  id: string; number: number; title: string; state: WorkState; priority: WorkPriority; type: WorkType;
  dueDate: Date | null; assigneeId: string | null; requesterId: string | null; departmentId: string | null;
  assignmentGroupId: string | null; projectId: string | null; siblingKey: string | null;
  updatedAt: Date; createdAt: Date; descriptionMd: string;
  assignee: { name: string } | null; requester: { name: string } | null;
};
let rows: Row[] = [];
let byNumber = new Map<number, Row>();
let byId = new Map<string, Row>();
let childNumbers = new Set<number>();
/** Tasks with a meeting ahead, today included. */
let withMeeting = new Set<string>();
const todayStart = () => istDayRange(istDayKey(new Date())).start;

async function loadRows() {
  rows = (await prisma.task.findMany({
    where: { deletedAt: null, isPrivate: false, parentId: null },
    select: {
      id: true, number: true, title: true, state: true, priority: true, type: true, dueDate: true, assigneeId: true,
      requesterId: true, departmentId: true, assignmentGroupId: true, projectId: true, siblingKey: true,
      updatedAt: true, createdAt: true, descriptionMd: true, assignee: { select: { name: true } }, requester: { select: { name: true } },
    },
  })) as Row[];
  byNumber = new Map(rows.map((r) => [r.number, r]));
  byId = new Map(rows.map((r) => [r.id, r]));
  childNumbers = new Set((await prisma.task.findMany({ where: { parentId: { not: null } }, select: { number: true } })).map((c) => c.number));
  const events = await prisma.calendarEvent.findMany({
    where: { taskId: { not: null }, isMeeting: true, date: { gte: new Date(`${istDayKey(new Date())}T00:00:00.000Z`) } },
    select: { taskId: true },
  });
  withMeeting = new Set(events.map((e) => e.taskId!));
}

/** What each control MEANS, written independently of the code under test. */
function sliceMatch(s: Slice, r: Row): boolean {
  const open = OPEN.includes(r.state);
  switch (s) {
    case "open": return open;
    case "meeting": return open && withMeeting.has(r.id);
    case "overdue": return open && r.dueDate !== null && r.dueDate < todayStart();
    // Not a filter since 7e7a3e3: every open task, highest priority first
    // (owner, 2026-09-10 — "it only shows high priority").
    case "high": return open;
    case "waiting": return r.state === "WAITING";
    case "resolved": return r.state === "RESOLVED";
    case "finished": return r.state === "CLOSED" || r.state === "CANCELLED";
    case "everything": return true;
  }
}
type Who = { email: string; id: string; role: string; departmentIds: Set<string>; groupIds: Set<string>; all: boolean };
function mineMatch(scope: ScopeKey, r: Row, who: Who): boolean {
  switch (scope) {
    case "all": return true;
    case "assigned": return r.assigneeId === who.id;
    case "requested": return r.requesterId === who.id;
    case "team": return r.assignmentGroupId !== null && who.groupIds.has(r.assignmentGroupId);
    case "department": return who.all || (r.departmentId !== null && who.departmentIds.has(r.departmentId));
    // Given straight to a person, in no department (owner, 2026-09-11).
    case "individual": return r.departmentId === null && r.assigneeId !== null;
  }
}
function searchMatch(q: string, r: Row): boolean {
  const n = q.toLowerCase();
  return r.title.toLowerCase().includes(n) || r.descriptionMd.toLowerCase().includes(n) ||
    (r.assignee?.name ?? "").toLowerCase().includes(n) || (r.requester?.name ?? "").toLowerCase().includes(n);
}
/** A task given to several people is one row on screen. */
function distinct(list: Row[]): number {
  const keys = new Set<string>();
  for (const r of list) keys.add(r.siblingKey ?? `id:${r.id}`);
  return keys.size;
}

// ── talking to the app ──────────────────────────────────────────────────────
async function cookieFor(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  if (!r.ok) throw new Error(`sign-in ${email}: ${r.status}`);
  return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}
async function getJson(cookie: string, path: string): Promise<any> {
  const r = await fetch(`${BASE}${path}`, { headers: { cookie } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}
/** Every page of a query, the way the screen walks them. */
async function allPages(cookie: string, params: Record<string, string>): Promise<{ ids: string[]; total: number; dups: string[]; pages: number }> {
  const ids: string[] = [];
  const seen = new Set<string>();
  const dups: string[] = [];
  let cursor: string | null = null;
  let total = -1;
  let pages = 0;
  do {
    const p = new URLSearchParams({ ...params, limit: String(PAGE_SIZE), ...(cursor ? { cursor } : {}) });
    const page = await getJson(cookie, `/api/work?${p}`);
    if (total < 0) total = page.total;
    for (const t of page.items) {
      if (seen.has(t.id)) dups.push(t.id);
      seen.add(t.id);
      ids.push(t.id);
    }
    cursor = page.nextCursor;
    pages++;
  } while (cursor && pages < 40);
  return { ids, total, dups, pages };
}
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}
async function whoIs(email: string): Promise<Who> {
  const u = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true, role: true, departmentId: true } });
  const headed = await prisma.department.findMany({ where: { hodId: u.id }, select: { id: true } });
  const member = await prisma.assignmentGroupMember.findMany({ where: { userId: u.id }, select: { groupId: true } });
  const led = await prisma.assignmentGroup.findMany({ where: { leadId: u.id }, select: { id: true } });
  const departmentIds = new Set([...(u.departmentId ? [u.departmentId] : []), ...(u.role === "HOD" ? headed.map((d) => d.id) : [])]);
  return { email, id: u.id, role: u.role, departmentIds, groupIds: new Set([...member.map((m) => m.groupId), ...led.map((g) => g.id)]), all: u.role === "FOUNDER" };
}
function scopesOffered(who: Who): ScopeKey[] {
  const leadOrAbove = ["FOUNDER", "CO_FOUNDER", "HOD", "MANAGER", "TEAM_LEAD"].includes(who.role);
  const out: ScopeKey[] = [];
  if (who.role === "FOUNDER") out.push("all");
  if (leadOrAbove) out.push("department", "individual");
  if (who.groupIds.size) out.push("team");
  out.push("requested", "assigned");
  return out;
}

// ── seeding ─────────────────────────────────────────────────────────────────
const made = { taskIds: [] as string[], groupId: "", milestoneId: "", projectId: "", departmentId: "" };

async function seed() {
  const dev = await prisma.department.findFirstOrThrow({ where: { name: "Development" }, select: { id: true } });
  const id = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;
  // A project of its own, so the rig never depends on what the clone happens to hold.
  const pets = await prisma.project.create({
    data: { name: `${PREFIX}project`, slug: "wfx-project", color: "#4ade80", orderKey: "zzz-wfx", departmentId: dev.id, ownerId: await id("founder@orbit.local") },
    select: { id: true },
  });
  made.departmentId = dev.id;
  made.projectId = pets.id;
  const [ceo, lead, m1, m2, abhi, mgr] = await Promise.all([
    id("founder@orbit.local"), id("staff-development-lead@orbit.local"), id("staff-development-member-1@orbit.local"),
    id("staff-development-member-2@orbit.local"), id("abhi@orbit.local"), id("test-manager@orbit.local"),
  ]);
  const team = await prisma.assignmentGroup.create({
    data: { departmentId: dev.id, name: `${PREFIX}team`, leadId: lead, orderKey: "wfx", members: { create: [{ userId: m1 }, { userId: m2 }] } },
  });
  made.groupId = team.id;

  const day = (offsetDays: number, hour = 6) => new Date(istDayRange(istDayKey(new Date())).start.getTime() + offsetDays * 86_400_000 + hour * 3_600_000);
  const dues = [null, day(-4), day(0), day(5), day(20), day(-1), day(1)];
  const assignees = [m1, m2, abhi, lead];
  const requesters = [lead, mgr, ceo, m1];
  const now = new Date();
  for (let i = 0; i < 70; i++) {
    const state = STATES[i % STATES.length];
    const assigneeId = i % 5 === 0 ? null : assignees[i % assignees.length];
    const t = await prisma.task.create({
      data: {
        title: `${PREFIX}${i}${i % 11 === 0 ? " WFXSEARCH" : ""}`,
        orderKey: `wfx-${String(i).padStart(3, "0")}`,
        state, priority: PRIORITIES[i % 4], type: TYPES[i % 6],
        assigneeId, assignedAt: assigneeId ? now : null,
        assignmentGroupId: i % 3 === 0 ? team.id : null,
        requesterId: requesters[i % 4], givenById: requesters[i % 4],
        departmentId: dev.id, projectId: i % 2 === 0 ? pets.id : null,
        dueDate: dues[i % dues.length],
        resolvedAt: state === "RESOLVED" ? now : null, closedAt: state === "CLOSED" || state === "CANCELLED" ? now : null,
      },
      select: { id: true },
    });
    made.taskIds.push(t.id);
  }
  // One task given to three people.
  for (const who of [m1, m2, abhi]) {
    const t = await prisma.task.create({
      data: { title: `${PREFIX}shared`, orderKey: "wfx-shared", state: "ASSIGNED", priority: "HIGH", type: "REQUEST", assigneeId: who, assignedAt: now, requesterId: lead, givenById: lead, departmentId: dev.id, siblingKey: "wfx-shared-1" },
      select: { id: true },
    });
    made.taskIds.push(t.id);
  }
  // A task with steps: the steps must never appear in the list.
  const parent = await prisma.task.create({
    data: { title: `${PREFIX}parent`, orderKey: "wfx-parent", state: "ASSIGNED", priority: "MEDIUM", type: "GENERAL", assigneeId: m1, assignedAt: now, requesterId: lead, departmentId: dev.id },
    select: { id: true },
  });
  made.taskIds.push(parent.id);
  for (let s = 0; s < 2; s++) {
    const c = await prisma.task.create({ data: { title: `${PREFIX}step ${s}`, orderKey: `wfx-step-${s}`, parentId: parent.id, state: "ASSIGNED", priority: "LOW", type: "GENERAL", departmentId: dev.id }, select: { id: true } });
    made.taskIds.push(c.id);
  }
  // A task inside a milestone, for the "changed somewhere else" check.
  const review = new Date(`${istDayKey(day(10))}T00:00:00.000Z`);
  const ms = await prisma.milestone.create({ data: { projectId: pets.id, name: `${PREFIX}milestone`, reviewDate: review, orderKey: "zzz-wfx" }, select: { id: true } });
  made.milestoneId = ms.id;
  const mt = await prisma.task.create({
    data: { title: `${PREFIX}milestone task`, orderKey: "wfx-ms", state: "ASSIGNED", priority: "MEDIUM", type: "PROJECT_TASK", assigneeId: m1, assignedAt: now, requesterId: ceo, departmentId: dev.id, projectId: pets.id, milestoneId: ms.id, dueDate: review, dueProvisional: true },
    select: { id: true },
  });
  made.taskIds.push(mt.id);
  // A meeting ahead on one open task, for Awaiting meeting (owner, 2026-09-11).
  const withAMeeting = await prisma.task.findFirstOrThrow({ where: { id: { in: made.taskIds }, state: "IN_PROGRESS", parentId: null }, select: { id: true } });
  await prisma.calendarEvent.create({
    data: { title: `${PREFIX}meeting`, date: new Date(`${istDayKey(day(2))}T00:00:00.000Z`), startTime: "11:00", isMeeting: true, taskId: withAMeeting.id, createdById: ceo, attendees: { create: [{ userId: ceo }] } },
  });
  // Twenty rows touched at the same instant: an order with ties must still page cleanly.
  const tie = new Date(Date.now() - 3_600_000);
  await prisma.$executeRawUnsafe(`UPDATE "Task" SET "updatedAt" = $1 WHERE id = ANY($2::text[])`, tie, made.taskIds.slice(0, 20));
}

async function cleanup() {
  const ids = made.taskIds;
  await prisma.calendarEvent.deleteMany({ where: { title: { startsWith: PREFIX } } }).catch(() => undefined);
  if (made.milestoneId) {
    await prisma.calendarEvent.deleteMany({ where: { milestoneId: made.milestoneId } }).catch(() => undefined);
  }
  if (ids.length) {
    await prisma.notification.deleteMany({ where: { taskId: { in: ids } } }).catch(() => undefined);
    await prisma.taskActivity.deleteMany({ where: { taskId: { in: ids } } }).catch(() => undefined);
    await prisma.comment.deleteMany({ where: { targetType: "TASK", targetId: { in: ids } } }).catch(() => undefined);
    await prisma.task.deleteMany({ where: { parentId: { in: ids } } });
    await prisma.task.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.task.deleteMany({ where: { title: { startsWith: PREFIX } } });
  if (made.milestoneId) await prisma.milestone.deleteMany({ where: { id: made.milestoneId } });
  if (made.groupId) await prisma.assignmentGroup.deleteMany({ where: { id: made.groupId } });
  // By its id too: C4 renames the project, which may change its address.
  const theProject = { OR: [{ slug: "wfx-project" }, ...(made.projectId ? [{ id: made.projectId }] : [])] };
  await prisma.milestone.deleteMany({ where: { project: theProject } });
  await prisma.calendarEvent.deleteMany({ where: { project: theProject } }).catch(() => undefined);
  await prisma.project.deleteMany({ where: theProject });
  await prisma.notification.deleteMany({ where: { OR: [{ title: { contains: PREFIX.trim() } }, { body: { contains: PREFIX.trim() } }] } }).catch(() => undefined);
  const left = await prisma.task.count({ where: { title: { startsWith: PREFIX } } });
  console.log(`\ncleanup: ${left === 0 ? "every WFX record removed" : `${left} WFX tasks LEFT BEHIND`}`);
}

// ── A. API × database ───────────────────────────────────────────────────────
const PEOPLE = [
  "founder@orbit.local", "salyush@orbit.local", "hod-dev@orbit.local", "test-manager@orbit.local",
  "staff-development-lead@orbit.local", "staff-development-member-1@orbit.local", "abhi@orbit.local",
];

async function partA() {
  section("A1  what each person can see at all");
  const visible = new Map<string, Set<string>>();
  const cookies = new Map<string, string>();
  const whos = new Map<string, Who>();
  for (const email of PEOPLE) {
    const cookie = await cookieFor(email);
    cookies.set(email, cookie);
    whos.set(email, await whoIs(email));
    const all = await allPages(cookie, { open: "false" });
    visible.set(email, new Set(all.ids));
    check(all.dups.length === 0, `${email}: the unfiltered list repeats ${all.dups.length} task(s) across pages`);
    check(all.total === new Set(all.ids).size, `${email}: says ${all.total} but pages hold ${new Set(all.ids).size}`);
    const strays = all.ids.filter((id) => !byId.has(id));
    check(strays.length === 0, `${email}: ${strays.length} listed record(s) are not live top-level tasks (steps, private or deleted)`);
  }
  const ceoSees = visible.get("founder@orbit.local")!;
  check(ceoSees.size === rows.length, `the CEO sees ${ceoSees.size} of the ${rows.length} live tasks`);

  section("A2  every tab × Show × Priority × Type, all pages (API)");
  type Job = { email: string; scope: ScopeKey; slice: Slice; pd: WorkPriority | ""; td: WorkType | "" };
  const jobs: Job[] = [];
  for (const email of PEOPLE)
    for (const scope of scopesOffered(whos.get(email)!))
      for (const slice of SLICES)
        for (const pd of ["", ...PRIORITIES] as const)
          for (const td of ["", ...TYPES] as const) jobs.push({ email, scope, slice, pd, td });
  let done = 0;
  await pool(jobs, 10, async (j) => {
    const who = whos.get(j.email)!;
    const expected = rows.filter((r) => visible.get(j.email)!.has(r.id) && mineMatch(j.scope, r, who) && sliceMatch(j.slice, r) && (!j.pd || r.priority === j.pd) && (!j.td || r.type === j.td));
    const params: Record<string, string> = {};
    switch (j.slice) {
      case "open": params.open = "true"; break;
      case "meeting": params.open = "true"; params.meeting = "1"; break;
      case "overdue": params.open = "true"; params.overdue = "1"; break;
      case "high": params.open = "true"; params.sort = "priority"; break;
      case "waiting": params.state = "WAITING"; break;
      case "resolved": params.state = "RESOLVED"; break;
      case "finished": params.state = "CLOSED,CANCELLED"; break;
      case "everything": params.open = "false"; break;
    }
    if (j.pd) params.priority = j.pd;
    if (j.td) params.type = j.td;
    if (j.scope !== "all") params.mine = j.scope;
    const label = `${j.email.split("@")[0]} tab=${j.scope} Show=${j.slice} Priority=${j.pd || "any"} Type=${j.td || "any"}`;
    const got = await allPages(cookies.get(j.email)!, params);
    const want = new Set(expected.map((r) => r.id));
    const gotSet = new Set(got.ids);
    const missing = [...want].filter((id) => !gotSet.has(id));
    const extra = [...gotSet].filter((id) => !want.has(id));
    check(got.dups.length === 0, `${label}: ${got.dups.length} task(s) repeated across pages`);
    check(missing.length === 0 && extra.length === 0, `${label}: expected ${want.size}, got ${gotSet.size} (${missing.length} missing, ${extra.length} extra)`);
    check(got.total === want.size, `${label}: total says ${got.total}, should be ${want.size}`);
    if (++done % 1000 === 0) console.log(`   … ${done}/${jobs.length}`);
  });
  console.log(`   ${jobs.length} combinations`);

  section("A3  every order pages cleanly and in order");
  const ORDERS: Record<string, (a: Row, b: Row) => number> = {
    updated: (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    due: (a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity),
    priority: (a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority),
    created: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    number: (a, b) => b.number - a.number,
  };
  for (const email of ["founder@orbit.local", "hod-dev@orbit.local"]) {
    for (const [sort, cmp] of Object.entries(ORDERS)) {
      const params: Record<string, string> = { open: "false", sort, ...(email.startsWith("hod") ? { mine: "department" } : {}) };
      const got = await allPages(cookies.get(email)!, params);
      const list = got.ids.map((id) => byId.get(id)!).filter(Boolean);
      let outOfOrder = 0;
      for (let i = 1; i < list.length; i++) if (cmp(list[i - 1], list[i]) > 0) outOfOrder++;
      check(got.dups.length === 0, `${email.split("@")[0]} sort=${sort}: ${got.dups.length} repeated across ${got.pages} pages`);
      check(new Set(got.ids).size === got.total, `${email.split("@")[0]} sort=${sort}: pages hold ${new Set(got.ids).size}, total says ${got.total}`);
      check(outOfOrder === 0, `${email.split("@")[0]} sort=${sort}: ${outOfOrder} pair(s) out of order`);
    }
  }

  section("A4  a sub-step is never a row");
  const ceo = cookies.get("founder@orbit.local")!;
  const everything = await allPages(ceo, { open: "false" });
  const leaked = everything.ids.map((id) => byId.get(id)).filter((r) => r && childNumbers.has(r.number));
  check(leaked.length === 0, `${leaked.length} sub-step(s) appeared as list rows`);
  const search = await allPages(ceo, { open: "false", q: "WFX step" });
  check(search.ids.length === 0, `searching a step's own words listed ${search.ids.length} step(s)`);

  return { cookies, whos, visible };
}

// ── B. the real screen ──────────────────────────────────────────────────────
async function pageFor(browser: Browser, email: string, width = 1280): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const r = await page.request.post(`${BASE}/api/auth`, { data: { email, password: PASSWORD } });
  if (!r.ok()) throw new Error(`browser sign-in ${email}: ${r.status()}`);
  return page;
}
async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
  // A control on the same page is not a new load, so "network idle" is already
  // true and returned at once: the screen was read before its rows arrived.
  // Wait instead until nothing is loading and the screen stops changing.
  let last = "";
  let steady = 0;
  for (let i = 0; i < 80 && steady < 3; i++) {
    await page.waitForTimeout(150);
    const loading = await page.locator("main .animate-pulse").count().catch(() => 0);
    const text = await page.locator("main").innerText().catch(() => "");
    steady = !loading && text === last ? steady + 1 : 0;
    last = text;
  }
}
type Screen = { total: number | null; from: number | null; to: number | null; numbers: number[]; tab: string };
async function readScreen(page: Page): Promise<Screen> {
  const footer = await page.locator("main").getByText(/^(\d+ to \d+ of \d+|0 tasks)$/).first().innerText({ timeout: 4000 }).catch(() => "");
  const m = /^(\d+) to (\d+) of (\d+)$/.exec(footer);
  const hrefs = await page.locator("main table tbody tr td:first-child a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  const tab = await page.getByRole("tab", { selected: true }).first().innerText({ timeout: 2000 }).catch(() => "");
  return {
    total: footer === "0 tasks" ? 0 : m ? Number(m[3]) : null,
    from: m ? Number(m[1]) : null,
    to: m ? Number(m[2]) : null,
    numbers: hrefs.map((h) => Number(h.split("/").pop())).filter((n) => Number.isFinite(n)),
    tab: tab.replace(/\s*\(\d+\)\s*$/, "").trim(),
  };
}
async function choose(page: Page, label: string, value: string) {
  const box = page.getByRole("combobox", { name: label });
  await box.selectOption(value);
  // The choice lives in the address; the box shows it once the address has it.
  for (let i = 0; i < 80 && (await box.inputValue().catch(() => value)) !== value; i++) await page.waitForTimeout(100);
}
async function openMore(page: Page) {
  const more = page.getByRole("button", { name: "More filters" });
  if (await more.count()) await more.click();
}
function screenBreaks(s: Screen, keep: (r: Row) => boolean, label: string, expectedDistinct: number) {
  const bad = s.numbers.filter((n) => { const r = byNumber.get(n); return !r || !keep(r); });
  const steps = s.numbers.filter((n) => childNumbers.has(n));
  check(steps.length === 0, `${label}: ${steps.length} sub-step(s) shown as rows`);
  check(bad.length === 0, `${label}: ${bad.length} row(s) on screen do not match what is chosen (e.g. #${bad.slice(0, 3).join(", #")})`);
  check(s.total === expectedDistinct, `${label}: the footer says ${s.total ?? "nothing"}, it should be ${expectedDistinct}`);
  check(expectedDistinct === 0 || s.numbers.length > 0, `${label}: ${expectedDistinct} task(s) exist but the table is empty`);
}

async function partB(browser: Browser, visible: Map<string, Set<string>>, whos: Map<string, Who>) {
  section("B1  CEO: Show × Priority × Type on the screen, one change at a time");
  const ceo = await pageFor(browser, "founder@orbit.local");
  await ceo.goto(`${BASE}/work`, { waitUntil: "networkidle" });
  await openMore(ceo);
  const ceoVisible = visible.get("founder@orbit.local")!;
  let states = 0;
  for (const slice of SLICES) {
    await choose(ceo, "Which tasks", slice);
    for (const pd of ["", ...PRIORITIES] as const) {
      await choose(ceo, "Priority", pd);
      for (const td of ["", ...TYPES] as const) {
        await choose(ceo, "Type", td);
        await settle(ceo);
        const keep = (r: Row) => ceoVisible.has(r.id) && sliceMatch(slice, r) && (!pd || r.priority === pd) && (!td || r.type === td);
        screenBreaks(await readScreen(ceo), keep, `screen Show=${slice} Priority=${pd || "any"} Type=${td || "any"}`, distinct(rows.filter(keep)));
        states++;
      }
    }
  }
  console.log(`   ${states} screen states`);

  section("B2  each tab × Show, and the tab's own count");
  for (const email of ["founder@orbit.local", "hod-dev@orbit.local", "staff-development-member-1@orbit.local", "staff-development-lead@orbit.local"]) {
    const page = await pageFor(browser, email);
    await page.goto(`${BASE}/work`, { waitUntil: "networkidle" });
    const who = whos.get(email)!;
    const tabs = await page.getByRole("tab").allInnerTexts();
    for (const raw of tabs) {
      const name = raw.replace(/\s*\(\d+\)\s*$/, "").trim();
      const scope = TAB_LABEL[name];
      if (!scope) continue;
      await page.getByRole("tab", { name: raw }).click();
      await settle(page);
      const countMatch = /\((\d+)\)\s*$/.exec(raw);
      if (countMatch) {
        const openInTab = rows.filter((r) => visible.get(email)!.has(r.id) && mineMatch(scope, r, who) && sliceMatch("open", r));
        check(Number(countMatch[1]) === distinct(openInTab), `${email.split("@")[0]} tab "${name}": its count says ${countMatch[1]}, open tasks in it are ${distinct(openInTab)}`);
      }
      if (scope === "department") continue; // the tree has its own section
      for (const slice of SLICES) {
        await choose(page, "Which tasks", slice);
        await settle(page);
        const keep = (r: Row) => visible.get(email)!.has(r.id) && mineMatch(scope, r, who) && sliceMatch(slice, r);
        const s = await readScreen(page);
        check(s.tab === name, `${email.split("@")[0]} tab "${name}" Show=${slice}: the highlighted tab became "${s.tab}"`);
        screenBreaks(s, keep, `${email.split("@")[0]} tab "${name}" Show=${slice}`, distinct(rows.filter(keep)));
      }
      await choose(page, "Which tasks", "open");
    }
    await page.context().close();
  }
  await ceo.context().close();
}

// ── C. the scenarios ────────────────────────────────────────────────────────
async function partC(browser: Browser, visible: Map<string, Set<string>>, whos: Map<string, Who>) {
  const dev = made.departmentId;
  const hodWho = whos.get("hod-dev@orbit.local")!;
  const m1 = await prisma.user.findUniqueOrThrow({ where: { email: "staff-development-member-1@orbit.local" }, select: { id: true, name: true } });

  section("C1  links that land on the list with a filter already on");
  {
    const page = await pageFor(browser, "hod-dev@orbit.local");
    await page.goto(`${BASE}/work?departmentId=${dev}`, { waitUntil: "networkidle" });
    const s = await readScreen(page);
    const keep = (r: Row) => visible.get("hod-dev@orbit.local")!.has(r.id) && r.departmentId === dev && sliceMatch("open", r);
    check(s.tab !== "Your work", `head opens a department link: the highlighted tab says "${s.tab}" while the rows are the whole department`);
    screenBreaks(s, keep, "head opens a department link", distinct(rows.filter(keep)));
    const bar = await page.locator("main").innerText();
    check(/Development/.test(bar.split("\n").slice(0, 12).join(" ")), "head opens a department link: nothing on screen says the list is narrowed to Development");

    await page.goto(`${BASE}/work?assignmentGroupId=${made.groupId}&assigneeId=${m1.id}`, { waitUntil: "networkidle" });
    const s2 = await readScreen(page);
    const keep2 = (r: Row) => visible.get("hod-dev@orbit.local")!.has(r.id) && r.assignmentGroupId === made.groupId && r.assigneeId === m1.id && sliceMatch("open", r);
    screenBreaks(s2, keep2, "head opens a person's link", distinct(rows.filter(keep2)));
    const top = (await page.locator("main").innerText()).split("\n").slice(0, 14).join(" ");
    check(top.includes(m1.name), `head opens a person's link: nothing above the table names ${m1.name}, so the list looks like everything`);
    await page.context().close();
    void hodWho;
  }

  section("C2  search");
  {
    const page = await pageFor(browser, "founder@orbit.local");
    await page.goto(`${BASE}/work`, { waitUntil: "networkidle" });
    const box = page.getByRole("textbox", { name: "Search tasks" });
    await box.fill("WFXSEARCH");
    await box.press("Enter");
    await settle(page);
    const s = await readScreen(page);
    const keepOpen = (r: Row) => sliceMatch("open", r) && searchMatch("WFXSEARCH", r);
    screenBreaks(s, keepOpen, "search while Show says Open", distinct(rows.filter(keepOpen)));

    const clear = page.getByRole("button", { name: "Clear filters" });
    check((await clear.count()) > 0, "a search is on but there is no Clear filters button");
    if (await clear.count()) {
      await clear.click();
      await settle(page);
      check(!new URL(page.url()).searchParams.get("q"), "Clear filters left the search on");
      check((await box.inputValue()) === "", `Clear filters left "${await box.inputValue()}" in the search box`);
    }

    // Search, open a task, come back: the box has to say what the list searches
    // for. (A second visit to /work, the same address, gave Back nowhere to go.)
    await box.fill("WFXSEARCH");
    await box.press("Enter");
    await settle(page);
    await page.locator("main table tbody tr td:first-child a").first().click();
    await page.waitForURL(/\/work\/\d+/, { timeout: 15000 });
    await page.goBack();
    await page.waitForURL((u) => u.pathname === "/work", { timeout: 15000 });
    await settle(page);
    const q = new URL(page.url()).searchParams.get("q") ?? "";
    check(q === "WFXSEARCH", `coming back from a task lost the search (the address says "${q}")`);
    check((await box.inputValue()) === q, `after Back the search box says "${await box.inputValue()}" but the list is searching for "${q}"`);

    await box.fill("");
    await box.press("Enter");
    await settle(page);
    check(!new URL(page.url()).searchParams.get("q"), "emptying the box and pressing Enter did not remove the search");
    await page.context().close();
  }

  section("C3  paging");
  {
    const page = await pageFor(browser, "founder@orbit.local");
    await page.goto(`${BASE}/work?f=everything`, { waitUntil: "networkidle" });
    const want = distinct(rows.filter((r) => visible.get("founder@orbit.local")!.has(r.id)));
    const seenTask = new Map<string, number>();
    let expectFrom = 1;
    let pageNo = 1;
    let firstPage: number[] = [];
    for (;;) {
      const s = await readScreen(page);
      if (pageNo === 1) firstPage = s.numbers;
      check(s.total === want, `page ${pageNo}: footer total ${s.total}, should be ${want} on every page`);
      check(s.from === expectFrom, `page ${pageNo}: footer starts at ${s.from}, should start at ${expectFrom}`);
      check(s.to === (s.from ?? 0) + s.numbers.length - 1, `page ${pageNo}: footer says ${s.from} to ${s.to} but shows ${s.numbers.length} rows`);
      for (const n of s.numbers) {
        const r = byNumber.get(n);
        const key = r?.siblingKey ?? `n:${n}`;
        check(!seenTask.has(key), `task #${n} appears again on page ${pageNo} (first on page ${seenTask.get(key)})`);
        seenTask.set(key, pageNo);
      }
      expectFrom += s.numbers.length;
      const next = page.getByRole("button", { name: "Next page" });
      if (await next.isDisabled()) break;
      await next.click();
      await settle(page);
      pageNo++;
      if (pageNo > 10) break;
    }
    check(seenTask.size === want, `walking every page showed ${seenTask.size} tasks, there are ${want}`);
    check(pageNo > 1, "the CEO's full list should need more than one page for this check");
    if (pageNo > 1) {
      await page.goto(`${BASE}/work?f=everything`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Next page" }).click();
      await settle(page);
      const second = await readScreen(page);
      await page.reload({ waitUntil: "networkidle" });
      await settle(page);
      const reloaded = await readScreen(page);
      const prevEnabled = !(await page.getByRole("button", { name: "Previous page" }).isDisabled());
      check(reloaded.from === second.from, `reloading page 2 relabels it ${reloaded.from} to ${reloaded.to}`);
      check(prevEnabled, "reloading page 2 disables Previous, so there is no way back to page 1");
      await page.getByRole("button", { name: "Previous page" }).click().catch(() => undefined);
      await settle(page);
      const back = await readScreen(page);
      check(back.numbers.join() === firstPage.join(), "Previous after a reload did not return to page 1");
    }
    await page.context().close();
  }

  section("C4  a change made elsewhere reaches the list");
  {
    // A milestone's review date can no longer be moved from any screen: the page
    // with that button is mounted nowhere (review, 2026-09-10). So the change made
    // elsewhere is a rename, through the project's own Edit sheet, and the list's
    // Project column has to say the new name at once, not after it goes stale.
    const page = await pageFor(browser, "founder@orbit.local");
    const task = rows.find((r) => r.title === `${PREFIX}milestone task`)!;
    await page.goto(`${BASE}/work?f=everything&q=${encodeURIComponent(`${PREFIX}milestone task`)}`, { waitUntil: "networkidle" });
    await settle(page);
    const row = `main table tbody tr:has(a[href="/work/${task.number}"])`;
    const projectCell = () => page.locator(`${row} td`).nth(3).innerText({ timeout: 5000 }).catch(() => "");
    const before = await projectCell();
    await page.locator(`${row} a[href^="/project/"]`).first().click();
    await page.waitForURL(/\/project\//, { timeout: 15000 });
    await settle(page);
    const renamed = `${PREFIX}Project Renamed`;
    await page.getByRole("button", { name: "Edit project" }).click();
    const nameBox = page.getByRole("textbox", { name: "Project name" });
    // Type once the sheet shows the current name, the way a person would see it.
    for (let i = 0; i < 50 && (await nameBox.inputValue().catch(() => "")) !== `${PREFIX}project`; i++) await page.waitForTimeout(100);
    await nameBox.fill(renamed);
    await page.getByRole("button", { name: "Save" }).click();
    let saved = "";
    for (let i = 0; i < 50; i++) {
      saved = (await prisma.project.findUniqueOrThrow({ where: { id: made.projectId }, select: { name: true } })).name;
      if (saved.toLowerCase() === renamed.toLowerCase()) break;
      await page.waitForTimeout(100);
    }
    await settle(page);
    check(saved.toLowerCase() === renamed.toLowerCase(), `renaming the project did not save (the database says "${saved}")`);
    await page.goBack();
    await page.waitForURL(/\/work/, { timeout: 15000 });
    await settle(page);
    const after = await projectCell();
    check(after.toLowerCase().includes(renamed.toLowerCase()), `back on the list the task's Project still says "${after}" (it said "${before}") after the project was renamed`);
    await page.context().close();
  }

  section("C5  the department tree");
  {
    const page = await pageFor(browser, "hod-dev@orbit.local");
    await page.goto(`${BASE}/work?mine=department`, { waitUntil: "networkidle" });
    const deptBtn = page.getByRole("button", { name: /^Development/ }).first();
    check((await deptBtn.getAttribute("aria-expanded")) === "true", "a head with one department has to open it by hand on the Departments tab");
    if ((await deptBtn.getAttribute("aria-expanded")) !== "true") await deptBtn.click();
    await choose(page, "Which tasks", "everything");
    await settle(page);
    await page.getByRole("button", { name: /^No project/ }).first().click();
    await settle(page);
    const shown = await page.locator("main table tbody tr td:first-child a").evaluateAll((as) => as.map((a) => Number((a.getAttribute("href") ?? "").split("/").pop())));
    const want = rows.filter((r) => visible.get("hod-dev@orbit.local")!.has(r.id) && r.departmentId === made.departmentId && r.projectId === null);
    check(new Set(shown.map((n) => byNumber.get(n)?.siblingKey ?? `n:${n}`)).size === distinct(want), `"No project" shows ${shown.length} rows, the department has ${distinct(want)} tasks in no project`);

    await choose(page, "Which tasks", "high");
    await settle(page);
    const afterChange = await page.locator("main table tbody tr td:first-child a").evaluateAll((as) => as.map((a) => Number((a.getAttribute("href") ?? "").split("/").pop())));
    const wrong = afterChange.filter((n) => { const r = byNumber.get(n); return !r || !sliceMatch("high", r); });
    check(wrong.length === 0, `changing Show to Highest priority first with a group open left ${wrong.length} row(s) that are not open`);
    const ranks = afterChange.map((n) => PRIORITIES.indexOf(byNumber.get(n)?.priority ?? "LOW"));
    const unsorted = ranks.filter((rank, i) => i > 0 && ranks[i - 1] > rank).length;
    check(unsorted === 0, `Highest priority first with a group open: ${unsorted} row(s) out of priority order`);
    await page.context().close();
  }

  section("C6  what the co-founder is offered leads somewhere");
  {
    const page = await pageFor(browser, "salyush@orbit.local");
    await page.goto(`${BASE}/work`, { waitUntil: "networkidle" });
    const offered = await page.getByRole("link", { name: "By department" }).count();
    if (offered) {
      const cookie = await cookieFor("salyush@orbit.local");
      const board = await getJson(cookie, "/api/dashboard/departments");
      check(board.departments.length > 0, "the co-founder is offered By department, and it opens onto no departments");
    }
    const deptTab = page.getByRole("tab", { name: /^Departments/ });
    if (await deptTab.count()) {
      await deptTab.click();
      await settle(page);
      const empty = await page.getByText("No departments to show.").count();
      check(empty === 0, "the co-founder is offered a Departments tab that can never show a department");
    }
    await page.context().close();
  }
}

// ── run ─────────────────────────────────────────────────────────────────────
async function main() {
  const started = Date.now();
  await prisma.calendarEvent.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.task.deleteMany({ where: { title: { startsWith: PREFIX }, parentId: { not: null } } });
  await prisma.task.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.assignmentGroup.deleteMany({ where: { name: `${PREFIX}team` } });
  await prisma.milestone.deleteMany({ where: { name: `${PREFIX}milestone` } });
  await prisma.project.deleteMany({ where: { slug: "wfx-project" } });
  let browser: Browser | null = null;
  try {
    await seed();
    await loadRows();
    console.log(`seeded: ${made.taskIds.length} throwaway records · ${rows.length} live tasks in all · ${childNumbers.size} sub-steps`);
    // --only=api: the database checks alone. --only=scenarios: those and part C,
    // without the long screen sweep of part B.
    const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
    const { whos, visible } = await partA();
    if (only !== "api") {
      browser = await chromium.launch();
      if (only !== "scenarios") await partB(browser, visible, whos);
      await partC(browser, visible, whos);
    }
  } finally {
    await browser?.close().catch(() => undefined);
    await cleanup();
    await prisma.$disconnect();
  }
  console.log("\n══ summary ══════════════════════════════════════════════════════════");
  let failed = 0;
  for (const s of sections) {
    failed += s.fails.length;
    console.log(`${s.fails.length ? "FAIL" : "ok  "}  ${s.name}  (${s.checks - s.fails.length}/${s.checks})`);
  }
  console.log(`\n${sections.reduce((n, s) => n + s.checks, 0) - failed} passed, ${failed} failed · ${Math.round((Date.now() - started) / 1000)}s`);
  if (failed) {
    console.log("\nevery failure:");
    for (const s of sections) for (const f of s.fails) console.log(`  [${s.name.split(" ")[0]}] ${f}`);
  }
  process.exit(failed ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => undefined);
  await prisma.$disconnect();
  process.exit(2);
});
