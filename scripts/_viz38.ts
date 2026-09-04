import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";
import { istDayKey } from "../lib/timezone";
import { DEFAULT_SEGMENTS } from "../lib/routine";

const BASE = "http://localhost:3000";
const OUT = "records/evidence/phase38";
const PREFIX = "p38v-";
const prisma = new PrismaClient();
const today = istDayKey(new Date());
const D = (k: string) => new Date(`${k}T00:00:00.000Z`);
const addDays = (k: string, n: number) => { const d = D(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekStart = (k: string) => { const d = D(k); const dow = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1)); return d.toISOString().slice(0, 10); };
async function teardown() { await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } }); }

async function main() {
  await teardown();
  await mkdir(OUT, { recursive: true });
  const pw = "vizpass123", personPw = "personpass123";
  const mgr = await prisma.user.create({ data: { email: `${PREFIX}mgr@orbit.local`, name: "P38 Mgr", role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword(pw) } });
  const personUser = await prisma.user.create({ data: { email: `${PREFIX}person@orbit.local`, name: "Aarav", role: "PERSON", status: "ACTIVE", passwordHash: await hashPassword(personPw) } });
  const person = await prisma.person.create({ data: { managerId: mgr.id, userId: personUser.id, name: "Aarav" } });

  const mon = weekStart(today);
  const prevMon = addDays(mon, -7);
  // Per-segment MET counts THIS week (varied so the calm colour tiers show): high, mid, low, high.
  const thisMet = [6, 4, 2, 5]; // days met on the FIRST habit of each segment
  const prevMet = [3, 5, 6, 2]; // different amounts last week
  let segKey = generateKeyBetween(null, null);
  DEFAULT_SEGMENTS.forEach(() => {});
  let si = 0;
  for (const seg of DEFAULT_SEGMENTS) {
    const segment = await prisma.habitSegment.create({ data: { personId: person.id, name: seg.name, orderKey: segKey } });
    let hk = generateKeyBetween(null, null);
    let hi = 0;
    for (const h of seg.habits) {
      const habit = await prisma.habit.create({ data: { segmentId: segment.id, name: h.name, targetPerWeek: h.targetPerWeek, orderKey: hk } });
      // First habit carries the segment's headline count; other habits get a light spread.
      const cur = hi === 0 ? thisMet[si] : Math.max(0, thisMet[si] - 2);
      const prv = hi === 0 ? prevMet[si] : Math.max(0, prevMet[si] - 1);
      for (let d = 0; d < 7; d++) {
        if (d < cur) await prisma.habitMark.create({ data: { habitId: habit.id, date: D(addDays(mon, d)), value: "MET" } });
        else if (d === cur && d < 7) await prisma.habitMark.create({ data: { habitId: habit.id, date: D(addDays(mon, d)), value: "MISSED" } });
        if (d < prv) await prisma.habitMark.create({ data: { habitId: habit.id, date: D(addDays(prevMon, d)), value: "MET" } });
      }
      hk = generateKeyBetween(hk, null); hi++;
    }
    segKey = generateKeyBetween(segKey, null); si++;
  }
  // Non-negotiables — one crossed twice THIS week (violations 2), none last week.
  let nnKey = generateKeyBetween(null, null);
  const nn1 = await prisma.nonNegotiable.create({ data: { personId: person.id, name: "No screens past bedtime", orderKey: nnKey } });
  nnKey = generateKeyBetween(nnKey, null);
  await prisma.nonNegotiable.create({ data: { personId: person.id, name: "No skipping meals", orderKey: nnKey } });
  await prisma.nonNegotiableMark.create({ data: { nonNegotiableId: nn1.id, date: D(addDays(mon, 1)), done: true } });
  await prisma.nonNegotiableMark.create({ data: { nonNegotiableId: nn1.id, date: D(addDays(mon, 4)), done: true } });
  for (let i = 0; i < 4; i++) await prisma.weightEntry.create({ data: { personId: person.id, date: D(addDays(today, -i * 3)), weightKg: 44 + i * 0.2 } });
  await prisma.routineTask.create({ data: { personId: person.id, title: "Pack school bag", dueDate: D(today) } });

  const browser = await chromium.launch();
  const cookieFor = async (email: string, password: string) => {
    const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    return (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");
  };
  const shoot = async (name: string, w: number, action?: (page: Page) => Promise<void>) => {
    const value = await cookieFor(mgr.email, pw);
    const ctx = await browser.newContext({ viewport: { width: w, height: 950 }, deviceScaleFactor: 1.5 });
    await ctx.addCookies([{ name: "orbit_session", value, domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/routine`, { waitUntil: "domcontentloaded" });
    await page.getByText("Weekly summary").waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
    if (action) await action(page);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    await ctx.close();
  };

  await shoot("p38-summary-1440", 1440);
  await shoot("p38-summary-390", 390);
  // Past week — click Previous week, wait for the refetch, screenshot (different numbers).
  await shoot("p38-summary-prev-1440", 1440, async (page) => {
    await page.getByRole("button", { name: "Previous week" }).click();
    await page.getByRole("button", { name: "Jump to this week" }).waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(900);
  });
  // Tracker view — click the Tracker tab.
  await shoot("p38-tracker-1440", 1440, async (page) => {
    await page.getByRole("tab", { name: "tracker" }).click();
    await page.getByText("Weekly habits").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(700);
  });

  await browser.close();
  await teardown();
  console.log("shots written + torn down");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
