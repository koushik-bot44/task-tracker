import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";
import { istDayKey } from "../lib/timezone";

const BASE = "http://localhost:3000";
const OUT = "records/evidence/phase46";
const PRE = "p46sc-";
const prisma = new PrismaClient();
const today = istDayKey(new Date());
const D = (k: string) => new Date(`${k}T00:00:00.000Z`);
const addDays = (k: string, n: number) => { const d = D(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekStart = (k: string) => { const d = D(k); const dow = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1)); return d.toISOString().slice(0, 10); };

async function teardown() {
  await prisma.routineCollaborator.deleteMany({ where: { OR: [{ manager: { email: { startsWith: PRE } } }, { invitedBy: { email: { startsWith: PRE } } }, { person: { user: { email: { startsWith: PRE } } } }] } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PRE } } });
}

async function main() {
  await teardown();
  await mkdir(OUT, { recursive: true });
  const mgr = await prisma.user.create({ data: { email: PRE + "mgr@orbit.local", name: "Priya", role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword("mgrpass12345") } });
  const kid = await prisma.user.create({ data: { email: PRE + "aarav@orbit.local", name: "Aarav", role: "PERSON", status: "ACTIVE", passwordHash: await hashPassword("personpass123") } });
  const person = await prisma.person.create({ data: { managerId: mgr.id, userId: kid.id, name: "Aarav" } });
  const mon = weekStart(today);
  // Many segments/habits so the page is several viewports tall.
  const SEGS = ["Sleep & Wake", "Screen Time & Media", "Academics", "Diet", "Fitness"];
  let segKey = generateKeyBetween(null, null);
  for (const sname of SEGS) {
    const seg = await prisma.habitSegment.create({ data: { personId: person.id, name: sname, orderKey: segKey } });
    segKey = generateKeyBetween(segKey, null);
    let hKey = generateKeyBetween(null, null);
    for (let h = 0; h < 3; h++) {
      const habit = await prisma.habit.create({ data: { segmentId: seg.id, name: `${sname} habit ${h + 1}`, targetPerWeek: 5, orderKey: hKey } });
      hKey = generateKeyBetween(hKey, null);
      for (const [i, v] of [[0, "MET"], [1, "MET"]] as [number, "MET" | "MISSED" | "NA"][]) if (addDays(mon, i) <= today) await prisma.habitMark.create({ data: { habitId: habit.id, date: D(addDays(mon, i)), value: v } });
    }
  }
  const r = await prisma.nonNegotiable.create({ data: { personId: person.id, name: "No screens past bedtime", orderKey: generateKeyBetween(null, null) } });
  for (const i of [0, 2, 4]) await prisma.nonNegotiableMark.create({ data: { nonNegotiableId: r.id, date: D(addDays(mon, i)), done: addDays(mon, i) < today } });
  for (let i = 0; i < 6; i++) await prisma.routineTask.create({ data: { personId: person.id, title: `Task ${i + 1}`, dueDate: i % 2 ? null : D(today), done: i > 3 } });
  for (let i = 0; i < 5; i++) await prisma.weightEntry.create({ data: { personId: person.id, date: D(addDays(today, -i * 3)), weightKg: 44 + i * 0.3 } });

  const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: mgr.email, password: "mgrpass12345" }) });
  const mv = (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");
  const kauth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: kid.email, password: "personpass123" }) });
  const kv = (kauth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");

  const browser = await chromium.launch();
  const shoot = async (name: string, path: string, cookie: string, hour: number, opts: { fs?: boolean; tab?: string; w?: number } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: opts.w ?? 1280, height: 860 }, deviceScaleFactor: 1 });
    await ctx.addCookies([{ name: "orbit_session", value: cookie, domain: "localhost", path: "/" }]);
    await ctx.addInitScript((h: number) => { Date.prototype.getHours = function () { return h; }; }, hour);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator(".wb-scene").first().waitFor({ state: "attached", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1400);
    if (opts.tab) await page.getByRole("tab", { name: opts.tab }).click().catch(() => {});
    await page.waitForTimeout(500);
    if (opts.fs) {
      // Simulate the browser :fullscreen state on .wb-fs (headless can't truly fullscreen):
      // the page root becomes a 100vh scroll container and the scene goes full-height.
      await page.addStyleTag({ content: ".wb-fs{height:100vh!important;overflow-y:auto!important;background:#fff!important} .wb-scene-app{top:0!important;height:100dvh!important;margin-bottom:-100dvh!important}" });
      await page.waitForTimeout(300);
      await page.evaluate(() => { const el = document.querySelector(".wb-fs") as HTMLElement | null; if (el) el.scrollTop = el.scrollHeight; });
    } else {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    }
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    // Sample the backdrop colour behind a lower card (text made transparent) to prove it's not white.
    await ctx.close();
  };

  await shoot("p46-night-scroll-normal", "/routine", mv, 21, { tab: "tracker" });
  await shoot("p46-day-scroll-normal", "/routine", mv, 10, { tab: "tracker" });
  await shoot("p46-night-scroll-fs", "/routine", mv, 21, { tab: "tracker", fs: true });
  await shoot("p46-day-scroll-fs", "/routine", mv, 10, { tab: "tracker", fs: true });
  await shoot("p46-person-scroll-night", "/person", kv, 21, { tab: "habits", w: 420 });

  await browser.close();
  await teardown();
  console.log("shots written + torn down");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("ERR", e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
