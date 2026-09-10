/* "Install the app" on the account page (2026-09-10) — test plan section 4.
 *   npx tsx --env-file=.env.local scripts/check-install-section.ts   (dev server up)
 *
 * 1. Asks Chrome itself whether Orbit is installable — the same check DevTools
 *    shows under Application → Manifest (Page.getInstallabilityErrors) — in a
 *    real, non-private browser profile.
 * 2. Opens the account page as each kind of browser and photographs the section:
 *    Chrome/Edge on a computer (with and without the browser's offer), Android,
 *    iPhone Safari, Mac Safari, Firefox, and already installed.
 *    Only Chromium is available here, so the other browsers are the same engine
 *    presenting their user agent; the section chooses its words from the user
 *    agent, which is what is being tested. The browser's install offer and
 *    "installed" are simulated with the same events a real browser sends.
 * Evidence: records/evidence/accounts-notify/4-install/
 */
import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const DIR = "records/evidence/accounts-notify/4-install";
const lines: string[] = [];
let fail = 0;

function record(name: string, ok: boolean, detail = "") {
  if (!ok) fail++;
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`;
  lines.push(line);
  console.log(line);
}

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  firefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:129.0) Gecko/20100101 Firefox/129.0",
};

/** The browser's install offer, sent the way Chrome sends it, a moment after load. */
const OFFER = `
window.addEventListener("load", function () {
  setTimeout(function () {
    var e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = function () { window.__promptCalls = (window.__promptCalls || 0) + 1; return Promise.resolve(); };
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e);
  }, 400);
});`;
/** The bottom pop-up already closed by this person, earlier. */
const POPUP_CLOSED = `try { localStorage.setItem("orbit-install-dismissed", "1"); } catch (e) {}`;
/** Running as the installed app. */
const STANDALONE = `
(function () {
  var original = window.matchMedia.bind(window);
  window.matchMedia = function (q) {
    if (String(q).indexOf("display-mode: standalone") !== -1) {
      return { matches: true, media: q, onchange: null, addEventListener: function () {}, removeEventListener: function () {}, addListener: function () {}, removeListener: function () {}, dispatchEvent: function () { return false; } };
    }
    return original(q);
  };
})();`;
const PERMISSION = (p: string) => `try { Object.defineProperty(Notification, "permission", { get: function () { return "${p}"; }, configurable: true }); } catch (e) {}`;

async function signInAndOpen(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', "founder@orbit.local");
  await page.fill('input[type="password"]', "orbit123");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 });
  await page.goto(`${BASE}/settings/account`);
  await page.waitForLoadState("load");
  await page.locator('section[aria-label="Install the app"]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  return page;
}

async function main() {
  /* 1. Chrome's own installability check, in a real (non-private) profile. */
  const profile = mkdtempSync(join(tmpdir(), "orbit-install-"));
  const real = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 1280, height: 800 } });
  const page = real.pages()[0] ?? (await real.newPage());
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("load");
  const swReady = await page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 15000))]));
  await page.waitForTimeout(1500);
  const cdp = await real.newCDPSession(page);
  const install = (await cdp.send("Page.getInstallabilityErrors")) as { installabilityErrors: { errorId: string }[] };
  const manifest = (await cdp.send("Page.getAppManifest")) as { url: string; errors: { message: string; critical: number }[] };
  record("the service worker registers", swReady === true);
  record("the manifest loads without errors", manifest.errors.length === 0, `${manifest.url} · ${manifest.errors.map((e) => e.message).join("; ") || "no errors"}`);
  record("Chrome reports Orbit installable", install.installabilityErrors.length === 0, install.installabilityErrors.map((e) => e.errorId).join(", ") || "no installability errors");
  await real.close();

  const browser = await chromium.launch();
  const shot = async (p: Page, name: string) => {
    await p.locator('section[aria-label="Install the app"]').screenshot({ path: `${DIR}/${name}.png` });
    return `${name}.png`;
  };
  const sectionText = (p: Page) => p.locator('section[aria-label="Install the app"]').innerText();

  /* 2a. Chrome/Edge on a computer, no offer from the browser (yet). */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await signInAndOpen(ctx);
    const t = await sectionText(p);
    record("Chrome/Edge, no offer: points to the address bar and the browser menu", /address bar/.test(t) && /Install Orbit/.test(t), await shot(p, "desktop-chrome-no-offer"));
    await ctx.close();
  }

  /* 2b. Chrome/Edge on a computer: the offer arrives AFTER the bottom pop-up was
     closed. The account page must still be able to use it. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(POPUP_CLOSED);
    await ctx.addInitScript(OFFER);
    const p = await signInAndOpen(ctx);
    await p.waitForTimeout(800);
    const button = p.getByRole("button", { name: "Install Orbit" });
    const shown = await button.isVisible();
    record("Chrome/Edge, pop-up closed earlier: the Install Orbit button still appears", shown, await shot(p, "desktop-chrome-offer-after-popup-closed"));
    if (shown) {
      await button.click();
      await p.waitForTimeout(700);
      const calls = await p.evaluate(() => (window as unknown as { __promptCalls?: number }).__promptCalls ?? 0);
      record("…and pressing it opens the browser's own install prompt, once", calls === 1, `prompt() called ${calls}×`);
      record("…after which the offer is spent and the button goes", !(await button.isVisible()));
      await p.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
      await p.waitForTimeout(600);
      record("…and when the browser says it installed, the section says Installed ✓", /Installed ✓/.test(await sectionText(p)), await shot(p, "desktop-chrome-just-installed"));
    }
    await ctx.close();
  }

  /* 2c. Android Chrome, with and without the offer. */
  for (const withOffer of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA.android, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    if (withOffer) await ctx.addInitScript(OFFER);
    const p = await signInAndOpen(ctx);
    await p.waitForTimeout(800);
    const t = await sectionText(p);
    const ok = withOffer ? await p.getByRole("button", { name: "Install Orbit" }).isVisible() : /Add to Home screen/.test(t);
    record(`Android Chrome, ${withOffer ? "with the offer: Install Orbit button" : "no offer: menu → Install app / Add to Home screen"}`, ok, await shot(p, `android-${withOffer ? "offer" : "no-offer"}`));
    await ctx.close();
  }

  /* 2d. iPhone Safari. */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA.iphone, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await signInAndOpen(ctx);
    const t = await sectionText(p);
    record("iPhone Safari: Share → Add to Home Screen, step by step", /Share/.test(t) && /Add to Home Screen/.test(t) && /Open Orbit in Safari/.test(t), await shot(p, "iphone-safari"));
    record("…with the note that notifications need it on the Home Screen first", /notifications only work once Orbit is on your Home Screen/.test(t));
    await ctx.close();
  }

  /* 2e. Mac Safari and Firefox on a computer. */
  for (const [name, ua, want, label] of [
    ["mac-safari", UA.macSafari, /File → Add to Dock/, "Mac Safari: File → Add to Dock"],
    ["desktop-firefox", UA.firefox, /Firefox can.t install/, "Firefox: says it can't, suggests Chrome or Edge"],
  ] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: ua });
    const p = await signInAndOpen(ctx);
    const t = await sectionText(p);
    record(label, want.test(t) && (name !== "desktop-firefox" || (/Chrome/.test(t) && /Edge/.test(t))), await shot(p, name));
    await ctx.close();
  }

  /* 2f. Already installed: Installed ✓, and a way to turn notifications on. */
  for (const permission of ["default", "granted"]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await ctx.addInitScript(STANDALONE);
    await ctx.addInitScript(PERMISSION(permission));
    const p = await signInAndOpen(ctx);
    const t = await sectionText(p);
    if (permission === "default") {
      record("installed, notifications not on: Installed ✓ and a Turn on notifications button", /Installed ✓/.test(t) && (await p.getByRole("button", { name: "Turn on notifications" }).isVisible()), await shot(p, "installed-notifications-off"));
    } else {
      record("installed, notifications on: says so, no button", /Installed ✓/.test(t) && /Notifications are on/.test(t) && !(await p.getByRole("button", { name: "Turn on notifications" }).isVisible()), await shot(p, "installed-notifications-on"));
    }
    await ctx.close();
  }

  await browser.close();
  writeFileSync("records/evidence/accounts-notify/4-install.txt", lines.join("\n") + `\n\n${lines.length - fail} passed, ${fail} failed\n`);
  console.log(`\n${lines.length - fail} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
