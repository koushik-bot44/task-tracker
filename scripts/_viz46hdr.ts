import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";

const BASE = "http://localhost:3000";
const OUT = "records/evidence/phase46";
const PRE = "p46hd-";
const prisma = new PrismaClient();
async function teardown() {
  await prisma.routineCollaborator.deleteMany({ where: { OR: [{ manager: { email: { startsWith: PRE } } }, { invitedBy: { email: { startsWith: PRE } } }, { person: { user: { email: { startsWith: PRE } } } }] } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PRE } } });
}
async function main() {
  await teardown();
  await mkdir(OUT, { recursive: true });
  const mgr = await prisma.user.create({ data: { email: PRE + "mgr@orbit.local", name: "Test Manager", role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword("mgrpass12345") } });
  const kid = await prisma.user.create({ data: { email: PRE + "arjun@orbit.local", name: "Arjun", role: "PERSON", status: "ACTIVE", passwordHash: await hashPassword("personpass123") } });
  const person = await prisma.person.create({ data: { managerId: mgr.id, userId: kid.id, name: "Arjun" } });
  const seg = await prisma.habitSegment.create({ data: { personId: person.id, name: "Sleep & Wake", orderKey: generateKeyBetween(null, null) } });
  let hKey = generateKeyBetween(null, null);
  for (let h = 0; h < 4; h++) { await prisma.habit.create({ data: { segmentId: seg.id, name: `Habit ${h + 1}`, targetPerWeek: 5, orderKey: hKey } }); hKey = generateKeyBetween(hKey, null); }
  const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: mgr.email, password: "mgrpass12345" }) });
  const mv = (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");

  const browser = await chromium.launch();
  const shoot = async (name: string, w: number, hour: number) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 780 } });
    await ctx.addCookies([{ name: "orbit_session", value: mv, domain: "localhost", path: "/" }]);
    await ctx.addInitScript((h: number) => { Date.prototype.getHours = function () { return h; }; }, hour);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/routine`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator(".wb-scene").first().waitFor({ state: "attached", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1400);
    await page.getByRole("tab", { name: "tracker" }).click().catch(() => {});
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, 170)); // slide the heading under the bar
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y: 0, width: w, height: 240 } });
    await ctx.close();
  };
  await shoot("p46-hdr-desktop-night", 1180, 21);
  await shoot("p46-hdr-desktop-day", 1180, 10);
  await shoot("p46-hdr-narrow-night", 720, 21);
  await browser.close();
  await teardown();
  console.log("header shots written + torn down");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("ERR", e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
