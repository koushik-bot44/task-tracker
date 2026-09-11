/* After a data reset: the CEO's screens open without an error (2026-09-11).
 *   npx tsx --env-file=.env.local scripts/check-after-reset.ts            (dev server up)
 *   CEO_EMAIL=… CEO_PASSWORD=… SCREEN_BASE=https://… npx tsx scripts/check-after-reset.ts
 *
 * Signs in as the CEO and opens Today, Work, Departments, Calendar, People and
 * Well Being on a desktop and a phone: every page answers 200, no request
 * answers 5xx, nothing says "Something went wrong", and the console is clean.
 * Prints what each screen shows (rows, tabs) so an empty screen is seen to be
 * empty on purpose. Read-only: it changes nothing.
 */
import { chromium, type Browser } from "playwright";

const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const EMAIL = process.env.CEO_EMAIL ?? "founder@orbit.local";
const PASSWORD = process.env.CEO_PASSWORD ?? "orbit123";
const SCREENS: { path: string; name: string; expect: RegExp }[] = [
  { path: "/", name: "Today", expect: /Today/ },
  { path: "/work", name: "Work", expect: /Tasks/ },
  { path: "/projects", name: "Departments", expect: /Departments|department/i },
  { path: "/calendar", name: "Calendar", expect: /Calendar/ },
  { path: "/people", name: "People", expect: /People/ },
  { path: "/routine", name: "Well Being", expect: /Well Being/ },
];

let pass = 0;
let fail = 0;
function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function run(browser: Browser, phone: boolean) {
  const context = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  const bad: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 500) bad.push(`${r.status()} ${r.url().replace(BASE, "")}`);
  });
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  const signedIn = await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }).then(() => true).catch(() => false);
  record(`${phone ? "phone" : "desktop"}: the CEO signs in`, signedIn);
  if (!signedIn) return { errors, bad };
  for (const s of SCREENS) {
    const res = await page.goto(`${BASE}${s.path}`, { waitUntil: "networkidle", timeout: 90000 }).catch(() => null);
    await page.waitForTimeout(1500);
    // The page's heading sits above <main>, so the words are read from both.
    const headings = (await page.locator("h1, h2").allInnerTexts().catch(() => [])).join(" ");
    const text = `${headings} ${(await page.locator("main").innerText().catch(() => "")) || (await page.locator("body").innerText().catch(() => ""))}`;
    const wrong = /Something went wrong|Couldn.t load|Application error|Internal Server Error/i.test(text);
    const rows = (await page.locator("main table tbody tr").count().catch(() => 0)) || (await page.locator("main li").count().catch(() => 0));
    record(`${phone ? "phone" : "desktop"}: ${s.name} opens`, Boolean(res && res.status() === 200) && !wrong && s.expect.test(text), `status ${res?.status() ?? "none"}${wrong ? ", says something went wrong" : ""}, ${rows} rows/items`);
  }
  await context.close();
  return { errors, bad };
}

async function main() {
  const browser = await chromium.launch();
  try {
    const desk = await run(browser, false);
    const phone = await run(browser, true);
    record("no request answered 5xx", desk.bad.length + phone.bad.length === 0, [...desk.bad, ...phone.bad].slice(0, 5).join(" | "));
    const errors = [...desk.errors, ...phone.errors].filter((e) => !/status of 401/.test(e));
    record("no console errors", errors.length === 0, errors.slice(0, 3).join(" | ").slice(0, 300));
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
