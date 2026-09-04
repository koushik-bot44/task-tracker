import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";

const BASE = "http://localhost:3000";
const OUT = "records/evidence/phase46";
const PRE = "p46f-";
const prisma = new PrismaClient();
async function teardown() {
  await prisma.routineCollaborator.deleteMany({ where: { OR: [{ manager: { email: { startsWith: PRE } } }, { invitedBy: { email: { startsWith: PRE } } }, { person: { user: { email: { startsWith: PRE } } } }] } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PRE } } });
}

async function main() {
  await teardown();
  await mkdir(OUT, { recursive: true });
  const mgr = await prisma.user.create({ data: { email: PRE + "mgr@orbit.local", name: "Priya", role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword("mgrpass12345") } });
  const kid = await prisma.user.create({ data: { email: PRE + "aarav@orbit.local", name: "Aarav", role: "PERSON", status: "ACTIVE", passwordHash: await hashPassword("personpass123") } });
  const person = await prisma.person.create({ data: { managerId: mgr.id, userId: kid.id, name: "Aarav" } });
  const seg = await prisma.habitSegment.create({ data: { personId: person.id, name: "Sleep & Wake", orderKey: generateKeyBetween(null, null) } });
  await prisma.habit.create({ data: { segmentId: seg.id, name: "In bed by 10:30 PM", targetPerWeek: 5, orderKey: generateKeyBetween(null, null) } });

  const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: mgr.email, password: "mgrpass12345" }) });
  const value = (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");

  const browser = await chromium.launch();
  const open = async (hour: number, w: number) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1.25 });
    await ctx.addCookies([{ name: "orbit_session", value, domain: "localhost", path: "/" }]);
    await ctx.addInitScript((h: number) => {
      Date.prototype.getHours = function () { return h; };
      (window as any).__fs = { called: false, cls: "" };
      try { Object.defineProperty(document, "fullscreenElement", { configurable: true, get() { return (window as any).__fsEl || null; } }); } catch { /* already configured */ }
      (Element.prototype as any).requestFullscreen = function () { (window as any).__fsEl = this; (window as any).__fs = { called: true, cls: this.className }; document.dispatchEvent(new Event("fullscreenchange")); return Promise.resolve(); };
      (document as any).exitFullscreen = function () { (window as any).__fsEl = null; document.dispatchEvent(new Event("fullscreenchange")); return Promise.resolve(); };
    }, hour);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/routine`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    return { ctx, page };
  };

  // Button visible night + day.
  for (const [scene, hour] of [["night", 21], ["day", 10]] as const) {
    const { ctx, page } = await open(hour, 1280);
    const btn = page.getByRole("button", { name: /full screen/i }).first();
    console.log(`${scene}: Full screen button visible ->`, await btn.isVisible());
    await page.screenshot({ path: `${OUT}/p46-${scene}-fsbutton-1280.png`, fullPage: false });
    await ctx.close();
  }

  // Click wiring: invokes requestFullscreen on the .wb-fs root; label toggles; exits.
  {
    const { ctx, page } = await open(21, 1280);
    await page.getByRole("button", { name: /^Enter full screen$/i }).click();
    await page.waitForTimeout(400);
    const rec = await page.evaluate(() => (window as any).__fs);
    console.log("clicked -> requestFullscreen called:", rec.called, "| on element classes contain wb-fs:", /\bwb-fs\b/.test(rec.cls));
    const exitVisible = await page.getByRole("button", { name: /^Exit full screen$/i }).isVisible();
    console.log("label swapped to Exit:", exitVisible);
    await page.getByRole("button", { name: /^Exit full screen$/i }).click();
    await page.waitForTimeout(400);
    const backToEnter = await page.getByRole("button", { name: /^Enter full screen$/i }).isVisible();
    console.log("exited -> label back to Enter:", backToEnter);
    await ctx.close();
  }

  // Mobile: button collapses to icon-only (aria-label preserved).
  {
    const { ctx, page } = await open(21, 390);
    const btn = page.getByRole("button", { name: /full screen/i }).first();
    console.log("mobile: icon button present (label kept for a11y):", await btn.isVisible());
    await ctx.close();
  }

  await browser.close();
  await teardown();
  console.log("done + torn down");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("ERR", e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
