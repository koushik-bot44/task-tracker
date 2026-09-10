/* The work screens, 2026-09-11.
 *   npx tsx --env-file=.env.local scripts/check-work-extras.ts
 *   (dev server up, restarted after the task_progress_meetings migration)
 *
 * A task given to someone is Work in progress at once, and back in the queue
 * when nobody holds it. The Individual tab lists the tasks given straight to a
 * person in no department, and a person narrows it. A manager schedules a
 * meeting from a task: it is on the task's small calendar, on Today for the
 * people invited (linking back to the task), and the task shows under Awaiting
 * meeting with when the meeting is. Progress is marked by whoever may change
 * the task, and nobody else. An old ?task= link opens the full record. Show
 * reads Work in progress and Awaiting meeting, with no Unassigned; the table
 * and the record say Status. On a phone the small calendar fits.
 * Throwaway records ("XTR ") and accounts (xtr-*) are removed in `finally`.
 */
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";
import { istDayKey } from "../lib/timezone";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PREFIX = "XTR ";
const PASSWORD = "Rig-Extras-77";
const at = (label: string) => `xtr-${label}@orbit.local`;

let pass = 0;
let fail = 0;
function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function until(check: () => Promise<boolean>, timeout = 15000): Promise<boolean> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const opened = (l: Locator, timeout = 15000) => l.first().waitFor({ timeout }).then(() => true).catch(() => false);

async function signIn(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return res.ok ? (res.headers.get("set-cookie") ?? "").split(";")[0] : null;
}
async function call(cookie: string, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null;
  try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, json };
}

async function signInPage(b: Browser, email: string, password: string, phone = false): Promise<{ page: Page; errors: string[] }> {
  const context = await b.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
  return { page, errors };
}

let browser: Browser | null = null;

async function cleanup() {
  await prisma.calendarEvent.deleteMany({ where: { title: { startsWith: PREFIX } } });
  const ids = (await prisma.task.findMany({ where: { title: { startsWith: PREFIX, mode: "insensitive" } }, select: { id: true } })).map((t) => t.id);
  if (ids.length) {
    await prisma.notification.deleteMany({ where: { taskId: { in: ids } } });
    await prisma.taskActivity.deleteMany({ where: { taskId: { in: ids } } });
    await prisma.task.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.notification.deleteMany({ where: { OR: [{ title: { contains: PREFIX.trim() } }, { body: { contains: PREFIX.trim() } }] } }).catch(() => undefined);
  const users = (await prisma.user.findMany({ where: { email: { startsWith: "xtr-" } }, select: { id: true } })).map((u) => u.id);
  if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } });
}

async function main() {
  const startedAt = new Date();
  await cleanup(); // whatever a stopped run left behind
  const ceo = await signIn("founder@orbit.local", "orbit123");
  record("the CEO signs in", Boolean(ceo));
  if (!ceo) return;
  const ceoUser = await prisma.user.findFirstOrThrow({ where: { email: "founder@orbit.local" }, select: { id: true } });
  const dept = await prisma.department.findFirst({ orderBy: { orderKey: "asc" }, select: { id: true } });
  const hash = await hashPassword(PASSWORD);
  const member = await prisma.user.create({ data: { email: at("member"), name: "XTR Member", role: "RESOURCE", status: "ACTIVE", passwordHash: hash, departmentId: dept?.id ?? null } });
  const outsider = await prisma.user.create({ data: { email: at("manager"), name: "XTR Manager", role: "MANAGER", status: "ACTIVE", passwordHash: hash, departmentId: dept?.id ?? null } });
  const memberCookie = (await signIn(member.email, PASSWORD)) ?? "";
  const outsiderCookie = (await signIn(outsider.email, PASSWORD)) ?? "";
  record("the throwaway member and manager sign in", Boolean(memberCookie && outsiderCookie));

  /* ---- given to someone = Work in progress ---- */
  const made = await call(ceo, "POST", "/api/tasks", { title: `${PREFIX}individual job`, assigneeId: member.id });
  let task = made.json;
  record("a task given straight to a person is Work in progress at once", made.status === 201 && task?.state === "IN_PROGRESS" && task?.status === "DOING", `status ${made.status} · ${task?.state ?? made.json?.error}`);
  if (!task?.id) return;
  if (task.departmentId) task = (await call(ceo, "PATCH", `/api/tasks/${task.id}`, { departmentId: null })).json ?? task;
  record("…in no department, so it is individual work", task.departmentId === null, String(task.departmentId));
  const unheld = await call(ceo, "PATCH", `/api/tasks/${task.id}`, { assigneeId: null });
  record("…nobody holding it puts it back in the queue", unheld.status === 200 && unheld.json?.state === "NEW", `${unheld.json?.state}`);
  const again = await call(ceo, "PATCH", `/api/tasks/${task.id}`, { assigneeId: member.id });
  record("…and given again it is Work in progress again", again.status === 200 && again.json?.state === "IN_PROGRESS", `${again.json?.state}`);
  const deptTask = dept ? await call(ceo, "POST", "/api/tasks", { title: `${PREFIX}department job`, assigneeId: member.id, departmentId: dept.id }) : null;

  /* ---- Individual ---- */
  const individual = await call(ceo, "GET", "/api/work?mine=individual&rows=tasks&open=true&limit=200");
  const individualIds: string[] = (individual.json?.items ?? []).map((t: any) => t.id);
  record("Individual lists the task given straight to a person", individual.status === 200 && individualIds.includes(task.id), `status ${individual.status}`);
  record("…and not a department's task", !deptTask?.json?.id || !individualIds.includes(deptTask.json.id));
  record("…every row in it is in no department and held by someone", (individual.json?.items ?? []).every((t: any) => t.departmentId === null && t.assigneeId !== null));
  const narrowed = await call(ceo, "GET", `/api/work?mine=individual&rows=tasks&open=true&assigneeId=${member.id}`);
  const narrowedRows: any[] = narrowed.json?.items ?? [];
  record("a person narrows it to their tasks alone", narrowedRows.some((t) => t.id === task.id) && narrowedRows.every((t) => t.assigneeId === member.id), `${narrowedRows.length} rows`);

  /* ---- a meeting from the task ---- */
  const tomorrow = istDayKey(new Date(Date.now() + 86_400_000));
  const meeting = await call(ceo, "POST", "/api/events", { title: `${PREFIX}sync on the job`, date: tomorrow, startTime: "10:30", attendeeIds: [member.id, ceoUser.id], taskId: task.id });
  record("a manager schedules a meeting on the task", meeting.status === 201 && meeting.json?.taskId === task.id && meeting.json?.taskNumber === task.number, `status ${meeting.status} ${meeting.json?.error ?? ""}`);
  const toldMember = await prisma.notification.count({ where: { userId: member.id, createdAt: { gte: startedAt }, OR: [{ eventId: meeting.json?.id }, { title: { contains: "XTR sync" } }, { body: { contains: "XTR sync" } }] } });
  record("…the person on the task is told", toldMember > 0, `${toldMember}`);
  // Only the task's people: someone else named is left out, and never told (owner, 2026-09-11).
  const crowd = await call(ceo, "POST", "/api/events", { title: `${PREFIX}crowded`, date: tomorrow, startTime: "12:00", attendeeIds: [member.id, outsider.id], taskId: task.id });
  const crowdIds: string[] = (crowd.json?.attendees ?? []).map((a: any) => a.userId);
  record("a task's meeting invites only the task's people", crowd.status === 201 && crowdIds.includes(member.id) && !crowdIds.includes(outsider.id), JSON.stringify(crowdIds));
  const toldOutsider = await prisma.notification.count({ where: { userId: outsider.id, createdAt: { gte: startedAt } } });
  record("…and nobody else is told", toldOutsider === 0, `${toldOutsider}`);
  await prisma.calendarEvent.deleteMany({ where: { title: `${PREFIX}crowded` } });
  const onTask = await call(memberCookie, "GET", `/api/tasks/${task.id}/meetings`);
  record("…the task lists its meeting for whoever can see the task", onTask.status === 200 && (onTask.json ?? []).some((m: any) => m.id === meeting.json?.id), `status ${onTask.status}`);
  const today = await call(memberCookie, "GET", "/api/today");
  const onToday = (today.json?.meetings ?? []).find((m: any) => m.id === meeting.json?.id);
  record("…it is on Today for the person invited, naming the task", Boolean(onToday) && onToday.taskNumber === task.number, `status ${today.status}`);
  const awaiting = await call(ceo, "GET", "/api/work?meeting=1&open=true&rows=tasks&sort=meeting&limit=200");
  const listed = (awaiting.json?.items ?? []).find((t: any) => t.id === task.id);
  record("Awaiting meeting lists the task, with when its meeting is", Boolean(listed) && listed.nextMeeting?.startTime === "10:30", JSON.stringify(listed?.nextMeeting ?? null));
  record("…and only tasks with a meeting ahead", (awaiting.json?.items ?? []).every((t: any) => Boolean(t.nextMeeting)));
  record("a team member cannot schedule a meeting", (await call(memberCookie, "POST", "/api/events", { title: `${PREFIX}nope`, date: tomorrow, startTime: "11:00", attendeeIds: [member.id], taskId: task.id })).status === 403);
  record("a manager who can't see the task cannot put a meeting on it", (await call(outsiderCookie, "POST", "/api/events", { title: `${PREFIX}nope`, date: tomorrow, startTime: "11:00", attendeeIds: [outsider.id], taskId: task.id })).status === 404);
  record("…nor read its meetings", (await call(outsiderCookie, "GET", `/api/tasks/${task.id}/meetings`)).status === 404);

  /* ---- progress ---- */
  const marked = await call(memberCookie, "PATCH", `/api/tasks/${task.id}`, { progress: 40 });
  record("the person holding it marks its progress", marked.status === 200 && marked.json?.progress === 40, `status ${marked.status} · ${marked.json?.progress}`);
  const activity = await call(memberCookie, "GET", `/api/tasks/${task.id}/activity`);
  record("…and the stream says so", (activity.json ?? []).some((a: any) => a.metadata?.field === "progress" && a.metadata?.newLabel === "40%"));
  record("more than 100 is refused", (await call(memberCookie, "PATCH", `/api/tasks/${task.id}`, { progress: 140 })).status === 400);
  record("someone who can't see the task cannot mark it", (await call(outsiderCookie, "PATCH", `/api/tasks/${task.id}`, { progress: 90 })).status === 404);

  /* ---- on screen ---- */
  browser = await chromium.launch();
  const desk = await signInPage(browser, "founder@orbit.local", "orbit123");
  const { page } = desk;

  await page.goto(`${BASE}/?task=${task.id}`);
  record("an old ?task= link opens the task's full record", await until(async () => new URL(page.url()).pathname === `/work/${task.number}`, 90000), new URL(page.url()).pathname);

  await page.goto(`${BASE}/work`);
  const tab = page.getByRole("tab", { name: /^Individual/ });
  record("Work offers the Individual tab", await opened(tab, 90000));
  const show = page.getByRole("combobox", { name: "Which tasks" });
  const options = await show.locator("option").allInnerTexts();
  record(
    "Show reads Work in progress and Awaiting meeting, with no Unassigned",
    options.includes("Work in progress") && options.includes("Awaiting meeting") && !options.includes("Unassigned") && !options.includes("Open"),
    options.join(" · "),
  );
  await tab.click();
  await until(async () => new URL(page.url()).searchParams.get("mine") === "individual", 10000);
  const row = page.locator(`main table tbody tr:has(a[href="/work/${task.number}"])`);
  record("…the tab lists the task", await opened(row, 30000));
  const person = page.getByRole("combobox", { name: "Person" });
  if (await opened(person, 15000)) {
    await person.selectOption(member.id);
    await until(async () => new URL(page.url()).searchParams.get("assigneeId") === member.id, 10000);
    record("…and the person picker narrows it to their tasks", await opened(row, 30000));
  } else {
    record("…and the person picker narrows it to their tasks", false, "no person picker");
  }
  const heads = await page.locator("main table thead th").allInnerTexts();
  record("the table heading says Status, not State", heads.includes("Status") && !heads.includes("State"), heads.join(" · "));
  await show.selectOption("meeting");
  await until(async () => new URL(page.url()).searchParams.get("f") === "meeting", 10000);
  record("Awaiting meeting shows the task with its meeting time", await until(async () => (await row.first().innerText()).includes("10:30"), 30000));

  await page.goto(`${BASE}/work/${task.number}`);
  record("the record says Status", await opened(page.getByText("Status", { exact: true }), 90000));
  record("…and shows its progress", await until(async () => (await page.getByRole("progressbar", { name: "Progress" }).getAttribute("aria-valuenow")) === "40", 20000));
  let dot = page.getByRole("button", { name: /, 1 meeting$/ });
  if (!(await opened(dot, 10000))) {
    await page.getByRole("button", { name: "Next month" }).click();
    dot = page.getByRole("button", { name: /, 1 meeting$/ });
  }
  record("the small calendar marks the meeting's day", await opened(dot, 10000));
  if (await dot.count()) {
    await dot.first().click();
    record("…and tapping the day lists the meeting", await opened(page.getByText(`${PREFIX}sync on the job`), 5000));
  }
  await page.getByRole("button", { name: "Schedule a meeting" }).click();
  const sheet = page.getByRole("dialog", { name: "Schedule a meeting" });
  const sheetOpen = await opened(sheet, 10000);
  const titleBox = sheet.getByRole("textbox", { name: "What's it about" });
  const ticked = await sheet.locator('[role="checkbox"][aria-checked="true"]').count();
  record(
    "the calendar symbol opens Schedule a meeting about the task, its people ticked",
    sheetOpen && (await titleBox.inputValue()) === task.title && ticked >= 2,
    `title "${await titleBox.inputValue().catch(() => "")}", ${ticked} ticked`,
  );
  if (sheetOpen) {
    await titleBox.fill(`${PREFIX}second sync`);
    await sheet.getByLabel("Start time").fill("15:00");
    await sheet.getByRole("button", { name: "Save" }).click();
    record("…and saving puts a second meeting on the task", await until(async () => (await prisma.calendarEvent.count({ where: { taskId: task.id, title: `${PREFIX}second sync`, startTime: "15:00" } })) === 1, 15000));
  }
  await page.getByRole("button", { name: "Mark" }).click();
  const progressSheet = page.getByRole("dialog", { name: "How far along?" });
  if (await opened(progressSheet, 10000)) {
    await progressSheet.getByRole("spinbutton", { name: "Percent done" }).fill("70");
    await progressSheet.getByRole("button", { name: "Save" }).click();
  }
  record("Mark sets the task's progress from its record", await until(async () => (await prisma.task.findUnique({ where: { id: task.id }, select: { progress: true } }))?.progress === 70, 15000));

  const mate = await signInPage(browser, member.email, PASSWORD);
  await mate.page.goto(`${BASE}/`);
  const link = mate.page.getByRole("link", { name: new RegExp(task.ref) });
  const linked = await opened(link, 90000);
  record("Today's meeting card names the task", linked);
  if (linked) {
    await link.first().click();
    record("…and opens it", await until(async () => new URL(mate.page.url()).pathname === `/work/${task.number}`, 30000), new URL(mate.page.url()).pathname);
  }

  const phone = await signInPage(browser, "founder@orbit.local", "orbit123", true);
  await phone.page.goto(`${BASE}/work/${task.number}`);
  const calendar = phone.page.getByRole("group", { name: /^Meetings in / });
  const box = (await opened(calendar, 90000)) ? await calendar.first().boundingBox() : null;
  record("on a phone the small calendar fits the screen", Boolean(box && box.x >= 0 && box.x + box.width <= 390), box ? `x ${Math.round(box.x)}, width ${Math.round(box.width)}` : "not found");

  const errors = [...desk.errors, ...mate.errors, ...phone.errors];
  record("no console errors", errors.length === 0, errors.slice(0, 3).join(" | ").slice(0, 400));
}

main()
  .catch((e) => {
    console.error(e);
    fail++;
  })
  .finally(async () => {
    await browser?.close().catch(() => undefined);
    await cleanup().catch((e) => console.error("cleanup:", e));
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  });
