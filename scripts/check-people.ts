/* Several people onto a project after it exists, and names that change as often as needed (2026-09-10).
 *   npx tsx --env-file=.env.local scripts/check-people.ts   (dev server up)
 *
 * Over the API, as the CEO: Add people takes several at once — the new ones
 * are made in the project's department and invited, as the role given;
 * someone already on Orbit is added; a disabled account is skipped, saying
 * why; inviting someone by their other address adds them instead of making a
 * second account. On screen: the Add people sheet takes rows for several new
 * people, points out a mistyped address, and sends them together; People
 * renames a person, twice; Account renames you, twice; on a phone the rows fit.
 * Throwaway accounts (pplrig-*) and the project ("PPL ") are removed in `finally`.
 */
import { chromium, type Browser, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PREFIX = "pplrig-";
const PASSWORD = "Rig-People-77";
const at = (label: string) => `${PREFIX}${label}@orbit.local`;
/** The token at the end of a set-password link. */
const tokenOf = (url: string) => url.split("/invite/")[1] ?? "";

let pass = 0;
let fail = 0;
function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function until(check: () => Promise<boolean>, timeout = 15000): Promise<boolean> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function signIn(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return res.ok ? (res.headers.get("set-cookie") ?? "").split(";")[0] : null;
}
async function call(cookie: string, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null;
  try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, json };
}

async function signInPage(b: Browser, email: string, password: string, phone = false): Promise<{ page: Page; errors: string[] }> {
  const context = await b.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
  return { page, errors };
}

const nameOf = async (email: string) => (await prisma.user.findUnique({ where: { email }, select: { name: true } }))?.name ?? null;

let browser: Browser | null = null;
let ceo: string | null = null;
let projectId: string | null = null;

async function cleanup() {
  if (projectId && ceo) await call(ceo, "DELETE", `/api/projects/${projectId}`).catch(() => undefined);
  await prisma.project.deleteMany({ where: { name: { startsWith: "PPL " } } });
  const pplTasks = { title: { startsWith: "PPL ", mode: "insensitive" as const } };
  await prisma.taskActivity.deleteMany({ where: { task: pplTasks } });
  await prisma.notification.deleteMany({ where: { task: pplTasks } });
  await prisma.task.deleteMany({ where: pplTasks });
  const ids = (await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } })).map((u) => u.id);
  if (ids.length) {
    await prisma.passwordResetRequest.deleteMany({ where: { userId: { in: ids } } });
    await prisma.invite.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdById: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
}

async function main() {
  await cleanup(); // whatever a stopped run left behind
  ceo = await signIn("founder@orbit.local", "orbit123");
  record("the CEO signs in", Boolean(ceo));
  if (!ceo) return;
  const dept = await prisma.department.findFirst({ orderBy: { orderKey: "asc" }, select: { id: true } });
  if (!dept) throw new Error("no department on the clone");
  const hash = await hashPassword(PASSWORD);
  const dev = await prisma.user.create({ data: { email: at("dev"), name: "PPL Dev", role: "RESOURCE", status: "ACTIVE", passwordHash: hash, departmentId: dept.id } });
  await prisma.user.create({ data: { email: at("gone"), name: "PPL Gone", role: "RESOURCE", status: "ACTIVE", passwordHash: hash, departmentId: dept.id, disabledAt: new Date() } });

  const made = await call(ceo, "POST", "/api/projects", { name: "PPL Launch", departmentId: dept.id });
  projectId = made.json?.id ?? null;
  const slug: string | null = made.json?.slug ?? null;
  record("a project to add people to", made.status === 201 && Boolean(projectId && slug), `status ${made.status} ${made.json?.error ?? ""}`);
  if (!projectId || !slug) return;
  const members = async () => new Set((await prisma.projectMember.findMany({ where: { projectId: projectId! }, select: { userId: true } })).map((m) => m.userId));

  /* ---- several at once, over the API ---- */
  const batch = await call(ceo, "POST", `/api/projects/${projectId}/members`, {
    invites: [
      { name: "PPL New One", emails: [at("new1"), at("new1-home")], role: "TEAM_LEAD" },
      { emails: [at("new2")] },
      { name: "PPL Dev", emails: [at("dev")] },
      { name: "PPL Gone", emails: [at("gone")] },
    ],
  });
  record(
    "several at once: two invited, one already on Orbit added, a disabled one skipped",
    batch.status === 201 && batch.json?.invited === 2 && batch.json?.added === 1 && batch.json?.skipped?.length === 1,
    `status ${batch.status} ${JSON.stringify({ invited: batch.json?.invited, added: batch.json?.added, skipped: batch.json?.skipped, error: batch.json?.error })}`,
  );
  record("…the skipped one says why", /disabled/.test(batch.json?.skipped?.[0]?.reason ?? ""), batch.json?.skipped?.[0]?.reason ?? "");
  const new1 = await prisma.user.findUnique({ where: { email: at("new1") }, select: { id: true, status: true, role: true, departmentId: true } });
  const new2 = await prisma.user.findUnique({ where: { email: at("new2") }, select: { id: true, name: true, departmentId: true } });
  record("…the new people wait to join, in the project's department, as the role given", new1?.status === "PENDING" && new1.role === "TEAM_LEAD" && new1.departmentId === dept.id && new2?.departmentId === dept.id, JSON.stringify(new1));
  record("…one given no name goes by their address until someone renames them", new2?.name === "pplrig new2", new2?.name ?? "");
  const on = await members();
  record("…and all three are on the project", Boolean(new1 && new2 && on.has(new1.id) && on.has(new2.id) && on.has(dev.id)));
  const again = await call(ceo, "POST", `/api/projects/${projectId}/members`, { invites: [{ emails: [at("new1-home")] }] });
  record(
    "inviting someone by their other address adds them, not a second account",
    again.status === 200 && again.json?.invited === 0 && again.json?.added === 1 && (await prisma.user.count({ where: { email: { startsWith: `${PREFIX}new1` } } })) === 1,
    `status ${again.status}`,
  );
  // The set-password link, to send on WhatsApp when an email lands in spam (owner, 2026-09-10).
  const firstLinks: { name: string; email: string; url: string }[] = batch.json?.links ?? [];
  record(
    "…and a set-password link comes back for each new person, to send by hand",
    firstLinks.length === 2 && firstLinks.every((l) => /\/invite\/[A-Za-z0-9_-]{20,}$/.test(l.url)),
    firstLinks.map((l) => l.email).join(", "),
  );
  const joined = await call("", "POST", `/api/invite/${tokenOf(firstLinks.find((l) => l.email === at("new2"))?.url ?? "")}/accept`, { password: "Rig-Joined-By-Link-99" });
  record(
    "…and the link works: they set a password and they're in",
    joined.status === 200 && (await prisma.user.findUnique({ where: { email: at("new2") }, select: { status: true } }))?.status === "ACTIVE",
    `status ${joined.status}`,
  );

  /* ---- Add people, on screen ---- */
  browser = await chromium.launch();
  const desk = await signInPage(browser, "founder@orbit.local", "orbit123");
  const { page } = desk;
  await page.goto(`${BASE}/project/${slug}`);
  await page.getByRole("button", { name: "Add people" }).first().click({ timeout: 90000 });
  const sheet = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: /^(\+ Another person|\+ Someone not on Orbit yet)$/ }) });
  await sheet.getByLabel("Name of new person 1", { exact: true }).fill("PPL Screen One", { timeout: 20000 });
  await sheet.getByLabel("Email for PPL Screen One", { exact: true }).fill(at("screen1"));
  await sheet.getByRole("button", { name: "+ Another person" }).click();
  await sheet.getByLabel("Name of new person 2", { exact: true }).fill("PPL Screen Two");
  await sheet.getByLabel("Email for PPL Screen Two", { exact: true }).fill("pplrig-screen2-at-orbit");
  record(
    "a mistyped address is pointed out, and the invites can't be sent",
    (await sheet.getByText(/doesn't look like an email/).isVisible()) && (await sheet.getByRole("button", { name: "Send 2 invites" }).isDisabled()),
  );
  await sheet.getByLabel("Email for PPL Screen Two", { exact: true }).fill(at("screen2"));
  await sheet.getByLabel("How PPL Screen Two joins", { exact: true }).selectOption("TEAM_LEAD");
  await sheet.getByRole("button", { name: "Send 2 invites" }).click();
  record("Add people sends several invites together", await until(async () => (await prisma.user.count({ where: { email: { in: [at("screen1"), at("screen2")] }, status: "PENDING" } })) === 2));
  const one = await prisma.user.findUnique({ where: { email: at("screen1") }, select: { id: true, role: true } });
  const two = await prisma.user.findUnique({ where: { email: at("screen2") }, select: { id: true, role: true } });
  const onNow = await members();
  record("…each lands on the project, joining as chosen", Boolean(one && two && onNow.has(one.id) && onNow.has(two.id) && one.role === "RESOURCE" && two.role === "TEAM_LEAD"), `${one?.role} / ${two?.role}`);
  const linkPanel = sheet.getByRole("region", { name: "Invite links" });
  const whatsapp = (await linkPanel.getByRole("link", { name: "Send PPL Screen One's invite on WhatsApp" }).getAttribute("href", { timeout: 8000 }).catch(() => null)) ?? "";
  record(
    "…and shows their invite links, each ready for WhatsApp or to copy",
    whatsapp.startsWith("https://wa.me/?text=") && decodeURIComponent(whatsapp).includes("/invite/") && (await linkPanel.getByRole("button", { name: "Copy PPL Screen Two's invite link" }).isVisible()),
    whatsapp.slice(0, 40),
  );
  record("…the sheet says what happened", await until(async () => page.getByText(/2 invited/).first().isVisible(), 8000));
  record("…and gives fresh rows for the next people", await until(async () => (await sheet.getByLabel("Name of new person 1", { exact: true }).inputValue()) === "", 5000));
  await page.keyboard.press("Escape");

  /* ---- People: a name, changed twice ---- */
  await page.goto(`${BASE}/people`);
  try {
    await page.getByText("PPL Screen One", { exact: true }).first().click({ timeout: 60000 });
    const personSheet = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Save name" }) });
    const nameBox = personSheet.getByRole("textbox", { name: "Name", exact: true });
    await nameBox.fill("PPL Screen Uno");
    await personSheet.getByRole("button", { name: "Save name" }).click();
    const first = await until(async () => (await nameOf(at("screen1"))) === "PPL Screen Uno");
    await nameBox.fill("PPL Screen First");
    await personSheet.getByRole("button", { name: "Save name" }).click();
    const second = await until(async () => (await nameOf(at("screen1"))) === "PPL Screen First");
    record("People renames a person, and renames them again", first && second, (await nameOf(at("screen1"))) ?? "");
    record("…and the sheet shows the new name", await until(async () => page.getByRole("dialog").getByText("PPL Screen First").first().isVisible(), 8000));
    const emailBox = personSheet.getByRole("textbox", { name: "Email", exact: true });
    const hasEmail = async (address: string) => Boolean(await prisma.user.findUnique({ where: { email: address }, select: { id: true } }));
    await emailBox.fill(at("screen1-moved"));
    await personSheet.getByRole("button", { name: "Save email" }).click();
    const moved = await until(async () => hasEmail(at("screen1-moved")));
    await emailBox.fill(at("screen1-again"));
    await personSheet.getByRole("button", { name: "Save email" }).click();
    const movedAgain = await until(async () => hasEmail(at("screen1-again")));
    record("People changes a person's email, and changes it again", moved && movedAgain);
    await page.keyboard.press("Escape");
  } catch (e) {
    record("People renames a person, and renames them again", false, (e as Error).message.split("\n")[0]);
  }

  /* ---- People: invite one and send the link; a fresh link for someone who hasn't joined ---- */
  try {
    await page.goto(`${BASE}/people`);
    await page.getByRole("button", { name: /^Invite/ }).first().click({ timeout: 60000 });
    const inviteSheet = page.getByRole("dialog", { name: "Invite someone" });
    await inviteSheet.getByPlaceholder("Their full name").fill("PPL Solo");
    await inviteSheet.getByLabel("Email", { exact: true }).fill(at("solo"));
    await inviteSheet.getByRole("button", { name: "Send invite" }).click();
    const soloBox = inviteSheet.getByRole("textbox", { name: "Invite link for PPL Solo" });
    const firstUrl = (await until(async () => soloBox.isVisible())) ? await soloBox.inputValue() : "";
    record("People → Invite shows the new person's link, to send on WhatsApp", /\/invite\/[A-Za-z0-9_-]{20,}$/.test(firstUrl), firstUrl ? "link shown" : "no link");
    await inviteSheet.getByRole("button", { name: "Done" }).click();
    await page.getByText("PPL Solo", { exact: true }).first().click({ timeout: 30000 });
    const soloSheet = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Share invite link" }) });
    await soloSheet.getByRole("button", { name: "Share invite link" }).click();
    const shareBox = soloSheet.getByRole("textbox", { name: "Invite link for PPL Solo" });
    const secondUrl = (await until(async () => shareBox.isVisible())) ? await shareBox.inputValue() : "";
    const oldTry = await call("", "POST", `/api/invite/${tokenOf(firstUrl)}/accept`, { password: "Rig-Old-Link-99" });
    const newTry = await call("", "POST", `/api/invite/${tokenOf(secondUrl)}/accept`, { password: "Rig-New-Link-99" });
    record(
      "someone who hasn't joined gets a fresh link from People; the old one stops working",
      Boolean(secondUrl) && secondUrl !== firstUrl && oldTry.status === 410 && newTry.status === 200,
      `old link ${oldTry.status}, new link ${newTry.status}`,
    );
    await page.keyboard.press("Escape");
  } catch (e) {
    record("People → Invite and Share invite link", false, (e as Error).message.split("\n")[0]);
  }

  /* ---- New project and New Task: the links of the people invited while making them ---- */
  try {
    await page.goto(`${BASE}/projects`);
    await page.getByRole("button", { name: /new project/i }).first().click({ timeout: 60000 });
    const projectSheet = page.getByRole("dialog", { name: "New project" });
    await projectSheet.getByLabel("Project name", { exact: true }).fill("PPL Invite Project");
    const projectDept = projectSheet.getByLabel("Department", { exact: true });
    if (await projectDept.isVisible().catch(() => false)) await projectDept.selectOption({ index: 1 });
    await projectSheet.getByRole("button", { name: "+ Someone not on Orbit yet" }).first().click();
    await projectSheet.getByLabel("Name of new person 1", { exact: true }).fill("PPL Project Invitee");
    await projectSheet.getByLabel("Email for PPL Project Invitee", { exact: true }).fill(at("project-invitee"));
    await projectSheet.getByRole("button", { name: "Save" }).click();
    const projectLink = projectSheet.getByRole("textbox", { name: "Invite link for PPL Project Invitee" });
    const shown = await until(async () => projectLink.isVisible(), 20000);
    record("New project shows the link of the person invited with it", shown && /\/invite\//.test(await projectLink.inputValue()));
    if (shown) {
      await projectSheet.getByRole("button", { name: "Open the project" }).click();
      record("…and then opens the project", await until(async () => /\/project\//.test(page.url()), 20000), page.url().replace(BASE, ""));
    }
  } catch (e) {
    record("New project shows the link of the person invited with it", false, (e as Error).message.split("\n")[0]);
  }
  try {
    await page.goto(`${BASE}/work`);
    await page.getByRole("button", { name: /^new$/i }).first().click({ timeout: 60000 });
    const taskSheet = page.getByRole("dialog", { name: "New Task" });
    await taskSheet.getByLabel("Short description", { exact: true }).fill("PPL Task With Invite");
    await taskSheet.getByLabel("Department", { exact: true }).selectOption({ index: 1 });
    await taskSheet.getByRole("button", { name: /someone not on orbit yet|add someone new/i }).first().click();
    await taskSheet.getByLabel(/^Name of /).first().fill("PPL Task Invitee");
    await taskSheet.getByLabel(/^Email for /).first().fill(at("task-invitee"));
    await taskSheet.getByRole("button", { name: "Submit" }).click();
    const taskLink = taskSheet.getByRole("textbox", { name: "Invite link for PPL Task Invitee" });
    const shownTask = await until(async () => taskLink.isVisible(), 20000);
    record("New Task shows the link of the person invited with it", shownTask && /\/invite\//.test(await taskLink.inputValue()));
    if (shownTask) {
      await taskSheet.getByRole("button", { name: "Open the task" }).click();
      record("…and then opens the task", await until(async () => /\/work\/\d+/.test(page.url()), 20000), page.url().replace(BASE, ""));
    }
  } catch (e) {
    record("New Task shows the link of the person invited with it", false, (e as Error).message.split("\n")[0]);
  }

  /* ---- Account: your own name, changed twice ---- */
  const self = await signInPage(browser, at("dev"), PASSWORD);
  await self.page.goto(`${BASE}/settings/account`);
  const mine = self.page.getByRole("textbox", { name: "Your name" });
  try {
    await mine.fill("PPL Dev Renamed", { timeout: 60000 });
    await self.page.getByRole("button", { name: "Save your name" }).click();
    const first = await until(async () => (await nameOf(at("dev"))) === "PPL Dev Renamed");
    await mine.fill("PPL Dev Again");
    await self.page.getByRole("button", { name: "Save your name" }).click();
    const second = await until(async () => (await nameOf(at("dev"))) === "PPL Dev Again");
    record("Account renames you, and renames you again", first && second, (await nameOf(at("dev"))) ?? "");
  } catch (e) {
    record("Account renames you, and renames you again", false, (e as Error).message.split("\n")[0]);
  }

  /* ---- on a phone ---- */
  const phone = await signInPage(browser, "founder@orbit.local", "orbit123", true);
  await phone.page.goto(`${BASE}/project/${slug}`);
  await phone.page.getByRole("button", { name: "Add people" }).first().click({ timeout: 90000 });
  const phoneRow = phone.page.getByLabel("Name of new person 1", { exact: true });
  await phoneRow.scrollIntoViewIfNeeded({ timeout: 20000 }).catch(() => undefined);
  const box = await phoneRow.boundingBox();
  record("on a phone the new-person rows fit the screen", Boolean(box && box.x >= 0 && box.x + box.width <= 390), box ? `x ${Math.round(box.x)}, width ${Math.round(box.width)}` : "not found");

  const errors = [...desk.errors, ...self.errors, ...phone.errors];
  record("no console errors", errors.length === 0, errors.slice(0, 3).join(" | ").slice(0, 400));
}

main()
  .catch((e) => {
    console.error(e);
    fail++;
  })
  .finally(async () => {
    await browser?.close().catch(() => undefined);
    await cleanup().catch((e) => console.error("cleanup:", e));
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  });
