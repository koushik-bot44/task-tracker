/**
 * Do filled buttons survive being touched?
 *
 * `.press:hover` used to set background-color, which outranked .bg-primary,
 * so every solid button lost its fill on hover and read as disappearing. This
 * measures the computed background at rest, on hover and while held, and
 * fails if a filled button ever goes transparent.
 *
 * It also drives the New tool form end to end — the only place in this repo
 * that creates a real project, so the tool it makes is deleted afterwards and
 * the deletion is proved.
 */
import { chromium, type Locator, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const EMAIL = process.env.SCREEN_EMAIL;
const PASSWORD = process.env.SCREEN_PASSWORD;
const TOOL_NAME = "BTNCHK Disposable";

const prisma = new PrismaClient();
let fail = 0;

function alpha(rgb: string): number {
  const m = rgb.match(/rgba?\(([^)]+)\)/);
  if (!m) return 1;
  const parts = m[1].split(",").map((p) => parseFloat(p));
  return parts.length === 4 ? parts[3] : 1;
}

async function bgOf(el: Locator): Promise<string> {
  return el.evaluate((n) => getComputedStyle(n as Element).backgroundColor);
}

async function checkFilled(page: Page, label: string, el: Locator) {
  const rest = await bgOf(el);
  await el.hover();
  await page.waitForTimeout(220);
  const hover = await bgOf(el);
  await page.mouse.down();
  await page.waitForTimeout(140);
  const held = await bgOf(el);
  await page.mouse.up();

  const opaque = (c: string) => alpha(c) > 0.5;
  const ok = opaque(rest) && opaque(hover) && opaque(held);
  if (!ok) fail++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label.padEnd(28)} rest=${rest} hover=${hover} held=${held}`,
  );
}

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error("SCREEN_EMAIL/SCREEN_PASSWORD must be set");
  const browser = await chromium.launch();

  // ── login page, signed out: the Sign in button ────────────────────────────
  const anon = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const loginPage = await anon.newPage();
  await loginPage.goto(`${BASE}/login`);
  await loginPage.waitForLoadState("networkidle").catch(() => {});
  // The form labels its fields with placeholders, not <label>.
  await loginPage.getByPlaceholder("Email").fill(EMAIL);
  await loginPage.getByPlaceholder(/^Password/).fill(PASSWORD);
  await checkFilled(
    loginPage,
    "login: Sign in",
    loginPage.getByRole("button", { name: /Sign in|Create account/ }).first(),
  );
  await anon.close();

  // ── signed in ─────────────────────────────────────────────────────────────
  const auth = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const authPage = await auth.newPage();
  const res = await authPage.request.post(`${BASE}/api/auth`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!res.ok()) throw new Error(`sign-in failed: ${res.status()}`);
  const storageState = await auth.storageState();
  await auth.close();

  const ctx = await browser.newContext({
    storageState,
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);

  await page.getByRole("button", { name: "Add a project" }).click();
  await page.waitForTimeout(600);

  const create = page.getByRole("button", { name: /Create project/ });

  // Disabled: it must NOT tint, and it must say what is missing.
  const disabledBg = await bgOf(create);
  await create.hover({ force: true });
  await page.waitForTimeout(220);
  const disabledHover = await bgOf(create);
  const steady = disabledBg === disabledHover;
  if (!steady) fail++;
  console.log(
    `${steady ? "PASS" : "FAIL"}  ${"disabled button steady".padEnd(28)} ${disabledBg} -> ${disabledHover}`,
  );

  const hint = await page.getByText(/Still needed:/).textContent();
  const explains = !!hint && /description/.test(hint);
  if (!explains) fail++;
  console.log(`${explains ? "PASS" : "FAIL"}  ${"disabled says why".padEnd(28)} ${hint ?? "<none>"}`);

  // Fill it in, then check the enabled button survives hover and press.
  await page.getByRole("textbox", { name: "Project name" }).fill(TOOL_NAME);
  await page
    .getByRole("textbox", { name: "Description" })
    .fill("Created by button-check, deleted immediately.");
  const leadSelect = page.getByRole("combobox", { name: "Team lead" });
  const leadOptions = await leadSelect.locator("option").all();
  let picked = "";
  for (const o of leadOptions) {
    const v = await o.getAttribute("value");
    if (v) {
      picked = v;
      break;
    }
  }
  if (!picked) throw new Error("no team lead available to pick");
  await leadSelect.selectOption(picked);

  // Wait for the form to actually agree it is complete, rather than assuming
  // the fills landed — a disabled button would otherwise fail as a timeout
  // and hide which field was still empty.
  await page
    .waitForFunction(
      () => {
        const b = [...document.querySelectorAll("button")].find((x) =>
          x.textContent?.includes("Create project"),
        );
        return b instanceof HTMLButtonElement && !b.disabled;
      },
      null,
      { timeout: 10_000 },
    )
    .catch(async () => {
      const still = await page.getByText(/Still needed:/).textContent().catch(() => null);
      throw new Error(`Create project never enabled. Hint says: ${still ?? "<no hint>"}`);
    });

  /* checkFilled presses the real button — mouse down then up on a submit
     control IS a click — so this both measures the fill through the press and
     submits the form. Clicking again afterwards would race a closing modal. */
  await checkFilled(page, "modal: Create project", create);
  await page.waitForTimeout(2500);
  const made = await prisma.project.findFirst({ where: { name: TOOL_NAME } });
  if (!made) fail++;
  console.log(`${made ? "PASS" : "FAIL"}  ${"Create project actually creates".padEnd(28)} ${made ? made.slug : "nothing created"}`);

  await browser.close();

  // ── cleanup: only what this script made ───────────────────────────────────
  const removed = await prisma.project.deleteMany({ where: { name: TOOL_NAME } });
  const left = await prisma.project.count({ where: { name: TOOL_NAME } });
  console.log(`\ncleanup: deleted ${removed.count}, remaining ${left}`);

  console.log(fail === 0 ? "\nall button checks passed" : `\n${fail} FAILED`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
