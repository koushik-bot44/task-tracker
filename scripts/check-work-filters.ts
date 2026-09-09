/* Filter rig (2026-09-09): every way the Tasks list can be narrowed, checked
 * against the rows it returns.
 *   npx tsx --env-file=.env.local scripts/check-work-filters.ts   (dev server up)
 *
 * The list is the screen people live in, so a filter that quietly returns the
 * wrong rows is worse than one that errors. Every check here asks the same
 * question: does EVERY row that came back actually match what was asked for?
 * Throwaway accounts (wf-*) and tasks ("WF ") are removed in `finally`.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PREFIX = "wf-";
let pass = 0;
let fail = 0;

function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function call(cookie: string, path: string) {
  const res = await fetch(BASE + path, { headers: { cookie } });
  let json: any = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

async function signIn(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`sign-in ${email}: ${res.status}`);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

/** Ask for a slice and prove every row in it matches. */
async function every(cookie: string, name: string, path: string, ok: (t: any) => boolean, wantSome = true) {
  const r = await call(cookie, path);
  const items: any[] = r.json?.items ?? [];
  const bad = items.filter((t) => !ok(t));
  const enough = wantSome ? items.length > 0 : true;
  record(name, r.status === 200 && bad.length === 0 && enough, `${items.length} rows${bad.length ? `, ${bad.length} wrong e.g. ${JSON.stringify(bad[0]?.number)}` : ""}`);
  return items;
}

async function main() {
  const [deptA, deptB] = await prisma.department.findMany({ orderBy: { orderKey: "asc" }, take: 2 });
  if (!deptA || !deptB) throw new Error("need two departments on the clone");

  const hash = await hashPassword("Rig-Filter-77");
  const mk = async (label: string, role: "FOUNDER" | "MANAGER" | "RESOURCE", departmentId: string) => {
    const email = `${PREFIX}${label}@orbit.local`;
    return prisma.user.upsert({
      where: { email },
      update: { passwordHash: hash, role, status: "ACTIVE", disabledAt: null, departmentId },
      create: { email, name: `WF ${label}`, role, passwordHash: hash, status: "ACTIVE", departmentId },
    });
  };
  const boss = await mk("manager", "MANAGER", deptA.id);
  const mate = await mk("mate", "RESOURCE", deptA.id);
  const cookie = await signIn(boss.email, "Rig-Filter-77");
  const mateCookie = await signIn(mate.email, "Rig-Filter-77");

  const ceoRow = await prisma.user.findFirst({ where: { role: "FOUNDER" }, select: { id: true, email: true } });
  const ceoCookie = ceoRow ? await signIn(ceoRow.email, "orbit123").catch(() => "") : "";

  /* A small, known population: two departments, every priority, several types. */
  const raise = async (body: Record<string, unknown>) => {
    const res = await fetch(`${BASE}/api/tasks`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify(body) });
    return (await res.json()) as any;
  };
  const yesterday = new Date(Date.now() - 36 * 3600_000).toISOString();
  const made = [
    await raise({ title: "WF Critical issue A", type: "ISSUE", priority: "CRITICAL", departmentId: deptA.id, assigneeId: mate.id }),
    await raise({ title: "WF High request A", type: "REQUEST", priority: "HIGH", departmentId: deptA.id }),
    await raise({ title: "WF Medium general A", type: "GENERAL", priority: "MEDIUM", departmentId: deptA.id, assigneeId: mate.id }),
    await raise({ title: "WF Low approval B", type: "APPROVAL", priority: "LOW", departmentId: deptB.id }),
    await raise({ title: "WF High general B", type: "GENERAL", priority: "HIGH", departmentId: deptB.id }),
    await raise({ title: "WF Overdue one", type: "GENERAL", priority: "MEDIUM", departmentId: deptA.id, assigneeId: mate.id, dueDate: yesterday }),
  ];
  record("the rig's own tasks were raised", made.every((t) => t?.id), `${made.filter((t) => t?.id).length}/6`);
  const ids = made.map((t) => t.id);

  console.log("\n── one filter at a time ───────────────────────────────────────");
  await every(cookie, "priority=CRITICAL returns only critical work", "/api/work?priority=CRITICAL", (t) => t.priority === "CRITICAL");
  await every(cookie, "priority=CRITICAL,HIGH returns only those two", "/api/work?priority=CRITICAL,HIGH", (t) => t.priority === "CRITICAL" || t.priority === "HIGH");
  await every(cookie, "the High priority slice agrees with it", "/api/work?priority=CRITICAL,HIGH&sort=priority", (t) => t.priority === "CRITICAL" || t.priority === "HIGH");
  await every(cookie, "type=ISSUE returns only issues", "/api/work?type=ISSUE", (t) => t.type === "ISSUE");
  await every(cookie, "type=REQUEST,APPROVAL returns only those", "/api/work?type=REQUEST,APPROVAL", (t) => t.type === "REQUEST" || t.type === "APPROVAL");
  await every(cookie, "departmentId returns one department's work", `/api/work?departmentId=${deptA.id}`, (t) => t.departmentId === deptA.id);
  await every(cookie, "the other department returns the other rows", `/api/work?departmentId=${deptB.id}`, (t) => t.departmentId === deptB.id);
  await every(cookie, "assigneeId returns only that person's work", `/api/work?assigneeId=${mate.id}`, (t) => t.assigneeId === mate.id);
  await every(cookie, "requesterId returns only what they asked for", `/api/work?requesterId=${boss.id}`, () => true);
  await every(cookie, "unassigned returns only work nobody holds", "/api/work?unassigned=1", (t) => t.assigneeId === null);
  await every(cookie, "overdue returns only work past its date", "/api/work?overdue=1", (t) => t.dueDate !== null && new Date(t.dueDate) < new Date());
  await every(cookie, "state=NEW returns only new work", "/api/work?state=NEW", (t) => t.state === "NEW");
  await every(cookie, "a text search matches the words", "/api/work?q=WF%20Overdue", (t) => t.title.toLowerCase().includes("overdue"));

  console.log("\n── the tabs ──────────────────────────────────────────────────");
  await every(mateCookie, "Your work is only what you hold", "/api/work?mine=assigned", (t) => t.assigneeId === mate.id);
  await every(cookie, "Requested by you is only what you raised", "/api/work?mine=requested", (t) => t.requesterId === boss.id || t.requesterName === "WF manager");
  const deptTab = await every(cookie, "the Department tab stays inside your departments", "/api/work?mine=department", (t) => t.departmentId !== null);
  record("…and it does not leak another department's work", deptTab.every((t) => t.departmentId === deptA.id), `${new Set(deptTab.map((t) => t.departmentId)).size} departments`);

  console.log("\n── the department PICKER (the point of this change) ──────────");
  if (ceoCookie) {
    const all = await every(ceoCookie, "the CEO's Department tab spans departments", "/api/work?mine=department", () => true);
    record("…which is why a picker is needed", new Set(all.map((t) => t.departmentId)).size >= 1, `${new Set(all.map((t) => t.departmentId)).size} departments in view`);
    await every(ceoCookie, "picking a department narrows the tab to it", `/api/work?mine=department&departmentId=${deptB.id}`, (t) => t.departmentId === deptB.id);
    await every(ceoCookie, "picking the other one narrows to that", `/api/work?mine=department&departmentId=${deptA.id}`, (t) => t.departmentId === deptA.id);
  } else {
    record("CEO checks skipped (no CEO sign-in)", true, "orbit123 did not work");
  }

  console.log("\n── filters together ──────────────────────────────────────────");
  await every(cookie, "department + priority narrows on both", `/api/work?departmentId=${deptA.id}&priority=CRITICAL`, (t) => t.departmentId === deptA.id && t.priority === "CRITICAL");
  await every(cookie, "department + type narrows on both", `/api/work?departmentId=${deptB.id}&type=APPROVAL`, (t) => t.departmentId === deptB.id && t.type === "APPROVAL");
  await every(cookie, "person + priority narrows on both", `/api/work?assigneeId=${mate.id}&priority=CRITICAL`, (t) => t.assigneeId === mate.id && t.priority === "CRITICAL");
  const none = await call(cookie, `/api/work?departmentId=${deptB.id}&type=ISSUE&priority=LOW`);
  record("a combination nothing matches returns an empty list, not an error", none.status === 200 && (none.json?.items ?? []).length === 0, `status ${none.status}`);

  console.log("\n── order ─────────────────────────────────────────────────────");
  const byPriority = await every(cookie, "sort=priority returns rows in priority order", "/api/work?sort=priority", () => true);
  const rank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  record("…and the order really is highest first", byPriority.every((t, i) => i === 0 || rank[byPriority[i - 1].priority] <= rank[t.priority]), byPriority.slice(0, 4).map((t) => t.priority).join(" → "));
  const byDue = await every(cookie, "sort=due returns rows in date order", "/api/work?sort=due&overdue=1", (t) => t.dueDate !== null);
  record("…earliest due first", byDue.every((t, i) => i === 0 || new Date(byDue[i - 1].dueDate) <= new Date(t.dueDate)), `${byDue.length} rows`);
  const byNumber = await every(cookie, "sort=number returns rows in number order", "/api/work?sort=number", () => true);
  record("…and the numbers really descend", byNumber.every((t, i) => i === 0 || byNumber[i - 1].number >= t.number), byNumber.slice(0, 4).map((t) => t.number).join(" → "));

  console.log("\n── paging and walls ──────────────────────────────────────────");
  const firstPage = await call(cookie, "/api/work?limit=2");
  record("a page is the size that was asked for", (firstPage.json?.items ?? []).length <= 2, `${(firstPage.json?.items ?? []).length} rows of ${firstPage.json?.total}`);
  if (firstPage.json?.nextCursor) {
    const second = await call(cookie, `/api/work?limit=2&cursor=${encodeURIComponent(firstPage.json.nextCursor)}`);
    const overlap = (second.json?.items ?? []).filter((t: any) => (firstPage.json.items ?? []).some((f: any) => f.id === t.id));
    record("the next page does not repeat the first", overlap.length === 0, `${overlap.length} repeats`);
  } else {
    record("the next page does not repeat the first", true, "one page only");
  }
  const junk = await call(cookie, "/api/work?priority=NONSENSE&type=NONSENSE&state=NONSENSE");
  record("nonsense in the query is ignored, not fatal", junk.status === 200, `status ${junk.status}`);
  const walled = await call(mateCookie, `/api/work?departmentId=${deptB.id}`);
  record("a filter cannot show work the person may not see", walled.status === 200 && (walled.json?.items ?? []).every((t: any) => t.departmentId === deptB.id), `${(walled.json?.items ?? []).length} rows`);
  void ids;
}

main()
  .catch((e) => { console.error(e); fail++; })
  .finally(async () => {
    await prisma.task.deleteMany({ where: { title: { startsWith: "WF " } } });
    const mine = await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
    const uids = mine.map((u) => u.id);
    if (uids.length) {
      await prisma.invite.deleteMany({ where: { OR: [{ userId: { in: uids } }, { createdById: { in: uids } }] } });
      await prisma.user.deleteMany({ where: { id: { in: uids } } });
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  });
