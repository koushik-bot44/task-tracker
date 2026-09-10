/* Project notes can carry any kind of file (2026-09-10).
 *   npx tsx scripts/check-notes-attach.ts   (dev server up)
 *
 * Opens a project's notes as the CEO and checks the Attach button is there and
 * named, that the file picker no longer limits the kind of file, and that a
 * file the old picker refused (a .zip) is accepted and waits to be sent.
 * Evidence: records/evidence/accounts-notify/5-notes-attach/
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const DIR = "records/evidence/accounts-notify/5-notes-attach";
mkdirSync(DIR, { recursive: true });

let fail = 0;
function record(name: string, ok: boolean, detail = "") {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', "founder@orbit.local");
  await page.fill('input[type="password"]', "orbit123");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 });

  await page.goto(`${BASE}/project/quarterly-close`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /Project notes/ }).first().click();
  await page.waitForTimeout(1500);

  const attach = page.getByRole("button", { name: "Attach a file" });
  record("the Attach button is there", await attach.isVisible());
  record("it is named on screen, not just an icon", /Attach/.test(await attach.innerText()), (await attach.innerText()).trim());

  const drawer = page.getByRole("dialog", { name: "Project notes" });
  const accept = await drawer.locator('input[type="file"]:not([capture])').first().getAttribute("accept");
  record("the file picker does not limit the kind of file", accept === null, accept === null ? "any file" : `limited to ${accept}`);

  const chooser = page.waitForEvent("filechooser");
  await attach.click();
  const fc = await chooser;
  await fc.setFiles({ name: "board-minutes.zip", mimeType: "application/zip", buffer: Buffer.from("PK test archive") });
  await page.waitForTimeout(2000);
  const drawerText = await drawer.innerText();
  record("a .zip (refused by the old picker) is accepted and waits to be sent", /board-minutes\.zip/.test(drawerText));

  await drawer.screenshot({ path: `${DIR}/project-notes-attach.png` });
  await browser.close();
  console.log(`\n${4 - fail} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
