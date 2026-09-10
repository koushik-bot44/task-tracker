/* Who sees what (2026-09-10) — test plan section 2.
 *   npx tsx --env-file=.env.local scripts/check-role-access.ts   (dev server up)
 *
 * Signs in as each test login with a real browser, visits Today, Tasks,
 * Departments, People and one project each in HR, Accounts and ERM, and
 * photographs every screen. Then asks the API the same questions — including a
 * GET and a PATCH on a task outside the person's reach, and an attempt to
 * change the CEO's account. Read-only in effect: every PATCH re-sends the
 * current value, so even a wrongly allowed write changes nothing.
 *
 * "Expected" is written from the rules as stated (the plan, access.ts, the
 * schema's role comments), not by calling the code, so a disagreement between
 * the rules and what a person actually gets shows up as a finding.
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const DIR = "records/evidence/accounts-notify/2-access";
const PASSWORD = "orbit123";
mkdirSync(DIR, { recursive: true });

type Who = "ceo" | "cofounder" | "hrHead" | "accManager" | "accLead" | "accMember" | "ermMember";
const PEOPLE: { who: Who; email: string; ownDept: string | null }[] = [
  { who: "ceo", email: "founder@orbit.local", ownDept: null },
  { who: "cofounder", email: "salyush@orbit.local", ownDept: null },
  { who: "hrHead", email: "staff-hr-head@orbit.local", ownDept: "HR" },
  { who: "accManager", email: "staff-accounts-manager@orbit.local", ownDept: "Accounts" },
  { who: "accLead", email: "staff-accounts-lead@orbit.local", ownDept: "Accounts" },
  { who: "accMember", email: "staff-accounts-member-1@orbit.local", ownDept: "Accounts" },
  { who: "ermMember", email: "staff-erm-member-1@orbit.local", ownDept: "ERM" },
];
const PLACES = [
  { dept: "HR", slug: "hiring-drive-q4", taskNumber: 535 },
  { dept: "Accounts", slug: "quarterly-close", taskNumber: 300 },
  { dept: "ERM", slug: "risk-register-2026", taskNumber: 531 },
] as const;

const findings: string[] = [];
const rows: string[] = [];
function check(who: string, what: string, expected: string, actual: string, ok: boolean, evidence = "") {
  const line = `${ok ? "PASS" : "FAIL"}  ${who.padEnd(11)} ${what.padEnd(44)} expected: ${expected.padEnd(22)} actual: ${actual}${evidence ? `  [${evidence}]` : ""}`;
  rows.push(line);
  console.log(line);
  if (!ok) findings.push(line);
}

async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 });
}

async function visit(page: Page, path: string, shot: string) {
  await page.goto(BASE + path);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${DIR}/${shot}.png`, fullPage: true });
}

async function main() {
  const depts = await prisma.department.findMany({ select: { id: true, name: true } });
  const deptName = new Map(depts.map((d) => [d.id, d.name] as const));
  const ceo = await prisma.user.findFirst({ where: { role: "FOUNDER" }, select: { id: true, phone: true } });
  const places = await Promise.all(
    PLACES.map(async (p) => {
      const project = await prisma.project.findUnique({ where: { slug: p.slug }, select: { id: true, name: true } });
      const task = await prisma.task.findFirst({ where: { number: p.taskNumber }, select: { id: true, important: true, projectId: true, departmentId: true } });
      return { ...p, project: project!, task: task! };
    }),
  );

  const browser = await chromium.launch();

  for (const person of PEOPLE) {
    const user = await prisma.user.findUnique({ where: { email: person.email }, select: { id: true } });
    const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const page = await context.newPage();
    await signIn(page, person.email);
    const api = async (method: "GET" | "PATCH", path: string, data?: unknown) => {
      const r = method === "GET" ? await page.request.get(BASE + path) : await page.request.patch(BASE + path, { data });
      let json: any = null;
      try { json = await r.json(); } catch { /* empty */ }
      return { status: r.status(), json };
    };

    /* Today, and the tabs a person is offered. */
    await visit(page, "/", `${person.who}-today`);
    const tabs = await page.locator('aside nav[aria-label="Main"] a').allInnerTexts();
    const wellBeingTab = tabs.some((t) => /Well Being/.test(t));
    check(person.who, "Well Being tab on screen", person.who === "ceo" ? "shown" : "hidden", wellBeingTab ? "shown" : "hidden", wellBeingTab === (person.who === "ceo"), `${person.who}-today.png`);
    const routine = await api("GET", "/api/routine");
    const routineOpen = routine.status !== 403;
    check(person.who, "Well Being API (/api/routine)", person.who === "ceo" ? "open" : "403", String(routine.status), routineOpen === (person.who === "ceo"));

    /* Tasks. */
    await visit(page, "/work", `${person.who}-work`);
    const work = await api("GET", "/api/work?limit=1");
    rows.push(`INFO  ${person.who.padEnd(11)} tasks list total (default view): ${work.json?.total}`);

    /* Departments. */
    await visit(page, "/projects", `${person.who}-departments`);
    const deps = await api("GET", "/api/departments");
    const seenDepts: string[] = (deps.json ?? []).map((d: any) => d.name);
    const onProjects = await prisma.project.findMany({
      where: { OR: [{ members: { some: { userId: user!.id } } }, { leadId: user!.id }, { ownerId: user!.id }, { tasks: { some: { assigneeId: user!.id, deletedAt: null } } }] },
      select: { departmentId: true },
    });
    const deptsOfMyProjects = new Set(onProjects.map((p) => (p.departmentId ? deptName.get(p.departmentId) : null)).filter(Boolean) as string[]);
    const expectedDepts =
      person.who === "ceo" || person.who === "cofounder"
        ? depts.map((d) => d.name).sort()
        : [...new Set([person.ownDept!, ...deptsOfMyProjects])].sort();
    check(person.who, "departments listed", expectedDepts.join(","), [...seenDepts].sort().join(","), JSON.stringify([...seenDepts].sort()) === JSON.stringify(expectedDepts), `${person.who}-departments.png`);

    /* People. */
    await visit(page, "/people", `${person.who}-people`);
    const sections = await page.locator("main section[aria-label]").evaluateAll((els) =>
      els.map((e) => ({ label: e.getAttribute("aria-label") ?? "", empty: /Nobody is in/.test(e.textContent ?? "") })),
    );
    rows.push(`INFO  ${person.who.padEnd(11)} People sections on screen: ${sections.map((x) => x.label).join(", ")}`);
    // A section that says a department is empty must be telling the truth.
    for (const sec of sections.filter((x) => x.empty)) {
      const real = await prisma.user.count({ where: { department: { name: sec.label }, role: { notIn: ["PERSON", "ADMIN"] } } });
      check(person.who, `People · "${sec.label}" shown as empty`, "really empty", real === 0 ? "really empty" : `${real} people are in it`, real === 0, `${person.who}-people.png`);
    }

    /* One project and one task in each of HR, Accounts, ERM. */
    for (const place of places) {
      const onThis = await prisma.project.count({
        where: { id: place.project.id, OR: [{ members: { some: { userId: user!.id } } }, { leadId: user!.id }, { ownerId: user!.id }, { tasks: { some: { assigneeId: user!.id, deletedAt: null } } }] },
      });
      // The rule as stated: the CEO sees everything; the co-founder opens only
      // what he is on (owner, 2026-09-09); everyone else their own department
      // plus what they own, lead, belong to or hold.
      const shouldSee = person.who === "ceo" || (person.who === "cofounder" ? onThis > 0 : place.dept === person.ownDept || onThis > 0);

      await visit(page, `/project/${place.slug}`, `${person.who}-project-${place.dept}`);
      const heading = await page.locator("h1").allInnerTexts();
      const opened = heading.some((h) => h.trim() === place.project.name);
      check(person.who, `project page · ${place.dept}`, shouldSee ? "opens" : "stays closed", opened ? "opens" : "stays closed", opened === shouldSee, `${person.who}-project-${place.dept}.png`);

      const pApi = await api("GET", `/api/projects/${place.project.id}`);
      check(person.who, `GET project · ${place.dept}`, shouldSee ? "200" : "403 (or 404)", String(pApi.status), shouldSee ? pApi.status === 200 : pApi.status === 403 || pApi.status === 404);

      // A task is judged on its OWN project and department, not the project
      // visited above — the Accounts task sits in no project at all.
      const taskOnMine = place.task.projectId
        ? await prisma.project.count({ where: { id: place.task.projectId, OR: [{ members: { some: { userId: user!.id } } }, { leadId: user!.id }, { ownerId: user!.id }] } })
        : 0;
      const holdsIt = await prisma.task.count({ where: { id: place.task.id, OR: [{ assigneeId: user!.id }, { requesterId: user!.id }, { givenById: user!.id }] } });
      const taskDept = place.task.departmentId ? deptName.get(place.task.departmentId) : null;
      const shouldSeeTask = person.who === "ceo" || holdsIt > 0 || taskOnMine > 0 || (person.who !== "cofounder" && taskDept === person.ownDept);

      const tGet = await api("GET", `/api/tasks/${place.task.id}`);
      const tPatch = await api("PATCH", `/api/tasks/${place.task.id}`, { important: place.task.important });
      if (shouldSeeTask) {
        check(person.who, `GET task · ${place.dept}`, "200", String(tGet.status), tGet.status === 200);
        rows.push(`INFO  ${person.who.padEnd(11)} PATCH task · ${place.dept} (in reach; may still be refused if they cannot edit): ${tPatch.status}`);
      } else {
        // The plan: outside someone's reach must be 403 — never an empty 200.
        check(person.who, `GET task · ${place.dept} (out of reach)`, "403", String(tGet.status), tGet.status === 403);
        check(person.who, `PATCH task · ${place.dept} (out of reach)`, "403", String(tPatch.status), tPatch.status === 403);
      }
    }

    /* Nobody but the CEO changes the CEO's account. */
    if (person.who !== "ceo") {
      const touch = await api("PATCH", `/api/users/${ceo!.id}`, { phone: ceo!.phone });
      check(person.who, "PATCH the CEO's account", "403", String(touch.status), touch.status === 403);
    }

    await context.close();
  }

  await browser.close();
  writeFileSync("records/evidence/accounts-notify/2-access.txt", rows.join("\n") + `\n\n${findings.length} findings\n`);
  console.log(`\n${findings.length} findings — full table in records/evidence/accounts-notify/2-access.txt, screenshots in ${DIR}/`);
  await prisma.$disconnect();
  process.exit(findings.length ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
