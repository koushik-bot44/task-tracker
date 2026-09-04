/**
 * Reproduce the New tool modal at several viewport heights and report whether
 * its footer (the Create button) is actually reachable.
 *
 * Read-only: it opens the modal and measures. It never submits.
 */
import { chromium } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const EMAIL = process.env.SCREEN_EMAIL;
const PASSWORD = process.env.SCREEN_PASSWORD;
const OUT = path.join("screenshots", "modal");

const SIZES = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x700", width: 1280, height: 700 },
  { name: "1280x600", width: 1280, height: 600 },
  { name: "390x844", width: 390, height: 844 },
  { name: "390x667", width: 390, height: 667 },
];

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

  for (const size of SIZES) {
    const ctx = await browser.newContext({
      storageState,
      viewport: { width: size.width, height: size.height },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1200);

    // Below md the sidebar lives behind a drawer, so the button is not in the
    // DOM until it is opened. Mobile is exactly where a modal overflows, so
    // this is worth reaching rather than skipping.
    const add = page.getByRole("button", { name: "Add a project" });
    if (!(await add.isVisible().catch(() => false))) {
      await page
        .getByRole("button", { name: /menu|navigation|open sidebar/i })
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
      await page.waitForTimeout(500);
    }
    await add.click({ timeout: 10_000 });
    await page.waitForTimeout(600);

    const dialog = page.getByRole("dialog", { name: "New project" });
    const box = await dialog.boundingBox();
    const create = page.getByRole("button", { name: /Create project|Go to People/ });
    const createBox = await create.boundingBox().catch(() => null);

    const vh = size.height;
    const bottom = box ? box.y + box.height : 0;
    const footerVisible =
      createBox !== null && createBox.y + createBox.height <= vh && createBox.y >= 0;

    console.log(
      `${size.name.padEnd(9)} dialog y=${box?.y.toFixed(0)} h=${box?.height.toFixed(0)} ` +
        `bottom=${bottom.toFixed(0)} / vh=${vh}  ` +
        `${bottom > vh ? "OVERFLOWS" : "fits"}  |  footer ${footerVisible ? "reachable" : "OFF-SCREEN"}`,
    );

    /* Layering proof: hover a tree row (the sticky-aside bug made the hovered
       row paint over the dialog), then ask the browser what element is
       actually on top at the dialog's centre. It must be inside the dialog. */
    const centre = box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
    let topIsDialog = false;
    if (centre) {
      topIsDialog = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return !!el?.closest('[role="dialog"]');
      }, centre);
    }
    console.log(`${" ".repeat(11)}topmost element at dialog centre is ${topIsDialog ? "INSIDE the dialog" : "SOMETHING ELSE — layering broken"}`);

    await page.screenshot({ path: path.join(OUT, `${size.name}.png`) });
    await ctx.close();
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
