import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";
import { istDayKey } from "../lib/timezone";
import { DEFAULT_SEGMENTS } from "../lib/routine";

const BASE = "http://localhost:3000";
const OUT = "records/evidence/phase37";
const PREFIX = "p37v-";
const prisma = new PrismaClient();
const today = istDayKey(new Date());
const D = (k: string) => new Date(`${k}T00:00:00.000Z`);
const addDays = (k: string, n: number) => { const d = D(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekStart = (k: string) => { const d = D(k); const dow = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1)); return d.toISOString().slice(0, 10); };
const todayInitial = D(today).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }).slice(0, 1);

async function teardown() { await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } }); }

async function main() {
  await teardown();
  await mkdir(OUT, { recursive: true });
  const pw = "vizpass123", personPw = "personpass123";
  const mgr = await prisma.user.create({ data: { email: `${PREFIX}mgr@orbit.local`, name: "P37 Mgr", role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword(pw) } });
  const personUser = await prisma.user.create({ data: { email: `${PREFIX}person@orbit.local`, name: "Aarav", role: "PERSON", status: "ACTIVE", passwordHash: await hashPassword(personPw) } });
  const person = await prisma.person.create({ data: { managerId: mgr.id, userId: personUser.id, name: "Aarav" } });

  // Seed grid (3 segments) + a spread of existing marks (days up to today).
  const mon = weekStart(today);
  const vals = ["MET", "MET", "MISSED", "MET", "NA", "MET", "MET"] as const;
  let segKey = generateKeyBetween(null, null);
  let firstHabitId = "";
  for (const seg of DEFAULT_SEGMENTS.slice(0, 3)) {
    const segment = await prisma.habitSegment.create({ data: { personId: person.id, name: seg.name, orderKey: segKey } });
    let hk = generateKeyBetween(null, null);
    for (const h of seg.habits) {
      const habit = await prisma.habit.create({ data: { segmentId: segment.id, name: h.name, targetPerWeek: h.targetPerWeek, orderKey: hk } });
      if (!firstHabitId) firstHabitId = habit.id;
      for (let i = 0; i < 7; i++) {
        const dk = addDays(mon, i);
        if (dk < today && Math.random() > 0.3) await prisma.habitMark.create({ data: { habitId: habit.id, date: D(dk), value: vals[(i + h.name.length) % 7] } });
      }
      hk = generateKeyBetween(hk, null);
    }
    segKey = generateKeyBetween(segKey, null);
  }
  // Manager-only sections (person must NOT see these).
  let nnKey = generateKeyBetween(null, null);
  for (const name of ["No screens past bedtime", "No skipping meals"]) { await prisma.nonNegotiable.create({ data: { personId: person.id, name, orderKey: nnKey } }); nnKey = generateKeyBetween(nnKey, null); }
  for (let i = 0; i < 5; i++) await prisma.weightEntry.create({ data: { personId: person.id, date: D(addDays(today, -i * 3)), weightKg: 44 + i * 0.3 } });
  await prisma.routineTask.create({ data: { personId: person.id, title: "Pack school bag", dueDate: D(today) } });
  await prisma.routineTask.create({ data: { personId: person.id, title: "Read for 20 minutes", dueDate: null } });

  const browser = await chromium.launch();
  const cookieFor = async (email: string, password: string) => {
    const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    return (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");
  };
  const open = async (email: string, password: string, path: string, w: number) => {
    const value = await cookieFor(email, password);
    const ctx = await browser.newContext({ viewport: { width: w, height: 950 }, deviceScaleFactor: 2 });
    await ctx.addCookies([{ name: "orbit_session", value, domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    return { ctx, page };
  };

  // 1. Person on /kid: LIVE-tap today's cell of the first habit (empty -> MET), then screenshot.
  for (const w of [390, 1440]) {
    const { ctx, page } = await open(personUser.email, personPw, "/person", w);
    await page.getByText("This week's habits").waitFor({ state: "visible", timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(700);
    if (w === 390) {
      // demonstrate the tap on the very first run
      const cell = page.getByRole("button", { name: new RegExp(`In bed by target time, ${todayInitial} —.*tap to change`) }).first();
      await cell.click().catch(() => {});
      await page.waitForTimeout(600);
    }
    await page.screenshot({ path: `${OUT}/p37-kid-${w}.png`, fullPage: true });
    await ctx.close();
  }

  // 2. Manager /routine: shows the grid reflecting the person's marks + score + non-neg + weight.
  {
    const { ctx, page } = await open(mgr.email, pw, "/routine", 1440);
    await page.getByText("Weekly habits").waitFor({ state: "visible", timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/p37-manager-grid-1440.png`, fullPage: true });
    await ctx.close();
  }

  await browser.close();
  await teardown();
  console.log("shots written + torn down; firstHabit:", firstHabitId);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
