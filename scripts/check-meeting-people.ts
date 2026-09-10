/* Picking people for a meeting (2026-09-10).
 *   npx tsx scripts/check-meeting-people.ts   (dev server up)
 *
 * The fourth "About?" choice is called "People" (it was "One person", though
 * it always allowed several), and the Who list has a search. Checks: the label,
 * the search narrowing the faces, ticks surviving a search, several people
 * ticked at once, and an honest line when nobody matches.
 * Evidence: records/evidence/accounts-notify/8-meeting-people/
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const DIR = "records/evidence/accounts-notify/8-meeting-people";
mkdirSync(DIR, { recursive: true });

let pass = 0;
let fail = 0;
function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', "founder@orbit.local");
  await page.fill('input[type="password"]', "orbit123");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 });

  await page.goto(`${BASE}/calendar`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /meeting/i }).first().click();
  await page.waitForTimeout(1200);

  record("no choice is called \"One person\" any more", !(await page.getByRole("button", { name: "One person" }).isVisible()));
  const people = page.getByRole("button", { name: "People", exact: true });
  record("the choice is called \"People\"", await people.isVisible());
  await people.click();
  await page.waitForTimeout(1500);

  const faces = page.getByRole("group", { name: "Who" }).getByRole("checkbox");
  const everyone = await faces.count();
  const search = page.getByLabel("Find a person");
  record("a Find a person box is offered", await search.isVisible(), `${everyone} faces before searching`);
  await page.screenshot({ path: `${DIR}/people-choice.png`, fullPage: true });

  await search.fill("Meera");
  await page.waitForTimeout(500);
  const found = await faces.count();
  const names = await faces.allInnerTexts();
  record("typing a name narrows the faces to that person", found >= 1 && found < everyone && names.every((n) => /Meera/.test(n)), `${found} shown: ${names.join(", ")}`);
  await faces.first().click();
  await page.screenshot({ path: `${DIR}/search-meera-ticked.png`, fullPage: true });

  await search.fill("Karthik");
  await page.waitForTimeout(500);
  await faces.first().click();

  await search.fill("");
  await page.waitForTimeout(500);
  const ticked = await page.getByRole("group", { name: "Who" }).locator('[aria-checked="true"]').count();
  record("both people stay ticked after the search is cleared (several at once)", ticked === 2, `${ticked} ticked`);
  const counter = await page.getByText(/^\d+ of \d+$/).first().innerText().catch(() => "");
  record("the count reads 2 of everyone", counter === `2 of ${everyone}`, counter);

  await search.fill("zzzz-nobody");
  await page.waitForTimeout(500);
  record("a search that matches nobody says so", await page.getByText(/Nobody matches/).isVisible());
  await page.screenshot({ path: `${DIR}/search-no-match.png`, fullPage: true });

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
