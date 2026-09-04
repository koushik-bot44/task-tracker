import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";
import { istDayKey } from "../lib/timezone";
import { DEFAULT_SEGMENTS } from "../lib/routine";

const BASE = "http://localhost:3000";
const OUT = "records/evidence/phase35";
const PREFIX = "p35v-";
const prisma = new PrismaClient();
const today = istDayKey(new Date());
const dkey = (k: string) => new Date(`${k}T00:00:00.000Z`);
const addDays = (k: string, n: number) => { const d = dkey(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekStart = (k: string) => { const d = dkey(k); const dow = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1)); return d.toISOString().slice(0, 10); };

async function teardown() {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

async function seedGrid(personId: string) {
  const mon = weekStart(today);
  const prevMon = addDays(mon, -7);
  const marks = ["MET", "MET", "MISSED", "MET", "NA", "MET", "MET"] as const;
  let segKey = generateKeyBetween(null, null);
  let first = true;
  for (const seg of DEFAULT_SEGMENTS) {
    const segment = await prisma.habitSegment.create({ data: { personId, name: seg.name, orderKey: segKey } });
    let habitKey = generateKeyBetween(null, null);
    for (const h of seg.habits) {
      const habit = await prisma.habit.create({ data: { segmentId: segment.id, name: h.name, targetPerWeek: h.targetPerWeek, orderKey: habitKey } });
      // Seed a plausible spread of marks for the current + previous week.
      for (let i = 0; i < 7; i++) {
        if (Math.random() > 0.25) await prisma.habitMark.create({ data: { habitId: habit.id, date: dkey(addDays(mon, i)), value: marks[(i + h.name.length) % 7] } });
        if (Math.random() > 0.4) await prisma.habitMark.create({ data: { habitId: habit.id, date: dkey(addDays(prevMon, i)), value: marks[(i + 2) % 7] } });
      }
      habitKey = generateKeyBetween(habitKey, null);
      first = false;
    }
    segKey = generateKeyBetween(segKey, null);
  }
  void first;
  // Non-negotiables
  let nnKey = generateKeyBetween(null, null);
  for (const name of ["No screens past bedtime", "No skipping meals"]) {
    const nn = await prisma.nonNegotiable.create({ data: { personId, name, orderKey: nnKey } });
    if (name.includes("screens")) await prisma.nonNegotiableMark.create({ data: { nonNegotiableId: nn.id, date: dkey(addDays(mon, 2)), done: true } });
    nnKey = generateKeyBetween(nnKey, null);
  }
  // Weight — a gentle downward trend over three weeks
  const w = [43.8, 43.6, 43.9, 43.4, 43.1, 43.2, 42.8, 42.6];
  for (let i = 0; i < w.length; i++) await prisma.weightEntry.create({ data: { personId, date: dkey(addDays(today, -(w.length - 1 - i) * 2)), weightKg: w[i] } });
  // Tasks the person checks off
  await prisma.routineTask.create({ data: { personId, title: "Finish homework", dueDate: dkey(today), done: true, doneAt: new Date() } });
  await prisma.routineTask.create({ data: { personId, title: "Pack school bag", dueDate: dkey(today) } });
  await prisma.routineTask.create({ data: { personId, title: "Read for 20 minutes", dueDate: null } });
}

async function main() {
  await teardown();
  await mkdir(OUT, { recursive: true });
  const pw = "vizpass123";
  const mgr = await prisma.user.create({ data: { email: `${PREFIX}mgr@orbit.local`, name: "P35 Mgr", role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword(pw) } });
  const emptyMgr = await prisma.user.create({ data: { email: `${PREFIX}empty@orbit.local`, name: "P35 Empty", role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword(pw) } });
  const personPw = "personpass123";
  const personUser = await prisma.user.create({ data: { email: `${PREFIX}person@orbit.local`, name: "Aarav", role: "PERSON", status: "ACTIVE", passwordHash: await hashPassword(personPw) } });
  const person = await prisma.person.create({ data: { managerId: mgr.id, userId: personUser.id, name: "Aarav" } });
  await seedGrid(person.id);

  const browser = await chromium.launch();
  const cookieFor = async (email: string, password: string) => {
    const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    return (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");
  };
  const shoot = async (email: string, password: string, path: string, name: string, w: number, waitText: string, action?: (page: Page) => Promise<void>) => {
    const value = await cookieFor(email, password);
    const ctx = await browser.newContext({ viewport: { width: w, height: 950 }, deviceScaleFactor: 2 });
    await ctx.addCookies([{ name: "orbit_session", value, domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.getByText(waitText).first().waitFor({ state: "visible", timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(700);
    if (action) await action(page);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    await ctx.close();
  };

  await shoot(mgr.email, pw, "/routine", "p35-mgr-1440", 1440, "Weekly habits");
  await shoot(mgr.email, pw, "/routine", "p35-mgr-390", 390, "Weekly habits");
  await shoot(emptyMgr.email, pw, "/routine", "p35-empty-1440", 1440, "Add a person");
  await shoot(emptyMgr.email, pw, "/routine", "p35-empty-390", 390, "Add a person");
  await shoot(personUser.email, personPw, "/person", "p35-person-390", 390, "Pack school bag");
  await shoot(personUser.email, personPw, "/person", "p35-person-1440", 1440, "Pack school bag");
  // Manage-person form (rename / change login / reset password).
  await shoot(mgr.email, pw, "/routine", "p35-person-manage-1440", 1440, "Weekly habits", async (page) => {
    await page.getByRole("button", { name: "Edit person" }).click();
    await page.waitForTimeout(500);
  });
  // Edit mode of the grid (targets + rename/remove/add).
  await shoot(mgr.email, pw, "/routine", "p35-grid-edit-1440", 1440, "Weekly habits", async (page) => {
    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    await page.waitForTimeout(500);
  });
  // History: navigate to the previous week (wait for the refetch to settle).
  await shoot(mgr.email, pw, "/routine", "p35-history-1440", 1440, "Weekly habits", async (page) => {
    await page.getByRole("button", { name: "Previous week" }).click();
    await page.getByRole("button", { name: "Jump to this week" }).waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    await page.getByText("Loading…").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(700);
  });

  await browser.close();
  await teardown();
  console.log("shots written + torn down");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
