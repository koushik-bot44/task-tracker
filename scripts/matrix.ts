/**
 * Phase 5 precision matrix. Every screen, two viewports, light only —
 * including one home per role, which is the point of the batch.
 *
 * Read-only. It opens panels and modals; it never submits one.
 */
import { chromium, type Browser, type Page } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const OUT = path.join("screenshots", "matrix");

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];

type Shot = {
  name: string;
  path: string;
  role?: "MANAGER" | "TEAM_LEAD" | "RESOURCE";
  prepare?: (page: Page) => Promise<void>;
};

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, null, {
      timeout: 15_000,
    })
    .catch(() => {});
  // Charts reveal to 750ms; give them room to finish before the shutter.
  await page.waitForTimeout(1400);
}

async function creds(role: string) {
  const email = process.env[`SHOT_${role}_EMAIL`];
  const password = process.env[`SHOT_${role}_PASSWORD`];
  if (!email || !password) throw new Error(`SHOT_${role}_* missing from .env`);
  return { email, password };
}

async function stateFor(browser: Browser, role: string) {
  const c = await creds(role);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const res = await page.request.post(`${BASE}/api/auth`, { data: c });
  if (!res.ok()) throw new Error(`sign-in failed for ${role}: ${res.status()}`);
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const states = {
    MANAGER: await stateFor(browser, "MANAGER"),
    TEAM_LEAD: await stateFor(browser, "TEAM_LEAD"),
    RESOURCE: await stateFor(browser, "RESOURCE"),
  };

  // Busiest tool makes the most honest shot.
  const probe = await browser.newContext({ storageState: states.MANAGER });
  const probePage = await probe.newPage();
  const projects = await (await probePage.request.get(`${BASE}/api/projects`)).json();
  /* Prefer the shot sandbox when it exists: it is built to contain an overdue
     item, an on-hold item, an unassigned one and a couple of parents, which is
     what makes the charts worth photographing. */
  const sandbox = projects.find((p: { slug: string }) => p.slug === "ss-shot-sandbox");
  const busiest = sandbox ?? [...projects].sort((a, b) => b.taskCount - a.taskCount)[0];
  const slug: string = busiest?.slug ?? "none";
  await probe.close();

  // Restructure (2026-09): Today per role, then the six other routes.
  const SHOTS: Shot[] = [
    { name: "01-login", path: "/login", role: undefined },
    { name: "02-today-manager", path: "/", role: "MANAGER" },
    { name: "03-today-lead", path: "/", role: "TEAM_LEAD" },
    { name: "04-today-member", path: "/", role: "RESOURCE" },
    { name: "05-projects", path: "/projects", role: "MANAGER" },
    { name: "06-project", path: `/project/${slug}`, role: "MANAGER" },
    { name: "07-calendar", path: "/calendar", role: "MANAGER" },
    { name: "08-people", path: "/people", role: "MANAGER" },
    { name: "09-settings-account", path: "/settings/account", role: "MANAGER" },
  ];

  let n = 0;
  for (const vp of VIEWPORTS) {
    for (const shot of SHOTS) {
      const ctx = await browser.newContext({
        ...(shot.role ? { storageState: states[shot.role] } : {}),
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await ctx.newPage();
      await page.goto(BASE + shot.path);
      await settle(page);
      if (shot.prepare) {
        await shot.prepare(page);
        // Settle again: a panel opened by prepare() starts its own queries,
        // and the first pass photographed them mid-skeleton.
        await settle(page);
      }
      await page.screenshot({
        path: path.join(OUT, `${shot.name}--${vp.name}.png`),
      });
      await ctx.close();
      n++;
    }
  }

  await browser.close();
  console.log(`${n} screenshots -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
