/* Screenshot the department page with the cursor hovering a project row. */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = "/private/tmp/claude-502/-Users-saigogineni-Documents-spire-Task-Tracker-main/912e4402-83c5-41c6-85bf-0c9e0733b6fa/scratchpad/shots";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="email"], input[name="email"]').first().fill("founder@orbit.local");
  await page.locator('input[type="password"]').last().fill("orbit123");
  await page.locator('button[type="submit"], button:has-text("Sign in")').first().click();
  await page.waitForTimeout(1800);

  const deptHref = await page.locator('a[href^="/department/"]').first().getAttribute("href");
  await page.goto(`${BASE}${deptHref}`);
  await page.waitForTimeout(1500);
  await page.locator('a[href^="/t/"]').first().hover();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/hover-department.png`, fullPage: false });
  await browser.close();
  console.log("done hover");
}

main().catch((e) => { console.error(e); process.exit(1); });
