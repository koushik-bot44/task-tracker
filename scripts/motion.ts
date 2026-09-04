/**
 * Motion spot-check. The ONLY script in this repo that drives real pointer
 * gestures, and it is confined to the sandbox tool.
 *
 *   npx tsx --env-file=.env scripts/motion.ts
 *
 * A previous version of this idea drove completion clicks and drags against
 * live data and damaged 15 real rows. The guard below is the response: every
 * mutating action calls assertSandbox() first, which checks BOTH that the page
 * is on /t/rig-sandbox AND that the row it is about to touch is titled RS-.
 * Either check failing throws and takes the whole run down. There is no path
 * to a mutating click that skips it.
 */
import { chromium, type Locator, type Page } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const EMAIL = process.env.SCREEN_EMAIL;
const PASSWORD = process.env.SCREEN_PASSWORD;
const SLUG = "rig-sandbox";
const OUT = path.join("screenshots", "motion");

let mutations = 0;

/**
 * Both assertions, every time, immediately before the gesture. Nothing here is
 * cached — the URL is re-read and the title is re-read at the moment of use,
 * because a stale check is not a check.
 */
async function assertSandbox(page: Page, row?: Locator): Promise<string> {
  const url = page.url();
  if (!url.includes(`/t/${SLUG}`)) {
    throw new Error(`REFUSING TO MUTATE — url is ${url}, expected /t/${SLUG}`);
  }
  if (!row) return "";
  const title = await row.locator('input[aria-label="Task title"]').inputValue();
  if (!title.startsWith("RS-")) {
    throw new Error(`REFUSING TO MUTATE — row title ${JSON.stringify(title)} is not RS-`);
  }
  mutations += 1;
  return title;
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, null, {
      timeout: 15_000,
    })
    .catch(() => {});
  await page.waitForTimeout(900);
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
  await auth.close();

  const ctx = await browser.newContext({ storageState, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  /* Prove the guard before trusting it. Navigate to a REAL tool and call the
     assertion; it must throw on the URL check, before any gesture exists. A
     guard that has never been seen to fail is an assumption, not a guard.
     Read-only by construction — assertSandbox performs no actions. */
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const real = projects.find((p: { slug: string }) => p.slug !== SLUG);
  if (real) {
    await page.goto(`${BASE}/t/${real.slug}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('input[aria-label="Task title"]', { timeout: 20_000 });
    let threw = false;
    try {
      await assertSandbox(page, page.locator("[data-task-id]").first());
    } catch (e) {
      threw = true;
      console.log(`guard proof OK — refused on /t/${real.slug}: ${(e as Error).message}`);
    }
    if (!threw) throw new Error("GUARD DID NOT FIRE on a real tool — aborting.");
    if (mutations !== 0) throw new Error("guard counted a mutation it should have refused");
  }

  const shot = (n: string) => page.screenshot({ path: path.join(OUT, `${n}.png`) });

  // ── 1. Row entrance stagger ───────────────────────────────────────────────
  // Read-only: caught mid-flight, before settle().
  await page.goto(`${BASE}/t/${SLUG}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[aria-label="Task title"]', { timeout: 20_000 });
  await page.waitForTimeout(90);
  await shot("1-entrance-midflight");
  await settle(page);
  await shot("2-entrance-settled");

  const rows = page.locator("[data-task-id]");
  const firstRow = rows.first();

  // ── 2. Press feedback on a row ────────────────────────────────────────────
  const title = await assertSandbox(page, firstRow);
  console.log(`gesture 1 (press) on: ${title}`);
  const box = await firstRow.boundingBox();
  if (box) {
    await page.mouse.move(box.x + 40, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(70);
    await shot("3-press-active");
    await page.mouse.up();
  }
  await page.waitForTimeout(300);

  // ── 3. Completion toggle → strike-through sweep ───────────────────────────
  const t2 = await assertSandbox(page, firstRow);
  console.log(`gesture 2 (complete) on: ${t2}`);
  const check = firstRow.locator('button[aria-label*="done" i], input[type="checkbox"]').first();
  await check.click();
  await page.waitForTimeout(110);
  await shot("4-strikethrough-midsweep");
  await page.waitForTimeout(700);
  await shot("5-strikethrough-settled");

  // ── 4. Toast + undo ───────────────────────────────────────────────────────
  await shot("6-toast");

  // ── 5. Detail panel open ──────────────────────────────────────────────────
  const t3 = await assertSandbox(page, firstRow);
  console.log(`gesture 3 (open detail) on: ${t3}`);
  await firstRow.locator('input[aria-label="Task title"]').click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(120);
  await shot("7-panel-midopen");
  await settle(page);
  await shot("8-panel-settled");

  // ── 6. Revert the completion so the sandbox goes back as it came ──────────
  const t4 = await assertSandbox(page, firstRow);
  console.log(`gesture 4 (revert) on: ${t4}`);
  await check.click();
  await page.waitForTimeout(500);
  await shot("9-reverted");

  console.log(`\nmutating gestures, all guarded: ${mutations}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
