import { chromium, type BrowserContext } from "playwright";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";
import { istDayKey } from "../lib/timezone";

const BASE = "http://localhost:3000";
const OUT = "records/evidence/phase45";
const PREFIX = "p45v-";
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
  const kid = await prisma.user.create({ data: { email: `${PREFIX}aarav@orbit.local`, name: "Aarav", role: "PERSON", status: "ACTIVE", passwordHash: await hashPassword("personpass123") } });
  const person = await prisma.person.create({ data: { managerId: owner.id, userId: kid.id, name: "Aarav" } });
  const seg = await prisma.habitSegment.create({ data: { personId: person.id, name: "Sleep & Wake", orderKey: generateKeyBetween(null, null) } });
  const h1 = await prisma.habit.create({ data: { segmentId: seg.id, name: "In bed by 10:30 PM", targetPerWeek: 5, orderKey: generateKeyBetween(null, null) } });
  const h2 = await prisma.habit.create({ data: { segmentId: seg.id, name: "Up by 6:15 AM", targetPerWeek: 7, orderKey: generateKeyBetween(generateKeyBetween(null, null), null) } });
  const mon = weekStart(today);
  // Mark a spread of MET/MISSED/NA on days <= today so the glass state cells show vivid.
  const marks: [string, number, "MET" | "MISSED" | "NA"][] = [[h1.id, 0, "MET"], [h1.id, 1, "MISSED"], [h2.id, 0, "NA"], [h2.id, 1, "MET"]];
  for (const [habitId, i, value] of marks) { const dk = addDays(mon, i); if (dk <= today) await prisma.habitMark.create({ data: { habitId, date: D(dk), value } }); }
  const r = await prisma.nonNegotiable.create({ data: { personId: person.id, name: "No screens past bedtime", orderKey: generateKeyBetween(null, null) } });
  for (let i = 0; i < 5; i++) await prisma.nonNegotiableMark.create({ data: { nonNegotiableId: r.id, date: D(addDays(mon, i)), done: addDays(mon, i) < today } });
  await prisma.routineTask.create({ data: { personId: person.id, title: "Pack school bag", dueDate: D(today), done: true } });
  await prisma.routineTask.create({ data: { personId: person.id, title: "Read for 20 minutes", dueDate: null } });

  const browser = await chromium.launch();
  const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: kid.email, password: "personpass123" }) });
  const value = (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");

  const shoot = async (name: string, w: number, hour: number, opts: { reduced?: boolean; tab?: string; sampleText?: boolean; hoverTab?: boolean } = {}) => {
    const ctx: BrowserContext = await browser.newContext({ viewport: { width: w, height: 920 }, deviceScaleFactor: 1.5, reducedMotion: opts.reduced ? "reduce" : "no-preference" });
    await ctx.addCookies([{ name: "orbit_session", value, domain: "localhost", path: "/" }]);
    await ctx.addInitScript((h: number) => { Date.prototype.getHours = function () { return h; }; }, hour);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/person`, { waitUntil: "domcontentloaded" });
    await page.getByText("Tasks").first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(900);
    if (opts.tab) await page.getByRole("tab", { name: opts.tab }).click().catch(() => {});
    await page.waitForTimeout(500);
    if (opts.hoverTab) await page.getByRole("tab", { name: "Habits" }).hover().catch(() => {});
    if (opts.sampleText) await page.addStyleTag({ content: ".pk-fg,.pk-fg-soft,.pk-tab,.pk-tab-active,h1,h3,p,li span{color:transparent !important}" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    await ctx.close();
  };

  await shoot("p45-day-habits-390", 390, 10, { tab: "Habits" });
  await shoot("p45-night-habits-390", 390, 21, { tab: "Habits" });
  await shoot("p45-day-tasks-390", 390, 10, { tab: "Tasks" });
  await shoot("p45-night-tasks-390", 390, 21, { tab: "Tasks" });
  await shoot("p45-day-habits-1440", 1440, 10, { tab: "Habits" });
  await shoot("p45-night-habits-1440", 1440, 21, { tab: "Habits" });
  await shoot("p45-night-reduced-390", 390, 21, { tab: "Habits", reduced: true });
  await shoot("p45-night-hover-390", 390, 21, { tab: "Tasks", hoverTab: true });
  await shoot("p45-day-sample", 390, 10, { tab: "Habits", sampleText: true });
  await shoot("p45-night-sample", 390, 21, { tab: "Habits", sampleText: true });

  await browser.close();
  await teardown();
  console.log("shots written + torn down");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
