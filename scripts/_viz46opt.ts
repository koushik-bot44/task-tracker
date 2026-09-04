import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";

const BASE = "http://localhost:3009";
const PRE = "p46opt-";
const prisma = new PrismaClient();
async function teardown() {
  await prisma.routineCollaborator.deleteMany({ where: { OR: [{ manager: { email: { startsWith: PRE } } }, { invitedBy: { email: { startsWith: PRE } } }, { person: { user: { email: { startsWith: PRE } } } }] } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PRE } } });
}
async function main() {
  await teardown();
  const mgr = await prisma.user.create({ data: { email: PRE + "mgr@orbit.local", name: "Test Manager", role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword("mgrpass12345") } });
  const kid = await prisma.user.create({ data: { email: PRE + "arjun@orbit.local", name: "Arjun", role: "PERSON", status: "ACTIVE", passwordHash: await hashPassword("personpass123") } });
  await prisma.person.create({ data: { managerId: mgr.id, userId: kid.id, name: "Arjun" } });
  for (const n of ["Coach Ravi", "Aunt Meera"]) await prisma.user.create({ data: { email: PRE + n.replace(/\s/g, "").toLowerCase() + "@orbit.local", name: n, role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword("x1234567890") } });
  const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: mgr.email, password: "mgrpass12345" }) });
  const mv = (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");

  const browser = await chromium.launch();
  const check = async (label: string, hour: number) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([{ name: "orbit_session", value: mv, domain: "localhost", path: "/" }]);
    await ctx.addInitScript((h: number) => { Date.prototype.getHours = function () { return h; }; }, hour);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/routine`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('select[aria-label="Manager to invite"]', { timeout: 40000 }).catch(() => {});
    await page.waitForFunction(() => { const s = document.querySelector('select[aria-label="Manager to invite"]') as HTMLSelectElement | null; return !!s && s.options.length > 1; }, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const sel = document.querySelector('select[aria-label="Manager to invite"]') as HTMLSelectElement | null;
      const opts = sel ? Array.from(sel.options) : [];
      const named = opts.find((o) => o.value);
      const cs = named ? getComputedStyle(named) : null;
      const psel = document.querySelector('select[aria-label="Choose a Well Being"]') as HTMLSelectElement | null;
      const popt = psel && psel.options.length ? getComputedStyle(psel.options[0]) : null;
      return { count: opts.length, sampleText: named?.textContent ?? "(none)", inviteColor: cs?.color, inviteBg: cs?.backgroundColor, pickerColor: popt?.color, pickerBg: popt?.backgroundColor };
    });
    const dark = r.inviteColor === "rgb(22, 37, 91)";
    console.log(`${label}: invite options=${r.count} ("${r.sampleText}") color=${r.inviteColor} bg=${r.inviteBg} -> ${dark ? "DARK/PASS" : "FAIL"} | picker color=${r.pickerColor}`);
    await ctx.close();
  };
  await check("NIGHT", 21);
  await check("DAY", 10);
  await browser.close();
  await teardown();
  console.log("done + torn down");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("ERR", e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
