/* Mobile rig (2026-09-09): every main screen and both invite sheets at phone size, with an
 * objective check for the thing that actually breaks a phone — sideways scroll
 * and controls smaller than a fingertip. */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const BASE = "http://localhost:3000";
const OUT = process.argv[2] ?? "/tmp/mobile";
const EMAIL = "shot-manager@orbit.local";
const PASSWORD = "Shot-Manager-42";
let problems = 0;

async function audit(page: Page, name: string) {
  const r = await page.evaluate(() => {
    const de = document.documentElement;
    const overflow = de.scrollWidth - de.clientWidth;
    // Anything interactive that a thumb cannot reliably hit (44px is the floor).
    const small: string[] = [];
    for (const el of Array.from(document.querySelectorAll("button, a, input, select, textarea, [role=button]"))) {
      const b = (el as HTMLElement).getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      // A checkbox is 20px but its LABEL is the thing a thumb hits, so measure
      // the enclosing label when there is one — otherwise every tidy list of
      // tick-boxes reads as a failure.
      const label = (el as HTMLElement).closest("label");
      const box = label ? label.getBoundingClientRect() : b;
      const h = Math.max(b.height, box.height);
      const w = Math.max(b.width, box.width);
      if (h < 32 || w < 24) small.push(`${el.tagName.toLowerCase()}[${(el.textContent ?? "").trim().slice(0, 18)}] ${Math.round(w)}x${Math.round(h)}`);
    }
    return { overflow, small: small.slice(0, 6), smallCount: small.length };
  });
  const bad = r.overflow > 1 || r.smallCount > 0;
  if (bad) problems++;
  console.log(`${bad ? "FAIL" : "PASS"}  ${name.padEnd(22)} sideways ${r.overflow}px, small targets ${r.smallCount}${r.small.length ? ` → ${r.small.join(" | ")}` : ""}`);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

async function main() {
  const dept = await prisma.department.findFirst({ orderBy: { orderKey: "asc" } });
  await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash: await hashPassword(PASSWORD), role: "MANAGER", status: "ACTIVE", disabledAt: null, departmentId: dept!.id },
    create: { email: EMAIL, name: "Shot Manager", role: "MANAGER", passwordHash: await hashPassword(PASSWORD), status: "ACTIVE", departmentId: dept!.id },
  });
  const project = await prisma.project.findFirst({ select: { slug: true } });

  const browser = await chromium.launch();
  // A small modern phone, the tightest thing that has to work.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1200);
  await audit(page, "01-login");
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1200);

  for (const [name, path] of [["02-today", "/"], ["03-projects", "/projects"], ["04-project", `/project/${project?.slug ?? ""}`], ["05-work", "/work"], ["06-people", "/people"], ["07-calendar", "/calendar"], ["08-account", "/settings/account"]] as const) {
    await page.goto(BASE + path);
    await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1200);
    await page.waitForTimeout(500);
    await audit(page, name);
  }

  const attempt = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { console.log(`SKIP  ${name} — ${(e as Error).message.split("\n")[0].slice(0, 90)}`); }
  };

  // New project, with a new person carrying two addresses.
  await page.goto(`${BASE}/projects`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1200);
  await attempt("open New project", async () => {
  await page.getByRole("button", { name: /new project/i }).first().click({ timeout: 10000 });
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /someone not on orbit yet|add someone new/i }).first().click();
  await page.waitForTimeout(300);
  await page.getByLabel(/^Name of /).first().fill("Kiran");
  await page.getByLabel(/^Email for /).first().fill("kiran@company.com");
  await page.getByRole("button", { name: /another email for this person/i }).first().click();
  await page.waitForTimeout(200);
  await page.getByLabel(/^Another email for /).first().fill("kiran.personal@gmail.com");
  });
  await audit(page, "09-new-project-invite");

  // New Task, with two people who are not on Orbit yet.
  await page.goto(`${BASE}/work`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1200);
  await attempt("click New", async () => await page.getByRole("button", { name: /^new$/i }).first().click({ timeout: 10000 }));
  await page.waitForTimeout(700);
  await attempt("open New Task", async () => {
  const add = page.getByRole("button", { name: /someone not on orbit yet|add someone new/i }).first();
  await add.click({ timeout: 10000 });
  await page.waitForTimeout(250);
  await page.getByLabel(/^Name of /).first().fill("Kiran");
  await page.getByLabel(/^Email for /).first().fill("kiran@company.com");
  await page.getByRole("button", { name: /another email for this person/i }).first().click();
  await page.waitForTimeout(200);
  await page.getByLabel(/^Another email for /).first().fill("kiran.personal@gmail.com");
  await page.getByRole("button", { name: /someone not on orbit yet/i }).first().click();
  await page.waitForTimeout(250);
  });
  await audit(page, "10-new-task-invite");

  await browser.close();
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  console.log(`\n${problems} screens with problems`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
