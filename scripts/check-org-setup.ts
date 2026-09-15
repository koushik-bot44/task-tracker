/* A new organisation sets itself up (2026-09-11).
 *   npx tsx --env-file=.env.local scripts/check-org-setup.ts      (dev server up, on the clone)
 *
 * From the state production starts in — the CEO and the default departments,
 * nobody else — the CEO and the people they bring in do what a new organisation
 * does first. On the screens where it matters, checked through the API:
 *   - the CEO's Today shows "Set up your organisation";
 *   - People → Invite: six people in one go, each with a position or none, placed
 *     or not; a link each; the head of department heads their department at once;
 *   - the invitees set passwords from their links and are signed in; a used,
 *     replaced or switched-off link says so;
 *   - a team with a lead and a member; a project with a lead, people, and a new
 *     person invited as a team lead; Add people invites two more with positions;
 *   - a manager raises a task for a member and for a new person, work in
 *     progress at once; the project's lead runs the project;
 *   - each role sees what it should, and nothing more;
 *   - heads follow positions both ways; a head or manager places people only in
 *     what they run; a department with people isn't deleted; nobody resets their
 *     own password from People; your own sign-in email changes with your password;
 *   - Today lists a task with no project, and its + opens New Task;
 *   - once all is set up the set-up card goes; a phone fits.
 * Everything made ("orgrig-…@example.com", "ORG …") is removed at the end, and
 * every table is recounted to prove the run left no trace.
 */
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";

if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "")) {
  console.error("DATABASE_URL is not the local clone. Refusing.");
  process.exit(1);
}

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const CEO_EMAIL = process.env.CEO_EMAIL ?? "founder@orbit.local";
const CEO_PASSWORD = process.env.CEO_PASSWORD ?? "orbit123";
const PASSWORD = "Rig-Org-Setup-2026";
const PREFIX = "ORG ";
const mail = (key: string) => `orgrig-${key}@example.com`;

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
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}
const opened = (l: Locator, timeout = 15000) => l.first().waitFor({ timeout }).then(() => true).catch(() => false);
const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 200);
const token = (url: string) => url.split("/invite/")[1] ?? "";

type Res = { status: number; json: any; cookie: string | null };
async function api(cookie: string | null | undefined, method: string, path: string, body?: unknown): Promise<Res> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  const set = res.headers.get("set-cookie");
  return { status: res.status, json, cookie: set && set.startsWith("orbit_session=") ? set.split(";")[0] : null };
}
async function signIn(email: string, password: string): Promise<string | null> {
  return (await api(null, "POST", "/api/auth", { email, password })).cookie;
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

async function cleanup(started: Date | null, ceoId: string | null, heads: Map<string, string | null>) {
  const ids = (await prisma.user.findMany({ where: { email: { startsWith: "orgrig-" } }, select: { id: true } })).map((u) => u.id);
  const projectIds = (await prisma.project.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } })).map((p) => p.id);
  const taskIds = (
    await prisma.task.findMany({
      where: { OR: [{ title: { startsWith: PREFIX, mode: "insensitive" } }, { projectId: { in: projectIds } }, { assigneeId: { in: ids } }, { requesterId: { in: ids } }, { givenById: { in: ids } }] },
      select: { id: true },
    })
  ).map((t) => t.id);
  const eventIds = (await prisma.calendarEvent.findMany({ where: { OR: [{ createdById: { in: ids } }, { taskId: { in: taskIds } }] }, select: { id: true } })).map((e) => e.id);
  await prisma.eventAttendee.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.calendarEvent.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { taskId: { in: taskIds } }, ...(started && ceoId ? [{ userId: ceoId, createdAt: { gte: started } }] : [])] } });
  await prisma.commentAttachment.deleteMany({ where: { activity: { taskId: { in: taskIds } } } });
  await prisma.taskActivity.deleteMany({ where: { taskId: { in: taskIds } } });
  await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  await prisma.comment.deleteMany({ where: { OR: [{ targetId: { in: projectIds } }, { authorId: { in: ids } }] } });
  await prisma.projectMember.deleteMany({ where: { OR: [{ projectId: { in: projectIds } }, { userId: { in: ids } }] } });
  await prisma.milestone.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.assignmentGroupMember.deleteMany({ where: { OR: [{ userId: { in: ids } }, { group: { name: { startsWith: PREFIX } } }] } });
  await prisma.assignmentGroup.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.department.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.invite.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdById: { in: ids } }] } });
  if (started) await prisma.loginAttempt.deleteMany({ where: { createdAt: { gte: started } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  for (const [id, hodId] of heads) await prisma.department.update({ where: { id }, data: { hodId } }).catch(() => undefined);
}

let browser: Browser | null = null;
const consoleErrors: string[] = [];
const serverErrors: string[] = [];
function watch(page: Page) {
  page.on("console", (m) => {
    // A dead invite link or a refused action answers 4xx on purpose; those are checked, not errors.
    if (m.type() === "error" && !/status of 4\d\d/.test(m.text())) consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url().replace(BASE, "")}`);
  });
}
async function pageAs(cookie: string, phone = false): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser!.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
  const eq = cookie.indexOf("=");
  await ctx.addCookies([{ name: cookie.slice(0, eq), value: cookie.slice(eq + 1), url: BASE }]);
  const page = await ctx.newPage();
  watch(page);
  return { ctx, page };
}

const PEOPLE = [
  { key: "head", name: "Rig Head", position: "Head of department", role: "HOD", department: "Operations" },
  { key: "manager", name: "Rig Manager", position: "Manager", role: "MANAGER", department: "Operations" },
  { key: "lead", name: "Rig Lead", position: "Team lead", role: "TEAM_LEAD", department: "Operations" },
  { key: "member", name: "Rig Member", position: null, role: "RESOURCE", department: "Operations" },
  { key: "outsider", name: "Rig Outsider", position: null, role: "RESOURCE", department: "Development" },
  { key: "floater", name: "Rig Floater", position: null, role: "RESOURCE", department: null },
] as const;

async function journey(ceo: string, ceoId: string, dept: (name: string) => string) {
  const idOf = async (key: string) => (await prisma.user.findUnique({ where: { email: mail(key) }, select: { id: true } }))?.id ?? "";
  const headOf = async (name: string) => (await prisma.department.findUnique({ where: { id: dept(name) }, select: { hodId: true } }))?.hodId ?? null;
  const links = new Map<string, string>();
  const cookies = new Map<string, string>();

  browser = await chromium.launch();
  const desk = await pageAs(ceo);
  const page = desk.page;

  /* ---- Today: the set-up card ---- */
  await page.goto(`${BASE}/`);
  const card = page.getByRole("region", { name: "Set up your organisation" });
  record("the CEO's Today shows Set up your organisation", await opened(card, 90000));
  record("…with nothing done yet", await until(async () => (await card.innerText()).includes("0 of 5 done"), 15000), (await card.innerText().catch(() => "")).split("\n").slice(0, 2).join(" / "));

  /* ---- People → Invite: six at once ---- */
  try {
    await page.goto(`${BASE}/people`);
    await page.getByRole("button", { name: "Invite", exact: true }).click({ timeout: 90000 });
    const sheet = page.getByRole("dialog", { name: "Invite people" });
    record("People → Invite opens Invite people", await opened(sheet));
    const offered = await sheet.getByLabel("Position for new person 1", { exact: true }).locator("option").allInnerTexts();
    record("the CEO can give every position but CEO and admin", offered.join("|") === "Assignee|Head of department|Manager|Team lead|Team member", offered.join(", "));
    for (const [i, p] of PEOPLE.entries()) {
      const n = i + 1;
      if (i > 0) await sheet.getByRole("button", { name: "+ Another person", exact: true }).click();
      await sheet.getByLabel(`Email for new person ${n}`, { exact: true }).fill(mail(p.key));
      if (p.position) await sheet.getByLabel(`Position for new person ${n}`, { exact: true }).selectOption({ label: p.position });
      if (p.department) await sheet.getByLabel(`Department for new person ${n}`, { exact: true }).selectOption({ label: p.department });
      await sheet.getByLabel(`Name of new person ${n}`, { exact: true }).fill(p.name);
    }
    const send = sheet.getByRole("button", { name: "Send 6 invites", exact: true });
    record("…six people make one button, Send 6 invites", await send.isEnabled().catch(() => false));
    await send.click();
    const result = page.getByRole("dialog", { name: "6 people invited" });
    record("People → Invite sends six invites in one go", await opened(result, 30000));
    for (const p of PEOPLE) {
      const url = await result.getByLabel(`Invite link for ${p.name}`, { exact: true }).inputValue({ timeout: 5000 }).catch(() => "");
      if (url) links.set(p.key, url);
    }
    record("…and shows each person their own set-password link", links.size === 6 && [...links.values()].every((u) => /\/invite\/[A-Za-z0-9_-]{20,}$/.test(u)), `${links.size} links`);
    await result.getByRole("button", { name: "Done", exact: true }).click();
  } catch (e) {
    record("People → Invite on the screen", false, firstLine(e));
  }
  // Whatever the screen did not do, the API does, so the rest of the journey still runs.
  for (const p of PEOPLE) {
    if (links.has(p.key)) continue;
    const id = await idOf(p.key);
    const r = id
      ? await api(ceo, "POST", `/api/users/${id}/resend`, { email: false })
      : await api(ceo, "POST", "/api/users/invite", { people: [{ name: p.name, emails: [mail(p.key)], role: p.role, departmentId: p.department ? dept(p.department) : null }] });
    const url = r.json?.inviteUrl ?? r.json?.people?.[0]?.url;
    if (url) links.set(p.key, url);
  }

  const invited = await prisma.user.findMany({ where: { email: { in: PEOPLE.map((p) => mail(p.key)) } }, select: { email: true, role: true, status: true, departmentId: true } });
  const row = (key: string) => invited.find((u) => u.email === mail(key));
  record("each has the position given, or Team member when none was", PEOPLE.every((p) => row(p.key)?.role === p.role), invited.map((u) => `${u.email.split("@")[0]}:${u.role}`).join(" "));
  record("…is in the department chosen, or none", PEOPLE.every((p) => row(p.key)?.departmentId === (p.department ? dept(p.department) : null)));
  record("…and stays Invited until the link is used", invited.length === 6 && invited.every((u) => u.status === "PENDING"));
  record("the person invited as Head of department heads Operations at once", (await headOf("Operations")) === (await idOf("head")));

  await page.goto(`${BASE}/`);
  record("Today's set-up card ticks people and heads", await until(async () => (await card.innerText()).includes("2 of 5 done"), 20000), (await card.innerText().catch(() => "")).split("\n")[1] ?? "");

  /* ---- The invitees set their passwords ---- */
  for (const key of ["head", "member"]) {
    const name = PEOPLE.find((p) => p.key === key)!.name;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    watch(pg);
    try {
      await pg.goto(links.get(key)!);
      await pg.getByLabel("New password", { exact: true }).fill(PASSWORD, { timeout: 60000 });
      await pg.getByLabel("Repeat password", { exact: true }).fill(PASSWORD);
      await pg.getByRole("button", { name: "Set password & sign in" }).click();
      const landed = await pg.waitForURL((u) => !u.pathname.startsWith("/invite"), { timeout: 60000 }).then(() => true).catch(() => false);
      const c = (await ctx.cookies()).find((x) => x.name === "orbit_session");
      if (c) cookies.set(key, `orbit_session=${c.value}`);
      record(`${name} sets a password from the link on a phone and is signed in`, landed && Boolean(c));
    } catch (e) {
      record(`${name} sets a password from the link`, false, firstLine(e));
    }
    await ctx.close();
  }
  for (const p of PEOPLE) {
    if (cookies.has(p.key)) continue;
    const r = await api(null, "POST", `/api/invite/${token(links.get(p.key) ?? "")}/accept`, { password: PASSWORD });
    if (r.cookie) cookies.set(p.key, r.cookie);
  }
  record("every invitee is signed in with their own password", PEOPLE.every((p) => cookies.has(p.key)), `${cookies.size} of 6`);
  const headMe = await api(cookies.get("head"), "GET", "/api/users/me");
  record("…the head's account says Head of department, in Operations", headMe.json?.role === "HOD" && headMe.json?.departmentId === dept("Operations"));

  const usedCtx = await browser.newContext();
  const usedPage = await usedCtx.newPage();
  await usedPage.goto(links.get("head")!);
  record("a link already used says so", await opened(usedPage.getByRole("heading", { name: "This invite was already used" }), 30000));
  const usedAgain = await api(null, "POST", `/api/invite/${token(links.get("head")!)}/accept`, { password: PASSWORD });
  record("…and can't be used again", usedAgain.status === 410 && usedAgain.json?.state === "consumed", `${usedAgain.status} ${usedAgain.json?.state}`);
  await usedCtx.close();

  /* ---- A team ---- */
  try {
    await page.goto(`${BASE}/people`);
    const ops = page.getByRole("region", { name: "Operations", exact: true });
    await ops.getByRole("button", { name: "Team", exact: true }).click({ timeout: 60000 });
    const teamSheet = page.getByRole("dialog", { name: "New team" });
    await teamSheet.getByLabel("Team name", { exact: true }).fill("ORG Support");
    await teamSheet.getByLabel("Lead", { exact: true }).selectOption({ label: "Rig Lead" });
    await teamSheet.getByRole("checkbox", { name: "Rig Member", exact: true }).check();
    await teamSheet.getByRole("button", { name: "Save", exact: true }).click();
  } catch (e) {
    record("People → + Team on the screen", false, firstLine(e));
  }
  let team = null as null | { id: string; leadId: string | null; members: { userId: string }[] };
  await until(async () => Boolean((team = await prisma.assignmentGroup.findFirst({ where: { name: "ORG Support" }, select: { id: true, leadId: true, members: { select: { userId: true } } } }))), 15000);
  if (!team) {
    const r = await api(ceo, "POST", "/api/assignment-groups", { departmentId: dept("Operations"), name: "ORG Support", leadId: await idOf("lead"), memberIds: [await idOf("member")] });
    record("…(made through the API instead)", r.status === 201, `status ${r.status}`);
    team = await prisma.assignmentGroup.findFirst({ where: { name: "ORG Support" }, select: { id: true, leadId: true, members: { select: { userId: true } } } });
  }
  const teamLead = await idOf("lead");
  const teamMember = await idOf("member");
  record("a team is made in Operations with a lead and a member", Boolean(team && team.leadId === teamLead && team.members.some((m) => m.userId === teamMember)));

  /* ---- A project, with a new person invited as a team lead ---- */
  try {
    await page.goto(`${BASE}/projects`);
    await page.getByRole("button", { name: "New project" }).first().click({ timeout: 60000 });
    const np = page.getByRole("dialog", { name: "New project" });
    await np.getByLabel("Project name", { exact: true }).fill("ORG Launch");
    await np.getByLabel("Department", { exact: true }).selectOption({ label: "Operations" });
    await np.getByLabel("Lead", { exact: true }).selectOption({ label: "Rig Manager" });
    await np.getByRole("checkbox", { name: "Rig Lead", exact: true }).check();
    await np.getByRole("checkbox", { name: "Rig Member", exact: true }).check();
    await np.getByRole("button", { name: "+ Someone not on Orbit yet", exact: true }).click();
    await np.getByLabel("Email for new person 1", { exact: true }).fill(mail("contractor"));
    await np.getByLabel("Position for new person 1", { exact: true }).selectOption({ label: "Team lead" });
    await np.getByLabel("Name of new person 1", { exact: true }).fill("Rig Contractor");
    await np.getByRole("button", { name: "Save", exact: true }).click();
    const url = await np.getByLabel("Invite link for Rig Contractor", { exact: true }).inputValue({ timeout: 30000 }).catch(() => "");
    if (url) links.set("contractor", url);
    record("New project shows the new person's link", Boolean(url));
    await np.getByRole("button", { name: "Open the project" }).click({ timeout: 5000 }).catch(() => undefined);
  } catch (e) {
    record("New project on the screen", false, firstLine(e));
  }
  let project = await prisma.project.findFirst({ where: { name: "ORG Launch" }, select: { id: true, slug: true, leadId: true, departmentId: true } });
  if (!project) {
    const r = await api(ceo, "POST", "/api/projects", { name: "ORG Launch", departmentId: dept("Operations"), leadId: await idOf("manager"), memberIds: [await idOf("lead"), await idOf("member")], invites: [{ name: "Rig Contractor", emails: [mail("contractor")], role: "TEAM_LEAD" }] });
    record("…(made through the API instead)", r.status === 201, `status ${r.status} ${r.json?.error ?? ""}`);
    if (r.json?.links?.[0]?.url) links.set("contractor", r.json.links[0].url);
    project = await prisma.project.findFirst({ where: { name: "ORG Launch" }, select: { id: true, slug: true, leadId: true, departmentId: true } });
  }
  if (!project) throw new Error("no project to go on with");
  const members = await api(ceo, "GET", `/api/projects/${project.id}/members`);
  const onIt = (name: string) => (members.json ?? []).find((p: any) => p.name === name);
  const contractor = await prisma.user.findUnique({ where: { email: mail("contractor") }, select: { role: true, departmentId: true, status: true } });
  record("the project is in Operations, led by the manager", project.departmentId === dept("Operations") && project.leadId === (await idOf("manager")));
  record("…with the lead and the member on it", Boolean(onIt("Rig Lead") && onIt("Rig Member")));
  record("…and the new person on it as an invited team lead, placed in Operations", Boolean(onIt("Rig Contractor")?.invited) && contractor?.role === "TEAM_LEAD" && contractor?.departmentId === dept("Operations") && contractor?.status === "PENDING");

  /* ---- Add people: two more, one as a manager, one with no position given ---- */
  try {
    await page.goto(`${BASE}/project/${project.slug}`);
    await page.getByRole("button", { name: "Add people" }).first().click({ timeout: 60000 });
    const ap = page.getByRole("dialog", { name: "Add people" });
    record("Add people lists the invited contractor", await opened(ap.getByText("Rig Contractor"), 15000));
    await ap.getByLabel("Email for new person 1", { exact: true }).fill(mail("analyst"));
    await ap.getByLabel("Position for new person 1", { exact: true }).selectOption({ label: "Manager" });
    await ap.getByLabel("Name of new person 1", { exact: true }).fill("Rig Analyst");
    await ap.getByRole("button", { name: "+ Another person", exact: true }).click();
    await ap.getByLabel("Email for new person 2", { exact: true }).fill(mail("intern"));
    await ap.getByLabel("Name of new person 2", { exact: true }).fill("Rig Intern");
    await ap.getByRole("button", { name: "Send 2 invites", exact: true }).click();
    for (const [key, name] of [["analyst", "Rig Analyst"], ["intern", "Rig Intern"]] as const) {
      const url = await ap.getByLabel(`Invite link for ${name}`, { exact: true }).inputValue({ timeout: 30000 }).catch(() => "");
      if (url) links.set(key, url);
    }
    await page.keyboard.press("Escape");
  } catch (e) {
    record("Add people on the screen", false, firstLine(e));
  }
  const analyst = await prisma.user.findUnique({ where: { email: mail("analyst") }, select: { id: true, role: true, departmentId: true } });
  const intern = await prisma.user.findUnique({ where: { email: mail("intern") }, select: { id: true, role: true, departmentId: true } });
  const onProject = async (userId: string | undefined) => Boolean(userId && (await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: project!.id, userId } } })));
  record(
    "Add people invites two at once: a manager, and one left a Team member",
    analyst?.role === "MANAGER" && intern?.role === "RESOURCE" && (await onProject(analyst?.id)) && (await onProject(intern?.id)) && links.has("analyst") && links.has("intern"),
    `${analyst?.role ?? "none"} / ${intern?.role ?? "none"}`,
  );

  await page.goto(`${BASE}/`);
  record("Today's set-up card ticks the team and the project", await until(async () => (await card.innerText()).includes("4 of 5 done"), 20000), (await card.innerText().catch(() => "")).split("\n")[1] ?? "");

  /* ---- The manager raises a task for a member and a new person ---- */
  const mgr = await pageAs(cookies.get("manager")!);
  try {
    await mgr.page.goto(`${BASE}/work`);
    await mgr.page.getByRole("button", { name: "New", exact: true }).click({ timeout: 90000 });
    const nw = mgr.page.getByRole("dialog", { name: "New Task" });
    await nw.getByLabel("Short description", { exact: true }).fill("ORG first task");
    await until(async () => (await nw.getByLabel("Project", { exact: true }).locator("option").allInnerTexts()).includes("ORG Launch"), 20000);
    await nw.getByLabel("Project", { exact: true }).selectOption({ label: "ORG Launch" });
    await nw.getByRole("checkbox", { name: "Rig Member", exact: true }).check();
    await nw.getByRole("button", { name: "+ Someone not on Orbit yet", exact: true }).click();
    const offered = await nw.getByLabel("Position for new person 1", { exact: true }).locator("option").allInnerTexts();
    record("a manager can give Team lead or Team member, nothing higher", offered.join("|") === "Team lead|Team member", offered.join(", "));
    await nw.getByLabel("Email for new person 1", { exact: true }).fill(mail("temp"));
    await nw.getByLabel("Name of new person 1", { exact: true }).fill("Rig Temp");
    await nw.getByRole("button", { name: "Submit", exact: true }).click();
    const url = await nw.getByLabel("Invite link for Rig Temp", { exact: true }).inputValue({ timeout: 30000 }).catch(() => "");
    if (url) links.set("temp", url);
    record("New Task shows the new person's link after raising", Boolean(url));
  } catch (e) {
    record("New Task on the screen", false, firstLine(e));
  }
  let raised = await prisma.task.findMany({ where: { title: { startsWith: "ORG first", mode: "insensitive" } }, select: { id: true, number: true, state: true, assigneeId: true, siblingKey: true, projectId: true } });
  if (!raised.length) {
    const r = await api(cookies.get("manager"), "POST", "/api/tasks", { title: "ORG first task", departmentId: dept("Operations"), projectId: project.id, assigneeId: await idOf("member") });
    record("…(raised through the API instead)", r.status === 201, `status ${r.status} ${r.json?.error ?? ""}`);
    raised = await prisma.task.findMany({ where: { title: { startsWith: "ORG first", mode: "insensitive" } }, select: { id: true, number: true, state: true, assigneeId: true, siblingKey: true, projectId: true } });
  }
  const memberId = await idOf("member");
  const tempId = await idOf("temp");
  const memberTask = raised.find((t) => t.assigneeId === memberId);
  record(
    "one record each for the member and the new person, both work in progress, on the project, tied together",
    raised.length === 2 && raised.every((t) => t.state === "IN_PROGRESS" && t.projectId === project!.id) && Boolean(memberTask) && raised.some((t) => t.assigneeId === tempId) && Boolean(raised[0].siblingKey) && raised[0].siblingKey === raised[1]?.siblingKey,
    raised.map((t) => `#${t.number} ${t.state}`).join(", "),
  );

  /* ---- The project's lead runs it ---- */
  await mgr.page.goto(`${BASE}/project/${project.slug}`);
  record("the project's lead sees Add people", await opened(mgr.page.getByRole("button", { name: "Add people" }), 60000));
  const leadAdds = await api(cookies.get("manager"), "POST", `/api/projects/${project.id}/members`, { userId: await idOf("floater") });
  record("…and can add someone to it", leadAdds.status === 200 || leadAdds.status === 201, `status ${leadAdds.status} ${leadAdds.json?.error ?? ""}`);

  /* ---- The member's day ---- */
  if (memberTask) {
    const mem = await pageAs(cookies.get("member")!);
    await mem.page.goto(`${BASE}/`);
    record("the member's Today lists the task", await until(async () => (await mem.page.locator("main").innerText()).toLowerCase().includes("org first task"), 60000));
    const mine = await api(cookies.get("member"), "GET", "/api/work?mine=assigned&rows=tasks&open=true&limit=50");
    record("…and so does Your work", (mine.json?.items ?? []).some((t: any) => t.id === memberTask.id), `status ${mine.status}`);
    await mem.page.goto(`${BASE}/work/${memberTask.number}`);
    // The Status field is a read-only box: its words are its value, not text on the page.
    record("…whose record reads Work in progress", await until(async () => mem.page.locator("input").evaluateAll((els) => els.some((e) => (e as HTMLInputElement).value.startsWith("Work in progress"))), 60000));
    await mem.ctx.close();
  }

  /* ---- A task with no project, on Today; Today's + ---- */
  const standalone = await api(ceo, "POST", "/api/tasks", { title: "ORG standalone task", departmentId: dept("Development"), assigneeId: await idOf("outsider") });
  record("the CEO gives a task with no project to someone in Development", standalone.status === 201, `status ${standalone.status} ${standalone.json?.error ?? ""}`);
  const outToday = await api(cookies.get("outsider"), "GET", "/api/today");
  record("Today lists a task with no project for the person holding it", (outToday.json?.tasks ?? []).some((t: any) => t.id === standalone.json?.id));
  const out = await pageAs(cookies.get("outsider")!);
  await out.page.goto(`${BASE}/`);
  await out.page.getByRole("button", { name: "Add a task" }).click({ timeout: 60000 }).catch(() => undefined);
  record("Today's + opens New Task, which needs no project", await opened(out.page.getByRole("dialog", { name: "New Task" }), 20000));
  await out.ctx.close();

  /* ---- Who sees what ---- */
  if (memberTask) {
    const see = async (who: string, cookie: string | null | undefined, id: string) => (await api(cookie, "GET", `/api/tasks/${id}`)).status;
    for (const [who, key] of [["the CEO", null], ["the head of Operations", "head"], ["the manager who raised it", "manager"], ["the team lead on the project", "lead"], ["the member holding it", "member"]] as const) {
      const status = await see(who, key ? cookies.get(key) : ceo, memberTask.id);
      record(`${who} opens the Operations task`, status === 200, `status ${status}`);
    }
    const outsider = await see("", cookies.get("outsider"), memberTask.id);
    record("a member of Development can't open it", outsider === 404, `status ${outsider}`);
    const outProjects = await api(cookies.get("outsider"), "GET", "/api/projects");
    record("…nor sees the Operations project", !(outProjects.json ?? []).some((p: any) => p.id === project!.id));
    const outWork = await api(cookies.get("outsider"), "GET", "/api/work?rows=tasks&limit=200");
    record("…nor finds its task in Work", !(outWork.json?.items ?? []).some((t: any) => t.id === memberTask.id));
    const headProjects = await api(cookies.get("head"), "GET", "/api/projects");
    record("the head of Operations sees the project", (headProjects.json ?? []).some((p: any) => p.id === project!.id));
  }
  const headOnDev = await api(cookies.get("head"), "GET", `/api/tasks/${standalone.json?.id}`);
  record("the head of Operations can't open a Development task", headOnDev.status === 404, `status ${headOnDev.status}`);

  /* ---- A head runs their department ---- */
  const headTeam = await api(cookies.get("head"), "POST", "/api/assignment-groups", { departmentId: dept("Operations"), name: "ORG Night shift" });
  record("the head makes a team in Operations", headTeam.status === 201, `status ${headTeam.status} ${headTeam.json?.error ?? ""}`);
  const headTeamElsewhere = await api(cookies.get("head"), "POST", "/api/assignment-groups", { departmentId: dept("Development"), name: "ORG Not mine" });
  record("…but not in Development", headTeamElsewhere.status === 403, `status ${headTeamElsewhere.status}`);
  const headProject = await api(cookies.get("head"), "POST", "/api/projects", { name: "ORG Head project", departmentId: dept("Operations") });
  record("…and starts a project in Operations", headProject.status === 201, `status ${headProject.status} ${headProject.json?.error ?? ""}`);

  /* ---- Placement stays inside what a head or manager runs ---- */
  const r1 = await api(cookies.get("head"), "POST", "/api/users/invite", { people: [{ emails: [mail("x1")], departmentId: dept("Development") }] });
  record("a head can't invite someone into another department", r1.status === 403, `status ${r1.status}`);
  const r2 = await api(cookies.get("head"), "POST", "/api/users/invite", { people: [{ emails: [mail("x2")] }] });
  record("…nor leave them unplaced", r2.status === 400, `status ${r2.status}`);
  const r3 = await api(cookies.get("head"), "POST", "/api/users/invite", { people: [{ emails: [mail("x3")], role: "HOD", departmentId: dept("Operations") }] });
  record("…nor make another head", r3.status === 403, `status ${r3.status}`);
  const r4 = await api(cookies.get("manager"), "POST", "/api/users/invite", { people: [{ name: "Rig Helper", emails: [mail("helper")], departmentId: dept("Operations") }, { emails: [mail("helper2")], role: "HOD", departmentId: dept("Operations") }] });
  const helperMade = await prisma.user.count({ where: { email: { in: [mail("helper"), mail("helper2")] } } });
  record("a batch with one row a manager may not make is refused whole — nobody is made", r4.status === 403 && helperMade === 0, `status ${r4.status}, ${helperMade} made`);
  const r5 = await api(cookies.get("head"), "POST", "/api/users/invite", { people: [{ name: "Rig Hire", emails: [mail("hire")], role: "MANAGER", departmentId: dept("Operations") }] });
  record("a head invites a manager into Operations", r5.status === 201 && r5.json?.people?.[0]?.role === "MANAGER", `status ${r5.status} ${r5.json?.error ?? ""}`);
  const r6 = await api(cookies.get("manager"), "PATCH", `/api/users/${await idOf("floater")}`, { departmentId: dept("Development") });
  record("a manager can't move someone into another department", r6.status === 403, `status ${r6.status}`);

  /* ---- Heads follow positions, both ways ---- */
  const floater = await idOf("floater");
  await api(ceo, "PATCH", `/api/users/${floater}`, { role: "HOD", departmentId: dept("HR") });
  record("made Head of department in HR, they head HR", (await headOf("HR")) === floater);
  await api(ceo, "PATCH", `/api/users/${floater}`, { role: "RESOURCE" });
  record("…and no longer a head, HR has no head", (await headOf("HR")) === null);
  const head = await idOf("head");
  await api(ceo, "PATCH", `/api/users/${head}`, { departmentId: dept("Accounts") });
  record("a head moved to Accounts heads Accounts, and Operations has no head", (await headOf("Accounts")) === head && (await headOf("Operations")) === null);
  await api(ceo, "PATCH", `/api/users/${head}`, { departmentId: dept("Operations") });
  record("…and moved back, heads Operations again", (await headOf("Operations")) === head && (await headOf("Accounts")) === null);
  await api(ceo, "PATCH", `/api/users/${head}`, { disable: true });
  const whileOff = await headOf("Operations");
  await api(ceo, "PATCH", `/api/users/${head}`, { disable: false });
  record("a head switched off heads nothing; switched on, heads Operations again", whileOff === null && (await headOf("Operations")) === head);

  /* ---- A department with people isn't deleted ---- */
  // A throwaway department, so a broken rule can never take a real one with it.
  const temp = await api(ceo, "POST", "/api/departments", { name: "ORG Temp", color: "#475569" });
  const orgTempId: string = temp.json?.id ?? "";
  await api(ceo, "PATCH", `/api/users/${floater}`, { departmentId: orgTempId });
  const delFull = orgTempId ? await api(ceo, "DELETE", `/api/departments/${orgTempId}`) : { status: 0, json: null };
  record("a department with a person in it can't be deleted", temp.status === 201 && delFull.status === 409 && /person/.test(delFull.json?.error ?? ""), `${delFull.status} ${delFull.json?.error ?? ""}`);
  await api(ceo, "PATCH", `/api/users/${floater}`, { departmentId: null });
  const delEmpty = orgTempId ? await api(ceo, "DELETE", `/api/departments/${orgTempId}`) : { status: 0 };
  record("…once they're moved out, it can", delEmpty.status === 200, `status ${delEmpty.status}`);

  /* ---- Nobody resets their own password from People ---- */
  const selfReset = await api(ceo, "PATCH", `/api/users/${ceoId}`, { reset: true });
  const stillIn = await api(ceo, "GET", "/api/users/me");
  record("the CEO can't reset their own password from People, and stays signed in", selfReset.status === 403 && stillIn.status === 200, `${selfReset.status} / ${stillIn.status}`);

  /* ---- Links that were replaced, or whose account was switched off ---- */
  const contractorId = await idOf("contractor");
  const oldLink = links.get("contractor") ?? "";
  const fresh = await api(ceo, "POST", `/api/users/${contractorId}/resend`, { email: false });
  const oldTry = await api(null, "POST", `/api/invite/${token(oldLink)}/accept`, { password: PASSWORD });
  record("a replaced link is refused as not valid — never as already used", fresh.status === 200 && oldTry.status === 410 && oldTry.json?.state === "unknown", `${oldTry.status} ${oldTry.json?.state}`);
  const replacedCtx = await browser.newContext();
  const replacedPage = await replacedCtx.newPage();
  await replacedPage.goto(oldLink);
  record("…and its page says the link isn't valid", await opened(replacedPage.getByRole("heading", { name: "This link isn't valid" }), 30000));
  await replacedCtx.close();
  await api(ceo, "PATCH", `/api/users/${await idOf("intern")}`, { disable: true });
  const offTry = await api(null, "POST", `/api/invite/${token(links.get("intern") ?? "")}/accept`, { password: PASSWORD });
  record("a switched-off account's link is refused", offTry.status === 410 && /switched off/.test(offTry.json?.error ?? ""), `${offTry.status} ${offTry.json?.error ?? ""}`);

  /* ---- Your own sign-in email ---- */
  try {
    await mgr.page.goto(`${BASE}/settings/account`);
    const box = mgr.page.getByRole("textbox", { name: "Sign-in email", exact: true });
    await box.fill(mail("manager-new"), { timeout: 60000 });
    await mgr.page.getByLabel("Your password, to change your email", { exact: true }).fill("not-my-password");
    await mgr.page.getByRole("button", { name: "Save email", exact: true }).click();
    record("a wrong password leaves the sign-in email as it was", await opened(mgr.page.getByText("That is not your current password."), 15000));
    await mgr.page.getByLabel("Your password, to change your email", { exact: true }).fill(PASSWORD);
    await mgr.page.getByRole("button", { name: "Save email", exact: true }).click();
    record("with the right password, Account changes the sign-in email", await until(async () => (await prisma.user.count({ where: { email: mail("manager-new") } })) === 1, 20000));
  } catch (e) {
    record("Account → Sign-in email on the screen", false, firstLine(e));
  }
  record("…the new address signs in", Boolean(await signIn(mail("manager-new"), PASSWORD)));
  record("…the old one no longer does", !(await signIn(mail("manager"), PASSWORD)));
  const taken = await api(cookies.get("manager"), "POST", "/api/users/me/email", { email: mail("lead"), password: PASSWORD });
  record("…and someone else's address is refused", taken.status === 409, `status ${taken.status}`);
  await mgr.ctx.close();

  /* ---- Set up: the card goes ---- */
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(2500);
  record("with everything set up, Today's set-up card is gone", (await card.count()) === 0);

  /* ---- A phone fits ---- */
  const phone = await pageAs(ceo, true);
  for (const path of ["/", "/people", "/projects", "/work"]) {
    await phone.page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 90000 }).catch(() => undefined);
    await phone.page.waitForTimeout(1200);
    const width = await phone.page.evaluate(() => document.documentElement.scrollWidth);
    record(`on a phone ${path} fits the screen`, width <= 390, `${width}px`);
  }
  await phone.page.goto(`${BASE}/people`);
  await phone.page.getByRole("button", { name: "Invite", exact: true }).click({ timeout: 60000 }).catch(() => undefined);
  const box = await phone.page.getByRole("dialog", { name: "Invite people" }).boundingBox({ timeout: 15000 }).catch(() => null);
  record("…and so does Invite people", Boolean(box && box.x >= 0 && box.x + box.width <= 391), box ? `x ${Math.round(box.x)}, width ${Math.round(box.width)}` : "not open");
  await phone.ctx.close();
  await desk.ctx.close();
}

async function main() {
  const ceo = await signIn(CEO_EMAIL, CEO_PASSWORD);
  record("the CEO signs in", Boolean(ceo));
  if (!ceo) return;
  const ceoId: string = (await api(ceo, "GET", "/api/users/me")).json?.id ?? "";

  await cleanup(null, null, new Map()); // whatever a stopped run left behind
  const departments = await prisma.department.findMany({ select: { id: true, name: true, hodId: true } });
  const heads = new Map(departments.map((d) => [d.id, d.hodId] as const));
  const dept = (name: string) => {
    const d = departments.find((x) => x.name === name);
    if (!d) throw new Error(`no ${name} department`);
    return d.id;
  };
  record("the organisation starts with the default departments and no heads in the ones used", ["Operations", "Development", "HR", "Accounts"].every((n) => departments.some((d) => d.name === n && d.hodId === null)));
  const before = await countAll();
  const started = new Date();
  try {
    await journey(ceo, ceoId, dept);
  } catch (e) {
    record("the journey ran to the end", false, firstLine(e));
  } finally {
    await browser?.close().catch(() => undefined);
    record("no request answered 5xx", serverErrors.length === 0, serverErrors.slice(0, 4).join(" | "));
    record("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | ").slice(0, 400));
    await cleanup(started, ceoId, heads);
    const after = await countAll();
    const changed = Object.keys({ ...before, ...after }).filter((t) => before[t] !== after[t]);
    record("the run leaves no trace: every table holds what it held before", changed.length === 0, changed.map((t) => `${t} ${before[t]}→${after[t]}`).join(", "));
    const headsAfter = await prisma.department.findMany({ select: { id: true, hodId: true } });
    record("…and every department's head is as it was", headsAfter.every((d) => heads.get(d.id) === d.hodId));
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
