/* Accessibility (2026-09-11), on the clone: axe on the main screens at desktop and
 * phone width, and the day's key moves by keyboard alone.
 *   npx tsx --env-file=.env.local scripts/check-a11y.ts      (dev server up)
 *
 * axe-core (already a dependency) runs on the login page and, signed in as a
 * manager, on Today, Work, a task's record, People, Departments, Calendar and
 * Account. A serious or critical violation fails; moderate and minor ones are
 * listed. Then, with the keyboard only: sign in; reach the main navigation, with
 * focus visible; reach a task's "Assigned to", open its sheet with Enter, find
 * focus inside it and kept there, close it with Escape, and land back on the
 * button that opened it.
 * Throwaway accounts ("a11y-…") and a department ("A11Y …"); leaves no trace.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { chromium, type Browser, type Page } from "playwright";
import { hashPassword } from "../lib/password";

if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "")) {
  console.error("DATABASE_URL is not the local clone. Refusing.");
  process.exit(1);
}

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PASSWORD = "Rig-A11y-2026";
const RUN = Date.now().toString(36);
const AXE = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const SIZES = [
  { name: "desktop", viewport: { width: 1280, height: 900 } },
  { name: "phone", viewport: { width: 390, height: 844 } },
] as const;

let pass = 0;
let fail = 0;
function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const note = (text: string) => console.log(`NOTE  ${text}`);

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
  const ids = (await prisma.user.findMany({ where: { email: { startsWith: "a11y-" } }, select: { id: true } })).map((u) => u.id);
  const departments = (await prisma.department.findMany({ where: { name: { startsWith: "A11Y " } }, select: { id: true } })).map((d) => d.id);
  const taskIds = (await prisma.task.findMany({ where: { OR: [{ departmentId: { in: departments } }, { assigneeId: { in: ids } }, { requesterId: { in: ids } }] }, select: { id: true } })).map((t) => t.id);
  await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { taskId: { in: taskIds } }] } });
  await prisma.taskActivity.deleteMany({ where: { taskId: { in: taskIds } } });
  await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  if (started) await prisma.loginAttempt.deleteMany({ where: { createdAt: { gte: started } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.department.deleteMany({ where: { id: { in: departments } } });
}

type Violation = { id: string; impact: string | null; nodes: number; target: string };
async function axe(page: Page, label: string) {
  await page.addScriptTag({ content: AXE });
  const found = (await page.evaluate(
    `axe.run(document, { resultTypes: ["violations"] }).then((r) => r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, target: v.nodes[0] ? v.nodes[0].target.join(" ") : "" })))`,
  )) as Violation[];
  const bad = found.filter((v) => v.impact === "serious" || v.impact === "critical");
  const rest = found.filter((v) => !bad.includes(v));
  record(`${label}: no serious or critical axe violation`, bad.length === 0, bad.map((v) => `${v.id} ×${v.nodes} at ${v.target}`).join("; "));
  if (rest.length) note(`${label}: ${rest.map((v) => `${v.id} [${v.impact}] ×${v.nodes}`).join("; ")}`);
}

async function open(page: Page, path: string) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
}

/* Read the page from a string: tsx would wrap a passed function in helpers the browser lacks. */
const FOCUS_TEXT = `(() => { const el = document.activeElement; if (!el || el === document.body) return ""; return (el.id || el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 60); })()`;
const FOCUS_IN_NAV = `!!(document.activeElement && document.activeElement.closest('nav[aria-label="Main"]'))`;
const FOCUS_IN_DIALOG = `!!(document.activeElement && document.activeElement.closest('[role="dialog"]'))`;
const FOCUS_RING = `(() => { const el = document.activeElement; if (!el || el === document.body) return false; const s = getComputedStyle(el); return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (!!s.boxShadow && s.boxShadow !== "none"); })()`;

async function tabUntil(page: Page, test: string, max: number): Promise<number> {
  for (let i = 0; i <= max; i++) {
    if (await page.evaluate(test)) return i;
    await page.keyboard.press("Tab");
  }
  return -1;
}

let browser: Browser | null = null;
/* With reduced motion on, a page whose first style differs between server and browser makes React warn. */
const consoleErrors: string[] = [];
function watch(page: Page) {
  page.on("console", (m) => {
    if (m.type() === "error" && !/status of 4\d\d/.test(m.text())) consoleErrors.push(`${new URL(page.url()).pathname}: ${m.text().slice(0, 140)}`);
  });
  page.on("pageerror", (e) => consoleErrors.push(e.message));
}

async function checks() {
  const hash = await hashPassword(PASSWORD);
  const lastDept = await prisma.department.findFirst({ orderBy: { orderKey: "desc" }, select: { orderKey: true } });
  const dept = await prisma.department.create({ data: { name: `A11Y Department ${RUN}`, color: "#475569", orderKey: generateKeyBetween(lastDept?.orderKey ?? null, null) } });
  const manager = await prisma.user.create({ data: { email: "a11y-manager@example.com", name: "A11Y Manager", role: "MANAGER", passwordHash: hash, status: "ACTIVE", departmentId: dept.id } });
  const member = await prisma.user.create({ data: { email: "a11y-member@example.com", name: "A11Y Member", role: "RESOURCE", passwordHash: hash, status: "ACTIVE", departmentId: dept.id } });

  const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "10.64.0.1" }, body: JSON.stringify({ email: manager.email, password: PASSWORD }) });
  const cookie = (auth.headers.get("set-cookie") ?? "").split(";")[0];
  const made = await fetch(`${BASE}/api/tasks`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ title: `A11Y check the fire exits ${RUN}`, departmentId: dept.id, assigneeId: member.id }) });
  const task = (await made.json()) as { number?: number };
  record("a task to look at", made.status === 201 && Boolean(task.number), `status ${made.status}`);
  if (!task.number) return;

  browser = await chromium.launch();
  for (const size of SIZES) {
    const context = await browser.newContext({ viewport: size.viewport, reducedMotion: "reduce" });
    const page = await context.newPage();
    watch(page);
    await open(page, "/login");
    await axe(page, `${size.name} /login`);
    await page.fill('input[type="email"]', manager.email);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 });
    for (const path of ["/", "/work", `/work/${task.number}`, "/people", "/projects", "/calendar", "/settings/account"]) {
      await open(page, path);
      await axe(page, `${size.name} ${path}`);
    }
    await context.close();
  }
  record("no console errors on any screen, with reduced motion on", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

  /* ---- keyboard only ---- */
  const context = await browser.newContext({ viewport: SIZES[0].viewport, reducedMotion: "reduce" });
  const kb = await context.newPage();
  await open(kb, "/login");
  const toEmail = await tabUntil(kb, `document.activeElement && document.activeElement.id === "email"`, 12);
  record("login: Tab reaches the email box", toEmail >= 0, `${toEmail} presses`);
  await kb.keyboard.type(manager.email);
  await kb.keyboard.press("Tab");
  record("…then the password box", (await kb.evaluate(FOCUS_TEXT)) === "password", String(await kb.evaluate(FOCUS_TEXT)));
  await kb.keyboard.type(PASSWORD);
  await kb.keyboard.press("Enter");
  await kb.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 }).catch(() => undefined);
  record("…and Enter signs in", !new URL(kb.url()).pathname.startsWith("/login"), kb.url().replace(BASE, ""));

  await open(kb, "/");
  const toNav = await tabUntil(kb, FOCUS_IN_NAV, 40);
  record("Tab reaches the main navigation", toNav >= 0, `${toNav} presses`);
  if (toNav >= 0) record("…and the focused link shows it has focus", Boolean(await kb.evaluate(FOCUS_RING)), String(await kb.evaluate(FOCUS_TEXT)));

  await open(kb, `/work/${task.number}`);
  const toAssigned = await tabUntil(kb, `(${FOCUS_TEXT}) === "A11Y Member"`, 80);
  record("a task's record: Tab reaches Assigned to", toAssigned >= 0, `${toAssigned} presses`);
  if (toAssigned < 0) return;
  record("…which shows it has focus", Boolean(await kb.evaluate(FOCUS_RING)));
  await kb.keyboard.press("Enter");
  await kb.waitForTimeout(600);
  const sheet = kb.getByRole("dialog", { name: "Who is doing this?" });
  record("Enter opens the Who is doing this? sheet", await sheet.isVisible().catch(() => false));
  record("…and focus moves into it", Boolean(await kb.evaluate(FOCUS_IN_DIALOG)), String(await kb.evaluate(FOCUS_TEXT)) || "focus stayed on the page");
  let stayed = true;
  for (let i = 0; i < 12; i++) {
    await kb.keyboard.press("Tab");
    if (!(await kb.evaluate(FOCUS_IN_DIALOG))) stayed = false;
  }
  record("…and Tab stays inside it while it is open", stayed);
  await kb.keyboard.press("Escape");
  await kb.waitForTimeout(600);
  record("Escape closes it", !(await sheet.isVisible().catch(() => false)));
  record("…and focus returns to Assigned to", (await kb.evaluate(FOCUS_TEXT)) === "A11Y Member", String(await kb.evaluate(FOCUS_TEXT)) || "focus went to the page");
  await context.close();
}

async function main() {
  await cleanup(null);
  const before = await countAll();
  const started = new Date();
  try {
    await checks();
  } catch (e) {
    record("the checks ran to the end", false, (e instanceof Error ? e.message : String(e)).split("\n")[0]);
  } finally {
    await browser?.close();
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
