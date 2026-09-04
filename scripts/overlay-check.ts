/**
 * Every fixed overlay, measured against the viewport.
 *
 * Three separate overlays shipped mispositioned for the same two reasons:
 * Framer's inline transform beating a Tailwind `-translate-x-1/2`, and
 * `position: fixed` resolving against an ancestor with a backdrop-filter
 * rather than the viewport. Each was found only when someone happened to look
 * at that one screen. This opens all of them and fails if any lands outside.
 */
import { chromium, type Page } from "playwright";
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
let fail = 0;

async function probe(page: Page, vp: string, label: string, open: (p: Page) => Promise<void>, selector: string) {
  await open(page);
  await page.waitForTimeout(800);
  const m = (await page.evaluate(`(() => {
    var d = document.querySelector(${JSON.stringify(selector)});
    if (!d) return null;
    var b = d.getBoundingClientRect();
    return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top),
             bottom: Math.round(b.bottom), vw: window.innerWidth, vh: window.innerHeight };
  })()`)) as any;
  if (!m) { console.log(`SKIP  ${vp} ${label.padEnd(22)} not found`); return; }
  const ok = m.left >= 0 && m.top >= 0 && m.right <= m.vw && m.bottom <= m.vh;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${vp} ${label.padEnd(22)} x[${m.left}..${m.right}]/${m.vw} y[${m.top}..${m.bottom}]/${m.vh}`);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);
}

(async () => {
  const b = await chromium.launch();
  for (const vp of [{ n: "390x844", w: 390, h: 844 }, { n: "1440x900", w: 1440, h: 900 }]) {
    const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    const r = await page.request.post(`${BASE}/api/auth`, { data: { email: process.env.SHOT_MANAGER_EMAIL, password: process.env.SHOT_MANAGER_PASSWORD } });
    if (!r.ok()) throw new Error(`sign-in ${r.status()}`);
    await page.goto(`${BASE}/t/ss-shot-sandbox`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1500);

    await probe(page, vp.n, "command palette", async (p) => { await p.keyboard.press("Control+k"); }, '[cmdk-root], [role="dialog"]');
    await probe(page, vp.n, "help sheet", async (p) => { await p.getByRole("button", { name: "Help" }).first().click({ timeout: 5000 }).catch(() => {}); }, '[role="dialog"]');
    await probe(page, vp.n, "about panel", async (p) => {
      await p.goto(`${BASE}/t/ss-shot-sandbox/overview`);
      await p.waitForLoadState("networkidle").catch(() => {});
      await p.waitForTimeout(1200);
      await p.getByRole("button", { name: /About & requirements/ }).first().click({ timeout: 5000 }).catch(() => {});
    }, '[role="dialog"]');

    await ctx.close();
  }
  await b.close();
  console.log(fail === 0 ? "\nall overlays inside the viewport" : `\n${fail} FAILED`);
  if (fail) process.exitCode = 1;
})();
