/* Well Being, from both sides (2026-09-10).
 *   npx tsx --env-file=.env.local scripts/check-wellbeing.ts   (dev server up; after dev-seed-wellbeing)
 *
 * The CEO's side: his person, a habit grid for this week and last, rules
 * scheduled, a weight trend, and the tasks from before still there in the weeks
 * they were due. The person's side: his own screen, today's tasks, never his
 * weight or score. Both at once: the CEO sets a task and the person ticks it;
 * the person marks a habit and the CEO sees the same mark; a day that hasn't
 * happened can't be marked. The walls: nobody but the CEO opens Well Being, and
 * the person reaches nothing but his own screen. Both sides are photographed.
 *
 * Leaves no trace: the check's own task is removed and the habit mark restored
 * before anything is photographed.
 * Evidence: records/evidence/wellbeing/ (addresses are never printed).
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const DIR = "records/evidence/wellbeing";
const PASSWORD = "orbit123";
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

const lines: string[] = [];
let pass = 0;
let fail = 0;
function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`;
  lines.push(line);
  console.log(line);
}
function info(text: string) {
  lines.push(`INFO  ${text}`);
  console.log(`INFO  ${text}`);
}

const IST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
const today = IST.format(new Date());
function addDays(k: string, n: number): string {
  const d = new Date(`${k}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const mondayOf = (k: string) => addDays(k, -((new Date(`${k}T00:00:00Z`).getUTCDay() + 6) % 7));
const thisMonday = mondayOf(today);

/** The five tasks Arjun had before any of this. */
const BEFORE = ["Complete Learning C this week.", "Practice programs on c", "Lear Python basics", "Practice object oriented programming", "Practice java"];

async function signIn(email: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  return res.ok ? (res.headers.get("set-cookie") ?? "").split(";")[0] : null;
}
async function call(cookie: string, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null;
  try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, json };
}
async function browserSignIn(page: Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 });
}

let madeTaskId: string | null = null;
let restoreMark: { habitId: string; value: string | null } | null = null;

async function cleanUp() {
  if (madeTaskId) await prisma.routineTask.deleteMany({ where: { id: madeTaskId } });
  madeTaskId = null;
  if (restoreMark) {
    const date = new Date(`${today}T00:00:00Z`);
    if (restoreMark.value) await prisma.habitMark.upsert({ where: { habitId_date: { habitId: restoreMark.habitId, date } }, update: { value: restoreMark.value }, create: { habitId: restoreMark.habitId, date, value: restoreMark.value } });
    else await prisma.habitMark.deleteMany({ where: { habitId: restoreMark.habitId, date } });
  }
  restoreMark = null;
}

async function main() {
  const ceo = await prisma.user.findFirst({ where: { role: "FOUNDER" }, select: { id: true, email: true } });
  const person = ceo ? await prisma.person.findUnique({ where: { managerId: ceo.id }, select: { id: true, name: true, user: { select: { email: true } } } }) : null;
  record("the CEO's Well Being has a person", Boolean(person), person?.name ?? "none");
  if (!ceo || !person) return;

  const ceoC = await signIn(ceo.email);
  const personC = await signIn(person.user.email);
  record("the CEO signs in", Boolean(ceoC));
  record(`${person.name} signs in to his own screen`, Boolean(personC));
  if (!ceoC || !personC) return;

  /* ---- the CEO's side ---- */
  const ov = await call(ceoC, "GET", "/api/routine");
  record(`the CEO opens Well Being and owns ${person.name}'s routine`, ov.status === 200 && ov.json?.person?.name === person.name && ov.json?.role === "OWNER", `status ${ov.status}, role ${ov.json?.role}`);
  const segments: any[] = ov.json?.segments ?? [];
  record("his habit segments are all there", segments.length >= 6, `${segments.length} segments, ${segments.reduce((n, s) => n + (s.habits?.length ?? 0), 0)} habits`);
  const s = ov.json?.summary;
  record("this week's grid has marks and a score", segments.some((x) => x.metThisWeek > 0) && (s?.overallTarget ?? 0) > 0, `${s?.overallDaysMet} of ${s?.overallTarget} days met`);
  const last = await call(ceoC, "GET", `/api/routine?week=${addDays(thisMonday, -7)}`);
  const lastS = last.json?.summary;
  record("last week keeps its own record, short of a perfect score", last.status === 200 && lastS?.overallDaysMet > 0 && lastS?.overallDaysMet < lastS?.overallTarget, `${lastS?.overallDaysMet} of ${lastS?.overallTarget}`);
  const months: any[] = ov.json?.monthlyWeights ?? [];
  record("the weight trend covers several months", months.length >= 3, months.map((x) => `${x.month} ${x.weightKg}kg`).join(", "));
  const rules: any[] = ov.json?.nonNegotiables ?? [];
  const scheduled = rules.filter((r) => Object.keys(r.days ?? {}).length > 0);
  record("rules are scheduled this week", scheduled.length > 0, `${rules.length} rules, ${scheduled.length} with days this week`);
  const tasks: any[] = ov.json?.tasks ?? [];
  record("this week's tasks are listed", tasks.length > 0, `${tasks.length} tasks, ${tasks.filter((t) => t.done).length} done`);

  // Tasks are listed by the week they're due in, so the ones from before are
  // found the way the CEO finds them: by going back to those weeks.
  const stored = await prisma.routineTask.findMany({ where: { personId: person.id, title: { in: BEFORE } }, select: { dueDate: true } });
  record("every task from before is still stored", stored.length === BEFORE.length, `${stored.length} of ${BEFORE.length}`);
  const oldWeeks = [...new Set(stored.map((t) => mondayOf(t.dueDate ? t.dueDate.toISOString().slice(0, 10) : today)))].sort();
  const listed: string[] = [];
  for (const week of oldWeeks) {
    const wk = await call(ceoC, "GET", `/api/routine?week=${week}`);
    listed.push(...(wk.json?.tasks ?? []).map((t: any) => String(t.title)));
  }
  const shown = BEFORE.filter((b) => listed.includes(b));
  record("…and each one shows in the week it was due", shown.length === BEFORE.length, `${shown.length} of ${BEFORE.length}, weeks of ${oldWeeks.join(", ")}`);

  const me = await call(ceoC, "GET", "/api/users/me");
  record("the Well Being tab is offered to the CEO", me.json?.hasFamily === true);
  const people = await call(ceoC, "GET", "/api/users");
  record("a Well Being person never shows up in People", Array.isArray(people.json) && people.json.every((u: any) => u.role !== "PERSON"));

  /* ---- the person's side ---- */
  const kid = await call(personC, "GET", "/api/routine/kid");
  record(`${person.name}'s own screen opens`, kid.status === 200, `status ${kid.status}`);
  const kidKeys = Object.keys(kid.json ?? {});
  record("…with his tasks for today and the undated ones", (kid.json?.tasks ?? []).length > 0, `${(kid.json?.tasks ?? []).length} tasks`);
  record("…and never his weight or his weekly score", !kidKeys.some((k) => ["weights", "monthlyWeights", "summary"].includes(k)), kidKeys.join(", "));

  /* ---- both sides at once ---- */
  const made = await call(ceoC, "POST", "/api/routine/tasks", { title: "Bring home the signed report card", dueDate: today });
  madeTaskId = made.json?.id ?? null;
  record("the CEO sets a task for today", Boolean(madeTaskId), `status ${made.status}`);
  if (madeTaskId) {
    const seen = await call(personC, "GET", "/api/routine/kid");
    record(`${person.name} sees it on his screen`, (seen.json?.tasks ?? []).some((t: any) => t.id === madeTaskId));
    const tick = await call(personC, "PATCH", `/api/routine/kid/tasks/${madeTaskId}`, { done: true });
    record(`${person.name} ticks it done`, tick.status === 200 && tick.json?.done === true, `status ${tick.status}`);
    const back = await call(ceoC, "GET", "/api/routine");
    record("the CEO sees it done", (back.json?.tasks ?? []).find((t: any) => t.id === madeTaskId)?.done === true);
  }

  const habit = await prisma.habit.findFirst({ where: { segment: { personId: person.id }, active: true }, orderBy: { orderKey: "asc" }, select: { id: true } });
  if (habit) {
    const before = await prisma.habitMark.findUnique({ where: { habitId_date: { habitId: habit.id, date: new Date(`${today}T00:00:00Z`) } }, select: { value: true } });
    restoreMark = { habitId: habit.id, value: before?.value ?? null };
    const flip = before?.value === "MET" ? "MISSED" : "MET";
    const mark = await call(personC, "POST", "/api/routine/kid/habit-mark", { habitId: habit.id, date: today, value: flip });
    record(`${person.name} marks one of today's habits`, mark.status === 200, `${flip}, status ${mark.status}`);
    const grid = await call(ceoC, "GET", "/api/routine");
    const h = (grid.json?.segments ?? []).flatMap((x: any) => x.habits ?? []).find((x: any) => x.id === habit.id);
    record("the CEO's grid shows the same mark", h?.marks?.[today] === flip, `grid says ${h?.marks?.[today]}`);
    const future = await call(personC, "POST", "/api/routine/kid/habit-mark", { habitId: habit.id, date: addDays(today, 1), value: "MET" });
    record("a day that hasn't happened can't be marked", future.status === 400, `status ${future.status}`);
  }
  // The check's own task and mark go back now, so the screens show only the demo data.
  await cleanUp();

  /* ---- the walls ---- */
  const others: [string, string][] = [
    ["salyush@orbit.local", "the co-founder"],
    ["test-manager@orbit.local", "the manager who used to own this routine"],
    ["staff-hr-head@orbit.local", "a head of department"],
    ["staff-accounts-member-1@orbit.local", "a team member"],
    ["admin@orbit.local", "the admin"],
  ];
  for (const [email, who] of others) {
    const c = await signIn(email);
    if (!c) { info(`${who}: could not sign in with the demo password, skipped`); continue; }
    const r = await call(c, "GET", "/api/routine");
    record(`${who} can't open Well Being`, r.status === 403, `status ${r.status}`);
  }
  for (const [path, what] of [["/api/routine", "the CEO's Well Being view"], ["/api/work?limit=1", "tasks"], ["/api/users", "People"], ["/api/projects", "projects"]] as const) {
    const r = await call(personC, "GET", path);
    record(`${person.name} can't reach ${what}`, r.status === 403, `status ${r.status}`);
  }

  /* ---- the screens ---- */
  const browser = await chromium.launch();
  // Tall windows: the scene behind Well Being is fixed to the window, so a full-page
  // photo of a short window shows everything below the fold on a blank ground.
  const ceoPage = await browser.newPage({ viewport: { width: 1360, height: 2200 } });
  await browserSignIn(ceoPage, ceo.email);
  await ceoPage.goto(`${BASE}/routine`);
  await ceoPage.waitForLoadState("domcontentloaded");
  await ceoPage.waitForTimeout(3000);
  await ceoPage.screenshot({ path: `${DIR}/ceo-1-summary.png`, fullPage: true });
  await ceoPage.getByRole("tab", { name: "Tracker" }).click();
  await ceoPage.waitForTimeout(2000);
  await ceoPage.screenshot({ path: `${DIR}/ceo-2-tracker-this-week.png`, fullPage: true });
  const newest = oldWeeks[oldWeeks.length - 1];
  if (newest) {
    const weeksBack = Math.round((Date.parse(thisMonday) - Date.parse(newest)) / (7 * 86400000));
    for (let i = 0; i < weeksBack; i++) {
      await ceoPage.getByRole("button", { name: "Previous week" }).click();
      await ceoPage.waitForTimeout(1500);
    }
    const stillTracker = await ceoPage.getByRole("tab", { name: "Tracker" }).getAttribute("aria-selected");
    record("the Tracker stays open when going to another week", stillTracker === "true", stillTracker === "true" ? "" : "jumped back to Summary");
    const text = await ceoPage.locator("body").innerText();
    const there = BEFORE.filter((b) => text.includes(b));
    record("going back on the CEO's screen shows the tasks from before", there.length > 0, there.join(" · "));
    await ceoPage.screenshot({ path: `${DIR}/ceo-3-tracker-week-of-${newest}.png`, fullPage: true });
  }

  const personPage = await browser.newPage({ viewport: { width: 390, height: 1600 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await browserSignIn(personPage, person.user.email);
  await personPage.waitForTimeout(3000);
  record(`${person.name} lands on his own screen, not the work app`, new URL(personPage.url()).pathname.startsWith("/person"), new URL(personPage.url()).pathname);
  await personPage.screenshot({ path: `${DIR}/person-1-tasks.png`, fullPage: true });
  for (const [i, tab] of ["Habits", "Rules"].entries()) {
    const target = personPage.getByRole("tab", { name: tab }).or(personPage.getByRole("button", { name: tab })).first();
    if (!(await target.isVisible().catch(() => false))) { info(`no "${tab}" tab on ${person.name}'s screen`); continue; }
    await target.click();
    await personPage.waitForTimeout(1500);
    await personPage.screenshot({ path: `${DIR}/person-${i + 2}-${tab.toLowerCase()}.png`, fullPage: true });
  }

  const coPage = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await browserSignIn(coPage, "salyush@orbit.local");
  const tabs = await coPage.locator('aside nav[aria-label="Main"] a').allInnerTexts();
  record("the co-founder is not offered the Well Being tab", !tabs.some((t) => /Well Being/.test(t)), tabs.join(" · "));
  await browser.close();
  info("screens: ceo-1-summary, ceo-2-tracker-this-week, ceo-3-tracker-week-of-…, person-1-tasks, person-2-habits, person-3-rules");
}

main()
  .catch((e) => {
    console.error(e);
    fail++;
  })
  .finally(async () => {
    await cleanUp();
    writeFileSync(`${DIR}/check-wellbeing.txt`, lines.join("\n") + `\n\n${pass} passed, ${fail} failed\n`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  });
