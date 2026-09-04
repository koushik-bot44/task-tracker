/**
 * Tooltip edge proof (phase 5 batch 2, step B).
 *
 * Owner reported the dark tooltip clipping off the right edge and covering
 * the Tree|Board control. This opens tooltips deliberately at the worst
 * anchors — the far-right chips of a row, and rows near the top — then asks
 * the browser where the bubble actually landed.
 *
 * Fails if any bubble crosses a viewport edge or overlaps an element marked
 * [data-tooltip-obstacle].
 *
 * Read-only: hover only, no clicks that mutate.
 */
import { chromium, type Page } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
/* Accept either credential pair: SCREEN_* comes from the screenshot-accounts
   rig, SHOT_MANAGER_* from the role fixture. Close-out strips both, so a
   re-run after cleanup used to die on a module-load stack trace rather than
   saying which variable it wanted. */
const EMAIL = process.env.SCREEN_EMAIL ?? process.env.SHOT_MANAGER_EMAIL;
const PASSWORD = process.env.SCREEN_PASSWORD ?? process.env.SHOT_MANAGER_PASSWORD;
const OUT = path.join("screenshots", "tooltips");

const SIZES = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];

let fail = 0;

type Probe = { label: string; selector: string; nth?: number };

async function probe(page: Page, size: string, p: Probe) {
  const target = page.locator(p.selector).nth(p.nth ?? 0);
  if ((await target.count()) === 0) {
    console.log(`SKIP  ${size} ${p.label.padEnd(30)} no such anchor on this screen`);
    return;
  }
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.hover({ force: true }).catch(() => {});
  await page.waitForTimeout(650);

  const result = await page.evaluate((sel: string) => {
    const tip = document.querySelector('[role="tooltip"]');
    if (!tip) return null;
    const r = tip.getBoundingClientRect();
    // Mirror the component's rule: a container of the anchor is not an
    // obstacle to its own child's tooltip.
    const anchor = document.querySelector(sel);
    const obstacles = Array.from(
      document.querySelectorAll("[data-tooltip-obstacle]"),
    )
      .filter((el) => !(anchor && el.contains(anchor)))
      .map((el) => el.getBoundingClientRect());
    let covered = 0;
    for (const o of obstacles) {
      const w = Math.min(r.right, o.right) - Math.max(r.left, o.left);
      const h = Math.min(r.bottom, o.bottom) - Math.max(r.top, o.top);
      if (w > 0 && h > 0) covered += w * h;
    }
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      vw: window.innerWidth,
      vh: window.innerHeight,
      covered,
      text: (tip.textContent ?? "").slice(0, 44),
    };
  }, p.selector);

  if (!result) {
    console.log(`SKIP  ${size} ${p.label.padEnd(30)} tooltip did not open`);
    return;
  }

  const onScreen =
    result.left >= 0 &&
    result.top >= 0 &&
    result.right <= result.vw &&
    result.bottom <= result.vh;
  const clear = result.covered === 0;
  const ok = onScreen && clear;
  if (!ok) fail++;

  console.log(
    `${ok ? "PASS" : "FAIL"}  ${size} ${p.label.padEnd(30)} ` +
      `x[${result.left.toFixed(0)}..${result.right.toFixed(0)}]/${result.vw} ` +
      `y[${result.top.toFixed(0)}..${result.bottom.toFixed(0)}]/${result.vh} ` +
      `${onScreen ? "on-screen" : "OFF-SCREEN"} ${clear ? "clear" : `COVERS ${result.covered.toFixed(0)}px²`}`,
  );

  await page.screenshot({
    path: path.join(OUT, `${p.label.replace(/[^a-z0-9]+/gi, "-")}--${size}.png`),
  });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
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
  const projects = await (await authPage.request.get(`${BASE}/api/projects`)).json();
  const slug = [...projects].sort((a, b) => b.taskCount - a.taskCount)[0]?.slug;
  await auth.close();

  for (const size of SIZES) {
    const ctx = await browser.newContext({
      storageState,
      viewport: { width: size.width, height: size.height },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/t/${slug}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1400);

    /* The gate cluster is the right-most chip on a row, so it is the anchor
       that used to hang off the edge. The first row is the one closest to the
       header, so it is where a top-placed bubble used to cover the switcher. */
    await probe(page, size.name, {
      label: "gate cluster first row",
      selector: '[aria-label*="gates passed"]',
      nth: 0,
    });
    await probe(page, size.name, {
      label: "gate cluster far right",
      selector: '[aria-label*="gates passed"]',
      nth: 1,
    });
    await probe(page, size.name, {
      label: "date pill",
      selector: '[data-task-id] span[title^="Est. completion"]',
      nth: 0,
    });
    await probe(page, size.name, {
      label: "no-date pill",
      selector: '[data-task-id] [data-pill="no-date"]',
      nth: 0,
    });
    await probe(page, size.name, {
      label: "zoom bullet",
      selector: '[data-task-id] button[aria-label^="Zoom into"]',
      nth: 0,
    });
    await probe(page, size.name, {
      label: "help button",
      selector: 'button[aria-label="Help"]',
      nth: 0,
    });

    await ctx.close();
  }

  await browser.close();
  console.log(fail === 0 ? "\nall tooltip probes passed" : `\n${fail} FAILED`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
