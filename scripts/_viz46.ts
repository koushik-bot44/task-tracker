import { chromium, type BrowserContext } from "playwright";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";
import { istDayKey } from "../lib/timezone";

const BASE = "http://localhost:3000";
const OUT = "records/evidence/phase46";
const PREFIX = "p46v-";
const prisma = new PrismaClient();
const today = istDayKey(new Date());
const D = (k: string) => new Date(`${k}T00:00:00.000Z`);
const addDays = (k: string, n: number) => { const d = D(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekStart = (k: string) => { const d = D(k); const dow = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1)); return d.toISOString().slice(0, 10); };

async function teardown() {
  await prisma.routineCollaborator.deleteMany({ where: { OR: [{ manager: { email: { startsWith: PREFIX } } }, { invitedBy: { email: { startsWith: PREFIX } } }, { person: { user: { email: { startsWith: PREFIX } } } }] } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

async function main() {
  await teardown();
  await mkdir(OUT, { recursive: true });
  const mgr = await prisma.user.create({ data: { email: `${PREFIX}mgr@orbit.local`, name: "Priya", role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword("mgrpass12345") } });
  const kid = await prisma.user.create({ data: { email: `${PREFIX}aarav@orbit.local`, name: "Aarav", role: "PERSON", status: "ACTIVE", passwordHash: await hashPassword("personpass123") } });
  const other = await prisma.user.create({ data: { email: `${PREFIX}coach@orbit.local`, name: "Coach Ravi", role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword("x1234567890") } });
  const person = await prisma.person.create({ data: { managerId: mgr.id, userId: kid.id, name: "Aarav" } });
  const seg = await prisma.habitSegment.create({ data: { personId: person.id, name: "Sleep & Wake", orderKey: generateKeyBetween(null, null) } });
  const h1 = await prisma.habit.create({ data: { segmentId: seg.id, name: "In bed by 10:30 PM", targetPerWeek: 5, orderKey: generateKeyBetween(null, null) } });
  const h2 = await prisma.habit.create({ data: { segmentId: seg.id, name: "Up by 6:15 AM", targetPerWeek: 7, orderKey: generateKeyBetween(generateKeyBetween(null, null), null) } });
  const mon = weekStart(today);
  for (const [hid, i, v] of [[h1.id, 0, "MET"], [h1.id, 1, "MISSED"], [h2.id, 0, "NA"], [h2.id, 1, "MET"]] as [string, number, "MET" | "MISSED" | "NA"][]) {
    if (addDays(mon, i) <= today) await prisma.habitMark.create({ data: { habitId: hid, date: D(addDays(mon, i)), value: v } });
  }
  const r = await prisma.nonNegotiable.create({ data: { personId: person.id, name: "No screens past bedtime", orderKey: generateKeyBetween(null, null) } });
  for (const i of [0, 2, 4]) await prisma.nonNegotiableMark.create({ data: { nonNegotiableId: r.id, date: D(addDays(mon, i)), done: addDays(mon, i) < today } });
  await prisma.routineTask.create({ data: { personId: person.id, title: "Pack school bag", dueDate: D(today) } });
  await prisma.routineTask.create({ data: { personId: person.id, title: "Read for 20 minutes", dueDate: null, done: true } });
  for (let i = 0; i < 5; i++) await prisma.weightEntry.create({ data: { personId: person.id, date: D(addDays(today, -i * 3)), weightKg: 44 + i * 0.3 } });
  await prisma.routineCollaborator.create({ data: { personId: person.id, managerId: other.id, permission: "READ_ONLY", status: "ACCEPTED", invitedById: mgr.id } });

  const browser = await chromium.launch();
  const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: mgr.email, password: "mgrpass12345" }) });
  const value = (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");

  const shoot = async (name: string, path: string, w: number, hour: number, opts: { tab?: string; reduced?: boolean; sampleText?: boolean } = {}) => {
    const ctx: BrowserContext = await browser.newContext({ viewport: { width: w, height: 1000 }, deviceScaleFactor: 1.25, reducedMotion: opts.reduced ? "reduce" : "no-preference" });
    await ctx.addCookies([{ name: "orbit_session", value, domain: "localhost", path: "/" }]);
    await ctx.addInitScript((h: number) => { Date.prototype.getHours = function () { return h; }; }, hour);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    if (opts.tab) await page.getByRole("tab", { name: opts.tab }).click().catch(() => {});
    await page.waitForTimeout(700);
    if (opts.sampleText) await page.addStyleTag({ content: ".pk-fg,.pk-fg-soft,h1,h2,h3,p,span,button,label,option,input{color:transparent !important}" });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    await ctx.close();
  };

  await shoot("p46-night-tracker-1440", "/routine", 1440, 21, { tab: "tracker" });
  await shoot("p46-day-tracker-1440", "/routine", 1440, 10, { tab: "tracker" });
  await shoot("p46-night-summary-1440", "/routine", 1440, 21, { tab: "summary" });
  await shoot("p46-night-tracker-390", "/routine", 390, 21, { tab: "tracker" });
  await shoot("p46-day-tracker-390", "/routine", 390, 10, { tab: "tracker" });
  await shoot("p46-night-reduced-1440", "/routine", 1440, 21, { tab: "tracker", reduced: true });
  await shoot("p46-home-1440", "/", 1440, 21); // scene SCOPED check — Home has no scene
  await shoot("p46-night-sample", "/routine", 1440, 21, { tab: "tracker", sampleText: true });
  await shoot("p46-day-sample", "/routine", 1440, 10, { tab: "tracker", sampleText: true });

  await browser.close();
  await teardown();
  console.log("shots written + torn down");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
