/** Two pages, two viewports — the tight loop for the Review + Focus fixes. */
import { chromium } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const OUT = path.join("screenshots", "pair");
const PAGES = [
  { name: "review", path: "/review" },
  { name: "focus", path: "/focus" },
];
const VPS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];
async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const auth = await browser.newContext();
  const ap = await auth.newPage();
  const r = await ap.request.post(`${BASE}/api/auth`, {
    data: { email: process.env.SHOT_MANAGER_EMAIL, password: process.env.SHOT_MANAGER_PASSWORD },
  });
  if (!r.ok()) throw new Error(`sign-in ${r.status()}`);
  const storageState = await auth.storageState();
  await auth.close();
  for (const vp of VPS) {
    for (const pg of PAGES) {
      const ctx = await browser.newContext({ storageState, viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      await page.goto(BASE + pg.path);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT, `${pg.name}--${vp.name}.png`) });
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`4 shots -> ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
