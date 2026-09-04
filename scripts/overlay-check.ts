/**
 * Every fixed overlay, measured against the viewport (restructure edition).
 * Opens the Give a task sheet, the task drawer, the profile menu, the search
 * palette and the help sheet at 390 and 1440, and fails if any lands outside.
 *
 *   npm run overlays        (dev server running; SHOT_* or the founder login)
 */
import { chromium, type Page } from "playwright";
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const EMAIL = process.env.SHOT_MANAGER_EMAIL ?? "founder@orbit.local";
const PASSWORD = process.env.SHOT_MANAGER_PASSWORD ?? "orbit123";
let fail = 0;

async function probe(page: Page, vp: string, label: string, open: (p: Page) => Promise<void>, selector: string) {
  await open(page);
  await page.waitForTimeout(700);
  const m = (await page.evaluate(`(() => {
    var els = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
    var d = els[els.length - 1];
    if (!d) return null;
    var b = d.getBoundingClientRect();
    return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top),
             bottom: Math.round(b.bottom), vw: window.innerWidth, vh: window.innerHeight };
  })()`)) as { left: number; right: number; top: number; bottom: number; vw: number; vh: number } | null;
  if (!m) {
    console.log(`SKIP  ${vp} ${label.padEnd(20)} not found`);
    fail++;
    return;
  }
  const ok = m.left >= 0 && m.top >= 0 && m.right <= m.vw && m.bottom <= m.vh;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${vp} ${label.padEnd(20)} x[${m.left}..${m.right}]/${m.vw} y[${m.top}..${m.bottom}]/${m.vh}`);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
}

(async () => {
  const b = await chromium.launch();
  for (const vp of [{ n: "390x844", w: 390, h: 844 }, { n: "1440x900", w: 1440, h: 900 }]) {
    const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    const r = await page.request.post(`${BASE}/api/auth`, { data: { email: EMAIL, password: PASSWORD } });
    if (!r.ok()) throw new Error(`sign-in ${r.status()}`);
    const projects = (await (await page.request.get(`${BASE}/api/projects`)).json()) as { slug: string; id: string; taskCount: number }[];
    const busiest = [...projects].sort((a, c) => c.taskCount - a.taskCount)[0];
    const tasks = busiest ? ((await (await page.request.get(`${BASE}/api/tasks?projectId=${busiest.id}`)).json()) as { id: string; parentId: string | null }[]) : [];
    const task = tasks.find((t) => !t.parentId);

    await page.goto(`${BASE}/`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1200);

    await probe(page, vp.n, "give a task sheet", async (p) => { await p.getByRole("button", { name: "Give a task" }).first().click({ timeout: 5000 }).catch(() => {}); }, '[role="dialog"]');
    await probe(page, vp.n, "profile menu", async (p) => { await p.getByRole("button", { name: "Your menu" }).first().click({ timeout: 5000 }).catch(() => {}); }, '[role="menu"]');
    await probe(page, vp.n, "help sheet", async (p) => {
      await p.getByRole("button", { name: "Your menu" }).first().click({ timeout: 5000 }).catch(() => {});
      await p.getByRole("menuitem", { name: "How Orbit works" }).first().click({ timeout: 5000 }).catch(() => {});
    }, '[role="dialog"]');
    await probe(page, vp.n, "search palette", async (p) => { await p.keyboard.press("Control+k"); }, "[cmdk-root]");
    if (busiest && task) {
      await probe(page, vp.n, "task drawer", async (p) => {
        await p.goto(`${BASE}/project/${busiest.slug}?task=${task.id}`);
        await p.waitForLoadState("networkidle").catch(() => {});
        await p.waitForTimeout(1200);
      }, '[role="dialog"][aria-label="Task"]');
    }
    await ctx.close();
  }
  await b.close();
  console.log(fail === 0 ? "\nall overlays inside the viewport" : `\n${fail} FAILED`);
  if (fail) process.exitCode = 1;
})();
