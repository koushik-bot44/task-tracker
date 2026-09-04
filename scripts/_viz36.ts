import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";
import { istDayKey } from "../lib/timezone";
import { DEFAULT_SEGMENTS } from "../lib/routine";

const BASE = "http://localhost:3000";
const OUT = "records/evidence/phase36";
const PREFIX = "p36v-";
const prisma = new PrismaClient();
const today = istDayKey(new Date());
const D = (k: string) => new Date(`${k}T00:00:00.000Z`);

async function teardown() {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

async function main() {
  await teardown();
  await mkdir(OUT, { recursive: true });
  const pw = "vizpass123";
  const mgr = await prisma.user.create({ data: { email: `${PREFIX}mgr@orbit.local`, name: "P36 Mgr", role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword(pw) } });
  const personPw = "personpass123";
  const personUser = await prisma.user.create({ data: { email: `${PREFIX}person@orbit.local`, name: "Aarav", role: "PERSON", status: "ACTIVE", passwordHash: await hashPassword(personPw) } });
  const person = await prisma.person.create({ data: { managerId: mgr.id, userId: personUser.id, name: "Aarav" } });

  // A light grid so the page renders naturally.
  let segKey = generateKeyBetween(null, null);
  for (const seg of DEFAULT_SEGMENTS.slice(0, 2)) {
    const segment = await prisma.habitSegment.create({ data: { personId: person.id, name: seg.name, orderKey: segKey } });
    let hk = generateKeyBetween(null, null);
    for (const h of seg.habits) { await prisma.habit.create({ data: { segmentId: segment.id, name: h.name, targetPerWeek: h.targetPerWeek, orderKey: hk } }); hk = generateKeyBetween(hk, null); }
    segKey = generateKeyBetween(segKey, null);
  }
  // Weights across FIVE months — a gentle downward trend — two entries per month.
  const months: [string, number[]][] = [
    ["2026-04", [45.8, 45.5]],
    ["2026-05", [45.3, 45.6]],
    ["2026-06", [45.1, 44.8]],
    ["2026-07", [44.6, 44.9]],
    ["2026-08", [44.4, 44.1]],
  ];
  for (const [m, kgs] of months) {
    await prisma.weightEntry.create({ data: { personId: person.id, date: D(`${m}-06`), weightKg: kgs[0] } });
    await prisma.weightEntry.create({ data: { personId: person.id, date: D(`${m}-24`), weightKg: kgs[1] } });
  }
  // A couple of tasks for the person screen.
  await prisma.routineTask.create({ data: { personId: person.id, title: "Pack school bag", dueDate: D(today) } });
  await prisma.routineTask.create({ data: { personId: person.id, title: "Read for 20 minutes", dueDate: null } });

  const browser = await chromium.launch();
  const cookieFor = async (email: string, password: string) => {
    const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    return (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");
  };
  const shoot = async (email: string, password: string, path: string, name: string, w: number, waitText: string, action?: (page: Page) => Promise<void>, clip?: boolean) => {
    const value = await cookieFor(email, password);
    const ctx = await browser.newContext({ viewport: { width: w, height: 950 }, deviceScaleFactor: 2 });
    await ctx.addCookies([{ name: "orbit_session", value, domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.getByText(waitText).first().waitFor({ state: "visible", timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(700);
    if (action) await action(page);
    if (clip) {
      const section = page.locator("section", { hasText: "Weight" }).last();
      await section.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await section.screenshot({ path: `${OUT}/${name}.png` });
    } else {
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    }
    await ctx.close();
  };
  const toMonthly = async (page: Page) => {
    await page.getByRole("tab", { name: "monthly" }).click();
    await page.waitForTimeout(500);
  };

  // The weight monitor in MONTHLY view — focused card + full page, both widths.
  await shoot(mgr.email, pw, "/routine", "p36-weight-monthly-1440", 1440, "Weight", toMonthly, true);
  await shoot(mgr.email, pw, "/routine", "p36-weight-monthly-390", 390, "Weight", toMonthly, true);
  await shoot(mgr.email, pw, "/routine", "p36-weight-recent-1440", 1440, "Weight", undefined, true);
  await shoot(mgr.email, pw, "/routine", "p36-routine-monthly-1440", 1440, "Weight", toMonthly);
  // The PERSON login — weight-free.
  await shoot(personUser.email, personPw, "/person", "p36-person-390", 390, "Pack school bag");
  await shoot(personUser.email, personPw, "/person", "p36-person-1440", 1440, "Pack school bag");

  await browser.close();
  await teardown();
  console.log("shots written + torn down");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
