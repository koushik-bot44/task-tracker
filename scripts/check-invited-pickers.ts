/* Invited people in the pickers (2026-09-11), on the clone.
 *   npx tsx --env-file=.env.local scripts/check-invited-pickers.ts      (dev server up)
 *
 * A new organisation invites its people and builds teams and projects before
 * anyone has set a password. The server already takes an invited person as a
 * team's lead or member and as a project member; the screens offered active
 * people only. As the CEO, with one active and one invited person in a throwaway
 * department ("INV …"): the "+ Team" sheet offers the invited person as lead and
 * member, marked "(invited)"; New project offers them under People, marked the
 * same, but not as Lead (a project's lead must be active). Leaves no trace.
 */
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { chromium, type Browser, type Page } from "playwright";
import { hashPassword } from "../lib/password";

if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "")) {
  console.error("DATABASE_URL is not the local clone. Refusing.");
  process.exit(1);
}

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const CEO_EMAIL = process.env.CEO_EMAIL ?? "founder@orbit.local";
const CEO_PASSWORD = process.env.CEO_PASSWORD ?? "orbit123";
const RUN = Date.now().toString(36);

let pass = 0;
let fail = 0;
function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function countAll(): Promise<Record<string, number>> {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%' ORDER BY tablename`);
  const out: Record<string, number> = {};
  for (const { tablename } of tables) {
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${tablename}"`);
    out[tablename] = Number(n);
  }
  return out;
}

async function cleanup(started: Date | null) {
  const ids = (await prisma.user.findMany({ where: { email: { startsWith: "inv-" } }, select: { id: true } })).map((u) => u.id);
  const departments = (await prisma.department.findMany({ where: { name: { startsWith: "INV " } }, select: { id: true } })).map((d) => d.id);
  await prisma.assignmentGroup.deleteMany({ where: { OR: [{ name: { startsWith: "INV " } }, { departmentId: { in: departments } }] } });
  await prisma.project.deleteMany({ where: { OR: [{ name: { startsWith: "INV " } }, { departmentId: { in: departments } }] } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.invite.deleteMany({ where: { userId: { in: ids } } });
  if (started) await prisma.loginAttempt.deleteMany({ where: { createdAt: { gte: started } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.department.deleteMany({ where: { id: { in: departments } } });
}

let browser: Browser | null = null;
const consoleErrors: string[] = [];
const serverErrors: string[] = [];
function watch(page: Page) {
  page.on("console", (m) => {
    if (m.type() === "error" && !/status of 4\d\d/.test(m.text())) consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url().replace(BASE, "")}`);
  });
}

async function checks() {
  const lastDept = await prisma.department.findFirst({ orderBy: { orderKey: "desc" }, select: { orderKey: true } });
  const dept = await prisma.department.create({ data: { name: `INV Department ${RUN}`, color: "#475569", orderKey: generateKeyBetween(lastDept?.orderKey ?? null, null) } });
  const active = await prisma.user.create({ data: { email: `inv-active-${RUN}@example.com`, name: `INV Active ${RUN}`, role: "RESOURCE", passwordHash: await hashPassword("Rig-Invited-2026"), status: "ACTIVE", departmentId: dept.id } });

  const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "10.66.0.1" }, body: JSON.stringify({ email: CEO_EMAIL, password: CEO_PASSWORD }) });
  const cookie = (auth.headers.get("set-cookie") ?? "").split(";")[0];
  record("the CEO signs in", auth.status === 200);
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  };
  const invite = await call("POST", "/api/users/invite", { people: [{ name: `INV Invitee ${RUN}`, emails: [`inv-invitee-${RUN}@example.com`], departmentId: dept.id }] });
  const invitee = invite.json?.people?.[0];
  record("the CEO invites someone into the department", invite.status === 201 && Boolean(invitee?.id), `status ${invite.status}`);
  if (!invitee?.id) return;
  const label = `INV Invitee ${RUN} (invited)`;

  /* ---- the server already takes them ---- */
  const team = await call("POST", "/api/assignment-groups", { departmentId: dept.id, name: `INV Team ${RUN}`, leadId: invitee.id, memberIds: [invitee.id, active.id] });
  record("the server takes an invited person as a team's lead and member", team.status === 201, `status ${team.status} ${team.json?.error ?? ""}`);
  const project = await call("POST", "/api/projects", { name: `INV Project ${RUN}`, departmentId: dept.id, memberIds: [invitee.id] });
  const onIt = project.json?.id ? await prisma.projectMember.count({ where: { projectId: project.json.id, userId: invitee.id } }) : 0;
  record("…and as a project member", project.status === 201 && onIt === 1, `status ${project.status}, member rows ${onIt}`);
  await prisma.assignmentGroup.deleteMany({ where: { name: `INV Team ${RUN}` } });
  await prisma.project.deleteMany({ where: { name: `INV Project ${RUN}` } });

  /* ---- the screens ---- */
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  watch(page);
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', CEO_EMAIL);
  await page.fill('input[type="password"]', CEO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 });

  await page.goto(`${BASE}/people`, { waitUntil: "domcontentloaded" });
  const section = page.getByRole("region", { name: `INV Department ${RUN}` });
  await section.waitFor({ timeout: 20000 });
  await section.getByRole("button", { name: "Team", exact: true }).click();
  const teamSheet = page.getByRole("dialog", { name: "New team" });
  await teamSheet.waitFor({ timeout: 10000 });
  const leadOptions = await teamSheet.getByLabel("Lead").locator("option").allTextContents();
  record("+ Team: the invited person can lead it, marked (invited)", leadOptions.map((o) => o.trim()).includes(label), leadOptions.join(" | "));
  const memberRows = (await teamSheet.locator("li label").allTextContents()).map((t) => t.trim());
  record("+ Team: …and be on it, marked the same", memberRows.includes(label), memberRows.join(" | "));
  record("+ Team: the active person is offered as before", memberRows.includes(`INV Active ${RUN}`));
  await page.keyboard.press("Escape");

  await page.goto(`${BASE}/projects`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New project" }).click();
  const projectSheet = page.getByRole("dialog").filter({ has: page.getByLabel("Lead") });
  await projectSheet.waitFor({ timeout: 10000 });
  const departmentSelect = projectSheet.locator("select").filter({ has: page.locator("option", { hasText: "Pick a department…" }) });
  if (await departmentSelect.count()) await departmentSelect.selectOption({ label: `INV Department ${RUN}` });
  await page.waitForTimeout(500);
  const projectLeads = (await projectSheet.getByLabel("Lead").locator("option").allTextContents()).map((o) => o.trim());
  record("New project: the invited person is not offered as Lead (a lead must be active)", !projectLeads.some((o) => o.startsWith(`INV Invitee ${RUN}`)), projectLeads.filter((o) => o.startsWith("INV")).join(" | ") || "none from INV");
  const projectPeople = (await projectSheet.locator("li label").allTextContents()).map((t) => t.trim());
  record("New project: People offers the invited person, marked (invited)", projectPeople.some((t) => t.startsWith(label)), projectPeople.filter((t) => t.startsWith("INV")).join(" | ") || "none from INV");
  await context.close();

  record("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
  record("no 5xx", serverErrors.length === 0, serverErrors.slice(0, 3).join(" | "));
}

async function main() {
  await cleanup(null);
  const before = await countAll();
  const started = new Date();
  try {
    await checks();
  } catch (e) {
    record("the checks ran to the end", false, (e instanceof Error ? e.message : String(e)).split("\n")[0]);
  } finally {
    await browser?.close();
    await cleanup(started);
    const after = await countAll();
    const changed = Object.keys({ ...before, ...after }).filter((t) => before[t] !== after[t]);
    record("the run leaves no trace: every table holds what it held before", changed.length === 0, changed.map((t) => `${t} ${before[t]}→${after[t]}`).join(", "));
  }
}

main()
  .catch((e) => {
    console.error(e);
    fail++;
  })
  .finally(async () => {
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  });
