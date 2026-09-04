/**
 * Are the elements in a row actually on one axis?
 *
 * The owner reported Focus rows where the checkbox, title, tool chip and date
 * pill "don't share one vertical baseline". Eyeballing a screenshot cannot
 * settle that to the pixel, so this asks the browser for each element's centre
 * and fails if they disagree by more than a pixel — and separately checks that
 * every row in a list is the same height.
 */
import { chromium } from "playwright";
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
let fail = 0;

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const r = await page.request.post(`${BASE}/api/auth`, {
    data: { email: process.env.SHOT_MANAGER_EMAIL, password: process.env.SHOT_MANAGER_PASSWORD },
  });
  if (!r.ok()) throw new Error(`sign-in ${r.status()}`);

  await page.goto(`${BASE}/focus`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1400);

  /* Passed as a STRING on purpose: tsx's transform injects a `__name` helper
     into named functions, and that helper does not exist inside the page, so
     an inlined arrow blows up with "__name is not defined". */
  const rows = (await page.evaluate(`
    (() => {
      var out = [];
      var sections = Array.prototype.slice.call(document.querySelectorAll("section"));
      for (var i = 0; i < sections.length; i++) {
        var section = sections[i];
        var h2 = section.querySelector("h2");
        var heading = h2 ? h2.textContent.trim().split(/\s{2,}/)[0] : "?";
        var lis = Array.prototype.slice.call(section.querySelectorAll("li"));
        for (var j = 0; j < lis.length; j++) {
          var li = lis[j];
          var box = li.getBoundingClientRect();
          var spans = Array.prototype.slice.call(li.querySelectorAll("span"));
          var check = li.querySelector('[role="checkbox"] span');
          var titleEl = li.querySelector("button:nth-of-type(2) > span:first-child");
          var pill = null, tool = null;
          for (var k = 0; k < spans.length; k++) {
            var cls = spans[k].className || "";
            var txt = (spans[k].textContent || "").trim();
            if (!pill && cls.indexOf("rounded-chip") >= 0 && txt.length > 0) pill = spans[k];
            if (!tool && cls.indexOf("text-micro") >= 0 && cls.indexOf("text-muted") >= 0 && spans[k].querySelector("span")) tool = spans[k];
          }
          var centres = {};
          var parts = [["checkbox", check], ["title", titleEl], ["tool", tool], ["pill", pill]];
          for (var m = 0; m < parts.length; m++) {
            var el = parts[m][1];
            if (!el) { centres[parts[m][0]] = NaN; continue; }
            var b = el.getBoundingClientRect();
            centres[parts[m][0]] = Math.round((b.top + b.bottom) / 2 * 10) / 10;
          }
          out.push({ section: heading, title: (titleEl ? titleEl.textContent : "").slice(0, 28), centres: centres, height: Math.round(box.height * 10) / 10 });
        }
      }
      return out;
    })()
  `)) as Array<{ section: string; title: string; centres: Record<string, number>; height: number }>;

  const heights = new Map<string, number[]>();
  for (const row of rows) {
    const vals = Object.entries(row.centres).filter(([, v]) => !Number.isNaN(v));
    const min = Math.min(...vals.map(([, v]) => v));
    const max = Math.max(...vals.map(([, v]) => v));
    const spread = Math.round((max - min) * 10) / 10;
    const ok = spread <= 1;
    if (!ok) fail++;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${row.section.padEnd(9)} ${row.title.padEnd(30)} ` +
        `spread ${String(spread).padStart(5)}px  ${vals.map(([k, v]) => `${k}=${v}`).join(" ")}`,
    );
    const list = heights.get(row.section) ?? [];
    list.push(row.height);
    heights.set(row.section, list);
  }

  console.log("");
  for (const [section, hs] of heights) {
    const uniq = [...new Set(hs)];
    const ok = uniq.length === 1;
    if (!ok) fail++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${section.padEnd(9)} row heights ${uniq.join(", ")}`);
  }

  await browser.close();
  console.log(fail === 0 ? "\nall rows on one axis, equal heights" : `\n${fail} FAILED`);
  if (fail) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exit(1); });
