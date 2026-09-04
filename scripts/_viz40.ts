import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";
import { istDayKey } from "../lib/timezone";

const BASE = "http://localhost:3000";
const OUT = "records/evidence/phase40";
const PREFIX = "p40v-";
const prisma = new PrismaClient();
const today = istDayKey(new Date());
const D = (k: string) => new Date(`${k}T00:00:00.000Z`);

async function teardown() {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

async function main() {
  await teardown();
  await mkdir(OUT, { recursive: true });
  const owner = await prisma.user.create({ data: { email: `${PREFIX}owner@orbit.local`, name: "OWNER", role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword("vizpass123") } });
  const kidUser = await prisma.user.create({ data: { email: `${PREFIX}aarav@orbit.local`, name: "Aarav", role: "PERSON", status: "ACTIVE", passwordHash: await hashPassword("personpass123") } });
  const person = await prisma.person.create({ data: { managerId: owner.id, userId: kidUser.id, name: "Aarav" } });
  // One segment + a couple habits so the screen isn't empty.
  const seg = await prisma.habitSegment.create({ data: { personId: person.id, name: "Sleep & Wake", orderKey: generateKeyBetween(null, null) } });
  await prisma.habit.create({ data: { segmentId: seg.id, name: "In bed by 10:30 PM", targetPerWeek: 5, orderKey: generateKeyBetween(null, null) } });
  // House rules (some crossed — must NOT show marks on the person side).
  let k = generateKeyBetween(null, null);
  for (const name of ["No screens past bedtime", "No phone at the dinner table", "Leave phone outside bedroom overnight"]) {
    const nn = await prisma.nonNegotiable.create({ data: { personId: person.id, name, orderKey: k } });
    await prisma.nonNegotiableMark.create({ data: { nonNegotiableId: nn.id, date: D(today) } });
    k = generateKeyBetween(k, null);
  }
  await prisma.routineTask.create({ data: { personId: person.id, title: "Pack school bag", dueDate: D(today) } });

  const browser = await chromium.launch();
  const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: kidUser.email, password: "personpass123" }) });
  const value = (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");
  const ctx = await browser.newContext({ viewport: { width: 420, height: 1100 }, deviceScaleFactor: 1.5 });
  await ctx.addCookies([{ name: "orbit_session", value, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/person`, { waitUntil: "domcontentloaded" });
  await page.getByText("House rules").first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/p40-person-houserules-420.png`, fullPage: true });
  await ctx.close();
  await browser.close();
  await teardown();
  console.log("shot written + torn down");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
