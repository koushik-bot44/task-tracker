import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";

const BASE = "http://localhost:3000";
const OUT = "records/evidence/phase44";
const PREFIX = "p44m-";
const prisma = new PrismaClient();

async function teardown() { await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } }); }

async function main() {
  await teardown();
  await mkdir(OUT, { recursive: true });
  const mgr = await prisma.user.create({ data: { email: `${PREFIX}mgr@orbit.local`, name: "Priya", role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword("mgrpass12345") } });
  const kid = await prisma.user.create({ data: { email: `${PREFIX}aarav@orbit.local`, name: "Aarav", role: "PERSON", status: "ACTIVE", passwordHash: await hashPassword("personpass123") } });
  const person = await prisma.person.create({ data: { managerId: mgr.id, userId: kid.id, name: "Aarav" } });
  const seg = await prisma.habitSegment.create({ data: { personId: person.id, name: "Sleep & Wake", orderKey: generateKeyBetween(null, null) } });
  await prisma.habit.create({ data: { segmentId: seg.id, name: "In bed by 10:30 PM", targetPerWeek: 5, orderKey: generateKeyBetween(null, null) } });

  const browser = await chromium.launch();
  const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: mgr.email, password: "mgrpass12345" }) });
  const value = (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5 });
  await ctx.addCookies([{ name: "orbit_session", value, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/routine`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Well Being" }).first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  await page.getByRole("tab", { name: "tracker" }).click().catch(() => {});
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/p44-manager-wellbeing-1280.png`, fullPage: false });
  await ctx.close();
  await browser.close();
  await teardown();
  console.log("shot written + torn down");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
