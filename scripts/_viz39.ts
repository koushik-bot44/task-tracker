import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";
import { istDayKey } from "../lib/timezone";
import { DEFAULT_SEGMENTS } from "../lib/routine";

const BASE = "http://localhost:3000";
const OUT = "records/evidence/phase39";
const PREFIX = "p39v-";
const prisma = new PrismaClient();
const today = istDayKey(new Date());
const D = (k: string) => new Date(`${k}T00:00:00.000Z`);
const addDays = (k: string, n: number) => { const d = D(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekStart = (k: string) => { const d = D(k); const dow = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1)); return d.toISOString().slice(0, 10); };
async function teardown() {
  await prisma.routineCollaborator.deleteMany({ where: { OR: [{ manager: { email: { startsWith: PREFIX } } }, { invitedBy: { email: { startsWith: PREFIX } } }, { person: { user: { email: { startsWith: PREFIX } } } }] } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

async function seedGrid(personId: string) {
  const mon = weekStart(today);
  const vals = ["MET", "MET", "MISSED", "MET", "NA", "MET", "MET"] as const;
  let segKey = generateKeyBetween(null, null);
  for (const seg of DEFAULT_SEGMENTS.slice(0, 3)) {
    const segment = await prisma.habitSegment.create({ data: { personId, name: seg.name, orderKey: segKey } });
    let hk = generateKeyBetween(null, null);
    for (const h of seg.habits) {
      const habit = await prisma.habit.create({ data: { segmentId: segment.id, name: h.name, targetPerWeek: h.targetPerWeek, orderKey: hk } });
      for (let i = 0; i < 7; i++) { const dk = addDays(mon, i); if (dk <= today && (i + h.name.length) % 3 !== 0) await prisma.habitMark.create({ data: { habitId: habit.id, date: D(dk), value: vals[(i + h.name.length) % 7] } }); }
      hk = generateKeyBetween(hk, null);
    }
    segKey = generateKeyBetween(segKey, null);
  }
}

async function main() {
  await teardown();
  await mkdir(OUT, { recursive: true });
  const pw = "vizpass123";
  const mk = async (label: string, role: "MANAGER" | "PERSON", pass = pw) =>
    prisma.user.create({ data: { email: `${PREFIX}${label}@orbit.local`, name: label === "aarav" ? "Aarav" : label === "bo" ? "Bo" : label.toUpperCase(), role, status: "ACTIVE", passwordHash: await hashPassword(pass) } });

  const owner = await mk("owner", "MANAGER");
  const collab = await mk("collab", "MANAGER");
  const invitee = await mk("invitee", "MANAGER");
  const aaravUser = await mk("aarav", "PERSON", "personpass123");
  const boUser = await mk("bo", "PERSON", "personpass123");

  const aarav = await prisma.person.create({ data: { managerId: owner.id, userId: aaravUser.id, name: "Aarav" } });
  const bo = await prisma.person.create({ data: { managerId: collab.id, userId: boUser.id, name: "Bo" } });
  await seedGrid(aarav.id);
  await seedGrid(bo.id);
  // Owner's tasks (some undone -> reminder is enabled) + non-negotiable + weight.
  await prisma.routineTask.create({ data: { personId: aarav.id, title: "Pack school bag", dueDate: D(today) } });
  await prisma.routineTask.create({ data: { personId: aarav.id, title: "Read for 20 minutes", dueDate: null } });
  await prisma.nonNegotiable.create({ data: { personId: aarav.id, name: "No screens past bedtime", orderKey: generateKeyBetween(null, null) } });
  for (let i = 0; i < 4; i++) await prisma.weightEntry.create({ data: { personId: aarav.id, date: D(addDays(today, -i * 3)), weightKg: 44 + i * 0.2 } });

  // Collaborators: collab ACCEPTED (read-only) on Aarav; invitee PENDING on Aarav.
  await prisma.routineCollaborator.create({ data: { personId: aarav.id, managerId: collab.id, permission: "READ_ONLY", status: "ACCEPTED", invitedById: owner.id } });
  await prisma.routineCollaborator.create({ data: { personId: aarav.id, managerId: invitee.id, permission: "EDITABLE", status: "PENDING", invitedById: owner.id } });
  // A reminder waiting for Aarav.
  await prisma.notification.create({ data: { userId: aaravUser.id, type: "routine.reminder", title: "Reminder: 2 tasks to do", body: "Pack school bag, Read for 20 minutes", data: { url: "/person" } } });

  const browser = await chromium.launch();
  const cookieFor = async (email: string, password: string) => {
    const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    return (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");
  };
  const shoot = async (email: string, password: string, path: string, name: string, w: number, waitText: string, action?: (page: Page) => Promise<void>) => {
    const value = await cookieFor(email, password);
    const ctx = await browser.newContext({ viewport: { width: w, height: 950 }, deviceScaleFactor: 1.5 });
    await ctx.addCookies([{ name: "orbit_session", value, domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.getByText(waitText).first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(900);
    if (action) await action(page);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    await ctx.close();
  };
  const toTracker = async (page: Page) => { await page.getByRole("tab", { name: "tracker" }).click(); await page.waitForTimeout(700); };

  // 1. Owner Tracker — reminder card + monitoring managers panel (accepted + pending).
  await shoot(owner.email, pw, "/routine", "p39-owner-1440", 1440, "This week", toTracker);
  // 2. Read-only collaborator viewing Aarav — switcher + read-only badge + disabled controls.
  await shoot(collab.email, pw, "/routine", "p39-readonly-1440", 1440, "This week", async (page) => {
    // Select Aarav first (a routine switch remounts the dashboard back to Summary),
    // then open the Tracker so the read-only grid (disabled cells) is shown.
    await page.selectOption('select[aria-label="Choose a routine"]', { label: "Aarav (read-only)" }).catch(() => {});
    await page.getByText("Read-only").first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    await toTracker(page);
    await page.waitForTimeout(600);
  });
  // 3. Invitee Home — pending routine invite.
  await shoot(invitee.email, pw, "/", "p39-home-invites-1440", 1440, "invited you to monitor");
  // 4. Person /kid — the reminder banner.
  await shoot(aaravUser.email, "personpass123", "/person", "p39-person-reminder-390", 390, "Reminder");

  await browser.close();
  await teardown();
  console.log("shots written + torn down");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
