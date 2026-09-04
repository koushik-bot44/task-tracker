/**
 * Screenshot matrix. Signs in through /api/auth against the local dev server,
 * then captures every route at two viewports in both themes.
 *
 *   npm run screens              -> screenshots/current/
 *   npm run screens -- before    -> screenshots/before/
 *
 * Output is gitignored; it exists to be looked at, not committed.
 */
import { chromium, type Browser, type Page } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const EMAIL = process.env.SCREEN_EMAIL;
const PASSWORD = process.env.SCREEN_PASSWORD;

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];

type Shot = {
  name: string;
  path: string;
  /** Runs after navigation, before the shot — opens panels, palettes, etc. */
  prepare?: (page: Page) => Promise<void>;
};

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});

  // Queries resolve after hydration, so networkidle alone catches the skeleton
  // state. Every skeleton in the app pulses — wait until none are left.
  await page
    .waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, null, {
      timeout: 15_000,
    })
    .catch(() => {});

  // Then let entrance animations (rings, tickers, card fades) finish.
  await page.waitForTimeout(1200);
}

async function main() {
  const label = process.argv[2] ?? "current";
  const outDir = path.join("screenshots", label);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  if (!EMAIL || !PASSWORD) {
    throw new Error("SCREEN_EMAIL and SCREEN_PASSWORD must be set in .env");
  }

  const browser: Browser = await chromium.launch();

  // One sign-in, reused as storage state across every context.
  const auth = await browser.newContext();
  const authPage = await auth.newPage();
  const res = await authPage.request.post(`${BASE}/api/auth`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`sign-in failed: ${res.status()} ${await res.text()}`);
  }
  const storageState = await auth.storageState();
  await auth.close();

  // Whatever tool actually has the most work in it makes the most honest shot.
  const probe = await browser.newContext({ storageState });
  const probePage = await probe.newPage();
  const projects = await (
    await probePage.request.get(`${BASE}/api/projects`)
  ).json();
  const busiest = [...projects].sort((a, b) => b.taskCount - a.taskCount)[0];
  const slug: string = busiest?.slug ?? "none";

  const tasks = await (
    await probePage.request.get(`${BASE}/api/tasks?projectId=${busiest.id}`)
  ).json();
  const sampleTask = tasks.find((t: { parentId: string | null }) => t.parentId) ?? tasks[0];
  await probe.close();

  const shots: Shot[] = [
    { name: "login", path: "/login" },
    { name: "home", path: "/" },
    { name: "tree", path: `/t/${slug}` },
    { name: "board", path: `/t/${slug}/board` },
    { name: "focus", path: "/focus" },
    { name: "changelog", path: "/changelog" },
    { name: "review", path: "/review" },
    { name: "settings-users", path: "/settings/users" },
    { name: "settings-account", path: "/settings/account" },
    { name: "tree-panel", path: `/t/${slug}?task=${sampleTask?.id ?? ""}` },
    {
      name: "tree-palette",
      path: `/t/${slug}`,
      prepare: async (page) => {
        await page.keyboard.press("Control+k");
        await page.waitForTimeout(400);
      },
    },
    {
      name: "help",
      path: "/",
      prepare: async (page) => {
        await page.getByRole("button", { name: "Help" }).click();
        await page.waitForTimeout(400);
      },
    },
  ];

  let count = 0;

  // One theme, so the matrix halved: every route at two widths, and that is
  // the whole set. It is finally small enough to look at all of.
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      storageState,
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
      colorScheme: "light",
    });

    const page = await context.newPage();

    for (const shot of shots) {
      try {
        await page.goto(BASE + shot.path, { waitUntil: "domcontentloaded" });
        await settle(page);
        if (shot.prepare) await shot.prepare(page);
        await page.screenshot({
          path: path.join(outDir, `${shot.name}--${viewport.name}.png`),
          fullPage: false,
        });
        count++;
      } catch (error) {
        console.error(`  ! ${shot.name} ${viewport.name}: ${String(error)}`);
      }
    }

    await context.close();
  }

  await browser.close();
  console.log(`${count} screenshots -> ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
