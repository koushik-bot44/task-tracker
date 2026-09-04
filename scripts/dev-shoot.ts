/* Screenshot the prototype pages as a given role. */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = "/private/tmp/claude-502/-Users-saigogineni-Documents-spire-Task-Tracker-main/912e4402-83c5-41c6-85bf-0c9e0733b6fa/scratchpad/shots";

async function main() {
  const email = process.argv[2] ?? "founder@orbit.local";
  const tag = process.argv[3] ?? "founder";
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(`${BASE}/login`);
  await page.waitForTimeout(400);
  // login form: email + password (+ maybe passcode field)
  const fields = await page.locator("input").count();
  if (fields >= 3) await page.locator("input").first().fill("orbit-dev");
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').last().fill("orbit123");
  await page.locator('button[type="submit"], button:has-text("Sign in")').first().click();
  await page.waitForURL(`${BASE}/**`, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);

  await page.goto(`${BASE}/`);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${tag}-home.png`, fullPage: true });

  // First department card link, if present
  const deptHref = await page.locator('a[href^="/department/"]').first().getAttribute("href").catch(() => null);
  if (deptHref) {
    await page.goto(`${BASE}${deptHref}`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${tag}-department.png`, fullPage: true });
  }

  // First project from the department list, if present
  const projHref = await page.locator('a[href^="/t/"]').first().getAttribute("href").catch(() => null);
  if (projHref) {
    await page.goto(`${BASE}${projHref}`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${tag}-project.png`, fullPage: false });
  }

  await page.goto(`${BASE}/people`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${tag}-people.png`, fullPage: true });

  await browser.close();
  console.log("done", tag);
}

main().catch((e) => { console.error(e); process.exit(1); });
