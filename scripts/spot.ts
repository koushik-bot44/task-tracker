/**
 * Phase 5 batch 1 spot loop. Not the full matrix — batch 2 owns that.
 *
 * Read-only: it signs in, navigates, and photographs. It clicks only to open
 * the About panel and the tool-create modal, neither of which writes anything.
 */
import { chromium, type Page } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const EMAIL = process.env.SCREEN_EMAIL;
const PASSWORD = process.env.SCREEN_PASSWORD;
const OUT = path.join("screenshots", "spot");

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, null, {
      timeout: 15_000,
    })
    .catch(() => {});
  await page.waitForTimeout(1000);
}

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error("SCREEN_EMAIL/SCREEN_PASSWORD must be set");
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const auth = await browser.newContext();
  const authPage = await auth.newPage();
  const res = await authPage.request.post(`${BASE}/api/auth`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!res.ok()) throw new Error(`sign-in failed: ${res.status()}`);
  const storageState = await auth.storageState();

  const projects = await (await authPage.request.get(`${BASE}/api/projects`)).json();
  const slug = [...projects].sort((a, b) => b.taskCount - a.taskCount)[0]?.slug;
  await auth.close();

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      storageState,
      viewport: { width: vp.width, height: vp.height },
    });
    const page = await ctx.newPage();
    const shot = (n: string) =>
      page.screenshot({ path: path.join(OUT, `${n}--${vp.name}.png`), fullPage: false });

    await page.goto(`${BASE}/t/${slug}`);
    await settle(page);
    await shot("tree");

    await page.goto(`${BASE}/t/${slug}/board`);
    await settle(page);
    await shot("board");

    // About & requirements — opens from the lead chip in the tool header.
    await page.goto(`${BASE}/t/${slug}`);
    await settle(page);
    const leadChip = page.getByRole("button", { name: /No lead assigned|^(?!Add).*$/ }).first();
    await page
      .locator("button", { hasText: /No lead assigned/ })
      .first()
      .click({ timeout: 5000 })
      .catch(() => leadChip.click({ timeout: 5000 }).catch(() => {}));
    await page.waitForTimeout(700);
    await shot("about-panel");

    await ctx.close();
  }

  await browser.close();
  console.log(`spot shots -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
