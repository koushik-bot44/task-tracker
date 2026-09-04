import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";
import { istDayKey } from "../lib/timezone";

const BASE = "http://localhost:3000";
const OUT = "records/evidence/phase46";
const PRE = "p46cs-";
const prisma = new PrismaClient();
const today = istDayKey(new Date());
const D = (k: string) => new Date(`${k}T00:00:00.000Z`);
const addDays = (k: string, n: number) => { const d = D(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekStart = (k: string) => { const d = D(k); const dow = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1)); return d.toISOString().slice(0, 10); };

const lin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (l1: number, l2: number) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
const FG = { day: lum(0x16, 0x25, 0x5b), night: lum(0xf4, 0xf7, 0xff) };
const SOFT = { day: lum(0x44, 0x54, 0x8a), night: lum(0xc6, 0xd0, 0xee) };

async function teardown() {
  await prisma.routineCollaborator.deleteMany({ where: { OR: [{ manager: { email: { startsWith: PRE } } }, { invitedBy: { email: { startsWith: PRE } } }, { person: { user: { email: { startsWith: PRE } } } }] } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PRE } } });
}

async function sample(file: string, region: [number, number, number, number], textLum: number, label: string) {
  const { width = 0, height = 0 } = await sharp(file).metadata();
  const { data, info } = await sharp(file).extract({ left: Math.round(width * region[0]), top: Math.round(height * region[1]), width: Math.round(width * region[2]), height: Math.round(height * region[3]) }).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels; let worst = Infinity;
  for (let i = 0; i < data.length; i += ch) worst = Math.min(worst, contrast(textLum, lum(data[i], data[i + 1], data[i + 2])));
  console.log(`${label.padEnd(34)} WORST ${worst.toFixed(2)}:1  ${worst >= 4.5 ? "PASS" : "FAIL"}`);
}

async function main() {
  await teardown();
  await mkdir(OUT, { recursive: true });
  const mgr = await prisma.user.create({ data: { email: PRE + "mgr@orbit.local", name: "Priya", role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword("mgrpass12345") } });
  const kid = await prisma.user.create({ data: { email: PRE + "aarav@orbit.local", name: "Aarav", role: "PERSON", status: "ACTIVE", passwordHash: await hashPassword("personpass123") } });
  const person = await prisma.person.create({ data: { managerId: mgr.id, userId: kid.id, name: "Aarav" } });
  const mon = weekStart(today);
  let segKey = generateKeyBetween(null, null);
  for (const sname of ["Sleep & Wake", "Screen Time & Media", "Academics", "Diet", "Fitness"]) {
    const seg = await prisma.habitSegment.create({ data: { personId: person.id, name: sname, orderKey: segKey } });
    segKey = generateKeyBetween(segKey, null);
    let hKey = generateKeyBetween(null, null);
    for (let h = 0; h < 3; h++) { const habit = await prisma.habit.create({ data: { segmentId: seg.id, name: `${sname} habit ${h + 1}`, targetPerWeek: 5, orderKey: hKey } }); hKey = generateKeyBetween(hKey, null); await prisma.habitMark.create({ data: { habitId: habit.id, date: D(mon), value: "MET" } }); }
  }
  const r = await prisma.nonNegotiable.create({ data: { personId: person.id, name: "No screens past bedtime", orderKey: generateKeyBetween(null, null) } });
  for (const i of [0, 2, 4]) await prisma.nonNegotiableMark.create({ data: { nonNegotiableId: r.id, date: D(addDays(mon, i)), done: addDays(mon, i) < today } });

  const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: mgr.email, password: "mgrpass12345" }) });
  const mv = (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");

  const browser = await chromium.launch();
  const shootSample = async (name: string, hour: number) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.addCookies([{ name: "orbit_session", value: mv, domain: "localhost", path: "/" }]);
    await ctx.addInitScript((h: number) => { Date.prototype.getHours = function () { return h; }; }, hour);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/routine`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator(".wb-scene").first().waitFor({ state: "attached", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1400);
    await page.getByRole("tab", { name: "tracker" }).click().catch(() => {});
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.addStyleTag({ content: ".pk-fg,.pk-fg-soft,h1,h2,h3,p,span,button,label,option,input{color:transparent !important}" });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    await ctx.close();
  };
  await shootSample("p46-night-scroll-sample", 21);
  await shootSample("p46-day-scroll-sample", 10);
  await browser.close();
  await teardown();
  await prisma.$disconnect();

  // Panels sitting low in the viewport at scroll-bottom (over the horizon = worst case).
  const lowerCard: [number, number, number, number] = [0.26, 0.56, 0.3, 0.06];   // Non-negotiables card body
  const bottomPanel: [number, number, number, number] = [0.27, 0.79, 0.2, 0.018]; // Monitoring panel subtitle band (clean glass, no controls)
  const nf = `${OUT}/p46-night-scroll-sample.png`, df = `${OUT}/p46-day-scroll-sample.png`;
  console.log("— NIGHT (scrolled to horizon) —");
  await sample(nf, lowerCard, FG.night, "lower card (fg)");
  await sample(nf, lowerCard, SOFT.night, "lower card (soft)");
  await sample(nf, bottomPanel, FG.night, "bottom panel (fg)");
  console.log("— DAY (scrolled to horizon) —");
  await sample(df, lowerCard, FG.day, "lower card (fg)");
  await sample(df, lowerCard, SOFT.day, "lower card (soft)");
  await sample(df, bottomPanel, FG.day, "bottom panel (fg)");
}
main().catch(async (e) => { console.error("ERR", e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
