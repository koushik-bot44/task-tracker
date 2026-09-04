/**
 * The manager read-only rail, asserted end to end.
 *
 * The brief's acceptance test verbatim: a manager opening a tool tree sees
 * read-only and clicking a checkbox does NOT complete the task; Edit makes the
 * same click work; Done restores read-only; a reload resets to read-only; a
 * lead and a developer land editable immediately.
 *
 * This is a UI rail, not a permission — so it also checks the manager's API
 * rights are untouched: the same manager can still PATCH the task directly.
 *
 * Mutating, so it works on a task it creates and deletes.
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
// No "edit"/"done" in the title: those words appear in aria-labels and a
// substring name match would collide with the very buttons under test.
const TITLE = "ER- rail probe row";
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(50)} got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

async function signIn(page: Page, role: string) {
  const res = await page.request.post(`${BASE}/api/auth`, {
    data: {
      email: process.env[`SHOT_${role}_EMAIL`],
      password: process.env[`SHOT_${role}_PASSWORD`],
    },
  });
  if (!res.ok()) throw new Error(`sign-in ${role}: ${res.status()}`);
}

async function statusOf(id: string) {
  const t = await prisma.task.findUnique({ where: { id }, select: { status: true } });
  return t?.status ?? "GONE";
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await signIn(page, "MANAGER");

  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const project = projects.find((p: { slug: string }) => p.slug === "ss-shot-sandbox") ?? projects[0];

  const created = await page.request.post(`${BASE}/api/tasks`, {
    data: {
      projectId: project.id,
      title: TITLE,
      dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    },
  });
  const task = await created.json();

  const open = async (p: Page) => {
    await p.goto(`${BASE}/t/${project.slug}`);
    await p.waitForLoadState("networkidle").catch(() => {});
    await p.waitForTimeout(1500);
  };
  const rowCheckbox = (p: Page) =>
    p.locator(`[data-task-id="${task.id}"]`).getByRole("checkbox").first();
  const rowIndicator = (p: Page) =>
    p.locator(`[data-task-id="${task.id}"] [role="img"]`).first();

  // ── manager, default ──────────────────────────────────────────────────────
  await open(page);
  check("manager: Edit button offered", await page.getByRole("button", { name: "Edit", exact: true }).isVisible().catch(() => false), true);
  check("manager: no actionable checkbox", await rowCheckbox(page).count(), 0);
  check("manager: status shown as an indicator", await rowIndicator(page).count() > 0, true);

  // Clicking where the control would be must not complete anything.
  await rowIndicator(page).click({ force: true }).catch(() => {});
  await page.waitForTimeout(900);
  check("manager: click did NOT complete the task", await statusOf(task.id), "BACKLOG");

  // ── manager, after Edit ───────────────────────────────────────────────────
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.waitForTimeout(600);
  check("manager: Editing indicator shown", await page.getByText("Editing", { exact: true }).isVisible().catch(() => false), true);
  check("manager: checkbox now actionable", await rowCheckbox(page).count() > 0, true);

  await rowCheckbox(page).click();
  await page.waitForTimeout(2500);
  check("manager: the same click now completes it", await statusOf(task.id), "DONE");

  // ── Done restores read-only ───────────────────────────────────────────────
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.waitForTimeout(600);
  check("manager: Done restores read-only", await rowCheckbox(page).count(), 0);

  // ── reload resets ─────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.waitForTimeout(400);
  await open(page);
  check("manager: reload resets to read-only", await rowCheckbox(page).count(), 0);

  // ── the rail is not a permission ──────────────────────────────────────────
  const direct = await page.request.patch(`${BASE}/api/tasks/${task.id}`, {
    data: { status: "IN_PROGRESS" },
  });
  check("manager: API edit still allowed (rail is not a block)", direct.status(), 200);

  await ctx.close();

  // ── lead and developer land editable ──────────────────────────────────────
  for (const role of ["TEAM_LEAD", "RESOURCE"] as const) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    await signIn(p, role);
    await open(p);
    check(`${role}: editable immediately`, await rowCheckbox(p).count() > 0, true);
    check(`${role}: no Edit button`, await p.getByRole("button", { name: "Edit", exact: true }).count(), 0);
    await c.close();
  }

  await browser.close();

  const gone = await prisma.task.deleteMany({ where: { title: TITLE } });
  console.log(`\ncleanup: deleted ${gone.count}, remaining ${await prisma.task.count({ where: { title: TITLE } })}`);
  console.log(fail === 0 ? "all edit-rail checks passed" : `${fail} FAILED`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
