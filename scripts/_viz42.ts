import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";
import { istDayKey } from "../lib/timezone";

const BASE = "http://localhost:3000";
const OUT = "records/evidence/phase42";
const PREFIX = "p42v-";
const prisma = new PrismaClient();
const today = istDayKey(new Date());
const D = (k: string) => new Date(`${k}T00:00:00.000Z`);
const addDays = (k: string, n: number) => { const d = D(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekStart = (k: string) => { const d = D(k); const dow = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1)); return d.toISOString().slice(0, 10); };

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
  // Rule 1: scheduled every day this week; today marked done by the person.
  const r1 = await prisma.nonNegotiable.create({ data: { personId: person.id, name: "No screens past bedtime", orderKey: generateKeyBetween(null, null) } });
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i);
    await prisma.nonNegotiableMark.create({ data: { nonNegotiableId: r1.id, date: D(d), done: d === today } });
  }
  // Rule 2: scheduled Mon / Wed / Fri only.
  const r2 = await prisma.nonNegotiable.create({ data: { personId: person.id, name: "Piano practice", orderKey: generateKeyBetween(r1.orderKey, null) } });
  for (const i of [0, 2, 4]) await prisma.nonNegotiableMark.create({ data: { nonNegotiableId: r2.id, date: D(addDays(mon, i)), done: false } });

  await prisma.routineTask.create({ data: { personId: person.id, title: "Pack school bag", dueDate: D(today) } });
  await prisma.routineTask.create({ data: { personId: person.id, title: "Read for 20 minutes", dueDate: null } });

  const browser = await chromium.launch();
  const cookieFor = async (email: string, password: string) => {
    const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    return (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");
  };
  const shoot = async (email: string, password: string, path: string, name: string, w: number, h: number, waitText: string, action?: (p: Page) => Promise<void>) => {
    const value = await cookieFor(email, password);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1.5 });
    await ctx.addCookies([{ name: "orbit_session", value, domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.getByText(waitText).first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
    if (action) await action(page);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    await ctx.close();
  };

  // 1. Manager Tracker — non-negotiables scheduled, today done; week-scoped tasks.
  await shoot(owner.email, "vizpass123", "/routine", "p42-manager-nonneg-1440", 1440, 950, "This week", async (p) => {
    await p.getByRole("tab", { name: "tracker" }).click(); await p.waitForTimeout(700);
  });
  // 2. Person — Rules tab (mark scheduled days done).
  await shoot(kidUser.email, "personpass123", "/person", "p42-person-rules-420", 420, 1000, "Tasks", async (p) => {
    await p.getByRole("tab", { name: "Rules" }).click(); await p.waitForTimeout(600);
  });
  // 3. Person — Tasks tab (default).
  await shoot(kidUser.email, "personpass123", "/person", "p42-person-tasks-420", 420, 1000, "Tasks");

  await browser.close();
  await teardown();
  console.log("shots written + torn down");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
