/**
 * Phase 6 precision pass: every surface the three features touched, at both
 * viewports, in each state that matters.
 *
 * The features are all *conditional* UI — a percentage chip that only exists
 * on parents, a People page that differs by role, a tree that differs by rail
 * state. A single shot per screen would photograph one branch and miss the
 * other, so each pair below is deliberate: read-only next to editable, lead
 * next to manager.
 *
 * Read-only with one exception: it clicks Edit to reach the editing state.
 * That toggle is client state and writes nothing.
 */
import { chromium, type Browser, type Page } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const OUT = path.join("screenshots", "phase6");

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];

type Role = "MANAGER" | "TEAM_LEAD" | "RESOURCE";
type Shot = {
  name: string;
  path: string;
  role?: Role;
  prepare?: (page: Page) => Promise<void>;
};

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, null, {
      timeout: 15_000,
    })
    .catch(() => {});
  await page.waitForTimeout(1200);
}

async function stateFor(browser: Browser, role: Role) {
  const email = process.env[`SHOT_${role}_EMAIL`];
  const password = process.env[`SHOT_${role}_PASSWORD`];
  if (!email || !password) throw new Error(`SHOT_${role}_* missing from .env`);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const res = await page.request.post(`${BASE}/api/auth`, { data: { email, password } });
  if (!res.ok()) throw new Error(`sign-in failed for ${role}: ${res.status()}`);
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

/** Lift the manager's rail. No-op for anyone else, who never sees the button. */
const startEditing = async (page: Page) => {
  await page
    .getByRole("button", { name: "Edit", exact: true })
    .first()
    .click({ timeout: 6000 })
    .catch(() => {});
  await page.waitForTimeout(700);
};

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const states = {
    MANAGER: await stateFor(browser, "MANAGER"),
    TEAM_LEAD: await stateFor(browser, "TEAM_LEAD"),
    RESOURCE: await stateFor(browser, "RESOURCE"),
  };

  const probe = await browser.newContext({ storageState: states.MANAGER });
  const probePage = await probe.newPage();
  const projects = await (await probePage.request.get(`${BASE}/api/projects`)).json();
  const sandbox = projects.find((p: { slug: string }) => p.slug === "ss-shot-sandbox");
  const busiest = sandbox ?? [...projects].sort((a, b) => b.taskCount - a.taskCount)[0];
  const slug: string = busiest?.slug ?? "none";
  const tasks: { id: string; parentId: string | null }[] = await (
    await probePage.request.get(`${BASE}/api/tasks?projectId=${busiest.id}`)
  ).json();
  /* A PARENT for the panel shots: the percentage chip only exists on parents,
     and photographing a leaf would prove nothing about it. */
  const parentIds = new Set(tasks.map((t) => t.parentId).filter(Boolean) as string[]);
  const parent = tasks.find((t) => parentIds.has(t.id)) ?? tasks[0];
  await probe.close();
  console.log(`tool=${slug}  parent=${parent?.id ?? "none"}  (${parentIds.size} parents)`);

  const tree = `/t/${slug}`;
  const board = `/t/${slug}/board`;
  const panel = `/t/${slug}?task=${parent?.id ?? ""}`;

  const SHOTS: Shot[] = [
    { name: "01-tree-manager-readonly", path: tree, role: "MANAGER" },
    { name: "02-tree-manager-editing", path: tree, role: "MANAGER", prepare: startEditing },
    { name: "03-tree-lead", path: tree, role: "TEAM_LEAD" },
    { name: "04-tree-developer", path: tree, role: "RESOURCE" },
    { name: "05-board-manager-readonly", path: board, role: "MANAGER" },
    { name: "06-board-manager-editing", path: board, role: "MANAGER", prepare: startEditing },
    { name: "07-board-lead", path: board, role: "TEAM_LEAD" },
    { name: "08-panel-manager-readonly", path: panel, role: "MANAGER" },
    {
      // The panel URL sits the sheet over the header's Edit button, and a fresh
      // goto resets the per-session rail anyway. So reach the editable panel
      // the way a manager actually does: lift the rail on the tree, then open
      // the panel by click — one page context, so the module store survives.
      name: "09-panel-manager-editing",
      path: tree,
      role: "MANAGER",
      prepare: async (page) => {
        await startEditing(page);
        const row = page.locator(`[data-task-id="${parent?.id ?? ""}"]`).first();
        await row.hover().catch(() => {});
        await row
          .getByRole("button", { name: "Open details, notes and gates" })
          .first()
          .click({ timeout: 6000 })
          .catch(() => {});
        await page.waitForTimeout(700);
      },
    },
    { name: "10-panel-developer", path: panel, role: "RESOURCE" },
    { name: "11-people-manager", path: "/settings/users", role: "MANAGER" },
    { name: "12-people-lead", path: "/settings/users", role: "TEAM_LEAD" },
    {
      name: "13-people-lead-create",
      path: "/settings/users",
      role: "TEAM_LEAD",
      prepare: async (page) => {
        await page
          .getByRole("button", { name: /Add (a )?(person|user|developer)/i })
          .first()
          .click({ timeout: 5000 })
          .catch(() => {});
        await page.waitForTimeout(600);
      },
    },
    { name: "14-overview-percent", path: `/t/${slug}/overview`, role: "MANAGER" },
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
        await settle(page);
      }
      await page.screenshot({ path: path.join(OUT, `${shot.name}--${vp.name}.png`) });
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
