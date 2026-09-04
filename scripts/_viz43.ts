import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";
import { istDayKey } from "../lib/timezone";

const BASE = "http://localhost:3000";
const OUT = "records/evidence/phase43";
const PREFIX = "p43v-";
const prisma = new PrismaClient();
const today = istDayKey(new Date());
const D = (k: string) => new Date(`${k}T00:00:00.000Z`);
const weekStart = (k: string) => { const d = D(k); const dow = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1)); return d.toISOString().slice(0, 10); };
const addDays = (k: string, n: number) => { const d = D(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function teardown() { await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } }); }

async function main() {
  await teardown();
  await mkdir(OUT, { recursive: true });
  const owner = await prisma.user.create({ data: { email: `${PREFIX}owner@orbit.local`, name: "OWNER", role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword("vizpass123") } });
  const kidUser = await prisma.user.create({ data: { email: `${PREFIX}aarav@orbit.local`, name: "Aarav", role: "PERSON", status: "ACTIVE", passwordHash: await hashPassword("personpass123") } });
  const person = await prisma.person.create({ data: { managerId: owner.id, userId: kidUser.id, name: "Aarav" } });
  const seg = await prisma.habitSegment.create({ data: { personId: person.id, name: "Sleep & Wake", orderKey: generateKeyBetween(null, null) } });
  await prisma.habit.create({ data: { segmentId: seg.id, name: "In bed by 10:30 PM", targetPerWeek: 5, orderKey: generateKeyBetween(null, null) } });
  const mon = weekStart(today);
  const rule = await prisma.nonNegotiable.create({ data: { personId: person.id, name: "No screens past bedtime", orderKey: generateKeyBetween(null, null) } });
  await prisma.nonNegotiableMark.create({ data: { nonNegotiableId: rule.id, date: D(today), done: false } });
  await prisma.nonNegotiableMark.create({ data: { nonNegotiableId: rule.id, date: D(addDays(mon, 1)), done: false } });
  await prisma.routineTask.create({ data: { personId: person.id, title: "Pack school bag", dueDate: D(today) } });
  await prisma.routineTask.create({ data: { personId: person.id, title: "Read for 20 minutes", dueDate: null } });

  const browser = await chromium.launch();
  const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: kidUser.email, password: "personpass123" }) });
  const value = (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");

  const shoot = async (name: string, w: number, hour: number) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1.5 });
    await ctx.addCookies([{ name: "orbit_session", value, domain: "localhost", path: "/" }]);
    // Mock the local hour so the time-based background is deterministic.
    await ctx.addInitScript((h: number) => {
      const orig = Date.prototype.getHours;
      // eslint-disable-next-line no-extend-native
      Date.prototype.getHours = function () { return h; };
      void orig;
    }, hour);
    const page: Page = await ctx.newPage();
    await page.goto(`${BASE}/person`, { waitUntil: "domcontentloaded" });
    await page.getByText("Tasks").first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    await ctx.close();
  };

  await shoot("p43-morning-390", 390, 10);   // 10:00 -> morning image, dark text
  await shoot("p43-morning-1440", 1440, 10);
  await shoot("p43-night-390", 390, 21);      // 21:00 -> night image, light text
  await shoot("p43-night-1440", 1440, 21);

  await browser.close();
  await teardown();
  console.log("shots written + torn down");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
