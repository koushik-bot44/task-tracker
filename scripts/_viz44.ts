import { chromium, type BrowserContext } from "playwright";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";
import { istDayKey } from "../lib/timezone";

const BASE = "http://localhost:3000";
const OUT = "records/evidence/phase44";
const PREFIX = "p44v-";
const prisma = new PrismaClient();
const today = istDayKey(new Date());
const D = (k: string) => new Date(`${k}T00:00:00.000Z`);

async function teardown() { await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } }); }

async function main() {
  await teardown();
  await mkdir(OUT, { recursive: true });
  const owner = await prisma.user.create({ data: { email: `${PREFIX}owner@orbit.local`, name: "OWNER", role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword("vizpass123") } });
  const kid = await prisma.user.create({ data: { email: `${PREFIX}aarav@orbit.local`, name: "Aarav", role: "PERSON", status: "ACTIVE", passwordHash: await hashPassword("personpass123") } });
  const person = await prisma.person.create({ data: { managerId: owner.id, userId: kid.id, name: "Aarav" } });
  const seg = await prisma.habitSegment.create({ data: { personId: person.id, name: "Sleep & Wake", orderKey: generateKeyBetween(null, null) } });
  await prisma.habit.create({ data: { segmentId: seg.id, name: "In bed by 10:30 PM", targetPerWeek: 5, orderKey: generateKeyBetween(null, null) } });
  await prisma.routineTask.create({ data: { personId: person.id, title: "Pack school bag", dueDate: D(today) } });
  await prisma.routineTask.create({ data: { personId: person.id, title: "Read for 20 minutes", dueDate: null } });

  const browser = await chromium.launch();
  const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: kid.email, password: "personpass123" }) });
  const value = (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");

  const shoot = async (name: string, w: number, hour: number, opts: { reducedMotion?: boolean; sceneOnly?: boolean } = {}) => {
    const ctx: BrowserContext = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1.5, reducedMotion: opts.reducedMotion ? "reduce" : "no-preference" });
    await ctx.addCookies([{ name: "orbit_session", value, domain: "localhost", path: "/" }]);
    await ctx.addInitScript((h: number) => { Date.prototype.getHours = function () { return h; }; }, hour);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/person`, { waitUntil: "domcontentloaded" });
    await page.getByText("Tasks").first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1100);
    // scene-only: hide the content layer (z-10) so we can sample the scene with no text.
    if (opts.sceneOnly) await page.evaluate(() => { const c = document.querySelector(".relative.z-10") as HTMLElement | null; if (c) c.style.visibility = "hidden"; });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    await ctx.close();
  };

  await shoot("p44-day-390", 390, 10);
  await shoot("p44-day-1440", 1440, 10);
  await shoot("p44-night-390", 390, 21);
  await shoot("p44-night-1440", 1440, 21);
  await shoot("p44-night-390-reduced", 390, 21, { reducedMotion: true });
  await shoot("p44-day-scene", 390, 10, { sceneOnly: true });
  await shoot("p44-night-scene", 390, 21, { sceneOnly: true });

  await browser.close();
  await teardown();
  console.log("shots written + torn down");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
