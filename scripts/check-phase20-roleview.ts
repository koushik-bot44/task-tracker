/**
 * Phase 20 — the manager's simplified task view.
 *
 * This is a PRESENTATION gate, not a data or permission change: the task DTO
 * still carries gates, deliverable, links and tags for everyone; the manager's
 * UI simply doesn't render the team's working detail. So the test proves two
 * things at two layers:
 *
 *  1. RENDERING (Playwright, real compiled UI): a MANAGER's detail panel hides
 *     the build-gate checklist, the deliverable link, the links list and tags,
 *     and shows ONLY a standalone "Mark verified" sign-off; a manager's tree row
 *     drops the gate cluster for a Verified chip and hides tags. A DEVELOPER (and
 *     a TEAM_LEAD) still see all of it — nothing changed for them.
 *
 *  2. SERVER (fetch): the presentation gate rides on top of the phase-11 rule
 *     that was already there — a manager's Verified PATCH still 200s, a dev's
 *     build-gate tick still 200s, and the wrong-role tick is still refused (403).
 *     This phase touched no endpoint; that's the point of asserting it.
 *
 * Throwaway p20t- actors only; hard teardown; runs against the live dev server.
 */
import { chromium, type Browser } from "playwright";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";
import { VERIFIED_GATE_KEY } from "../lib/gates";

const BASE = "http://localhost:3000";
const PREFIX = "p20t-";
const SLUG = "p20t-proj";
const prisma = new PrismaClient();

let pass = 0,
  fail = 0;
function rec(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(52)} got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

const BASELINE_GATES = [
  { key: "built", label: "Built", done: true, at: "2026-07-30T10:00:00.000Z" },
  { key: "reviewed", label: "Reviewed", done: true, at: "2026-07-30T11:00:00.000Z" },
  { key: "tested", label: "Tested", done: false, at: null },
  { key: "deployed", label: "Deployed", done: false, at: null },
  { key: VERIFIED_GATE_KEY, label: "Verified", done: false, at: null },
];
const flip = (key: string, done: boolean) =>
  BASELINE_GATES.map((g) => (g.key === key ? { ...g, done, at: done ? "2026-07-30T12:00:00.000Z" : null } : g));

async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in ${email}: ${res.status}`);
  return (res.headers.get("set-cookie") ?? "").match(/orbit_session=([^;]+)/)?.[1] ?? "";
}
const cookieHeader = (v: string) => `orbit_session=${v}`;
async function patchGates(cookie: string, taskId: string, gates: unknown) {
  const res = await fetch(`${BASE}/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: cookieHeader(cookie) },
    body: JSON.stringify({ gates }),
  });
  return res.status;
}

/** Hard teardown, by slug / dept-name / prefix, so it runs even if a run throws. */
async function cleanup() {
  await prisma.taskNote.deleteMany({ where: { task: { project: { slug: SLUG } } } });
  await prisma.task.deleteMany({ where: { project: { slug: SLUG } } });
  await prisma.projectMember.deleteMany({ where: { project: { slug: SLUG } } });
  await prisma.project.deleteMany({ where: { slug: SLUG } });
  await prisma.department.deleteMany({ where: { name: "P20T Dept" } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

async function main() {
  // ── rig ──
  const mk = async (label: string, role: "MANAGER" | "TEAM_LEAD" | "RESOURCE") => {
    const email = `${PREFIX}${label}@orbit.local`.toLowerCase();
    const password = "Rig@Phase20t!";
    const u = await prisma.user.upsert({
      where: { email },
      update: { passwordHash: await hashPassword(password), role, status: "ACTIVE", disabledAt: null },
      create: { email, name: `P20T ${label}`, role, passwordHash: await hashPassword(password), status: "ACTIVE" },
    });
    return { id: u.id, email, password, cookie: await login(email, password) };
  };
  await cleanup(); // clean any prior residue first

  const M = await mk("mgr", "MANAGER");
  const L = await mk("lead", "TEAM_LEAD");
  const V = await mk("dev", "RESOURCE");
  const dept = await prisma.department.create({ data: { name: "P20T Dept", color: "#0369a1", orderKey: "a0", createdById: M.id } });
  const project = await prisma.project.create({
    data: { name: "P20T Project", slug: SLUG, color: "#2f68f0", orderKey: "a0", description: "d", ownerId: M.id, leadId: L.id, departmentId: dept.id, gateTemplate: [] },
  });
  await prisma.projectMember.createMany({ data: [{ projectId: project.id, userId: V.id }, { projectId: project.id, userId: L.id }] });
  const task = await prisma.task.create({
    data: {
      projectId: project.id, title: "Ship the onboarding flow", descriptionMd: "Wire it up.",
      status: "IN_PROGRESS", priority: "P1", orderKey: "a0", dueDate: new Date("2026-08-15T00:00:00.000Z"),
      gates: BASELINE_GATES, tags: ["backend", "urgent"], links: [{ label: "Design spec", url: "https://example.com/spec" }],
      deliverableUrl: "https://example.com/build", assigneeId: V.id,
    },
  });
  await prisma.task.create({ data: { projectId: project.id, parentId: task.id, title: "Backend endpoints", status: "DONE", priority: "P2", orderKey: "a0", gates: [] } });
  const resetGates = () => prisma.task.update({ where: { id: task.id }, data: { gates: BASELINE_GATES } });

  // ── (2) SERVER: the phase-11 rule this presentation gate rides on, unchanged ──
  console.log("── server: gate-tick authorization (endpoints untouched) ──");
  await resetGates();
  rec("manager Verified PATCH -> 200", await patchGates(M.cookie, task.id, flip(VERIFIED_GATE_KEY, true)), 200);
  await resetGates();
  rec("dev build-gate (tested) PATCH -> 200", await patchGates(V.cookie, task.id, flip("tested", true)), 200);
  await resetGates();
  rec("lead build-gate (deployed) PATCH -> 200", await patchGates(L.cookie, task.id, flip("deployed", true)), 200);
  await resetGates();
  rec("manager build-gate (tested) PATCH -> 403", await patchGates(M.cookie, task.id, flip("tested", true)), 403);
  await resetGates();
  rec("dev Verified PATCH -> 403", await patchGates(V.cookie, task.id, flip(VERIFIED_GATE_KEY, true)), 403);
  await resetGates();

  // ── (1) RENDERING: role-branched presentation in the real compiled UI ──
  console.log("\n── rendering: manager panel/tree trimmed, dev/lead unchanged ──");
  const browser: Browser = await chromium.launch();
  const panelPath = `/t/${SLUG}?task=${task.id}`;
  const treePath = `/t/${SLUG}`;
  const count = (page: import("playwright").Page, sel: string) => page.locator(sel).count();
  // One context per role: the first navigation warms the app bundle AND the
  // React Query cache, so the panel/tree loads within it are fast. A reload-retry
  // absorbs a cold first paint against the shared dev DB.
  const pageFor = async (cookieVal: string) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    await ctx.addCookies([{ name: "orbit_session", value: cookieVal, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
    return { ctx, page: await ctx.newPage() };
  };
  const go = async (page: import("playwright").Page, path: string) => {
    // domcontentloaded, NOT networkidle: the app keeps a poll open, so the
    // network never goes idle. And we wait on the due-date PILL, not the title —
    // the title renders inside an <input>, whose value is invisible to text
    // selectors; the date is real visible text that proves the row rendered.
    for (let attempt = 0; ; attempt++) {
      try {
        await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForSelector("text=15/08/2026", { timeout: 45000 });
        await page.waitForTimeout(800);
        return;
      } catch (e) {
        if (attempt >= 2) throw new Error(`could not load ${path} (url ${page.url()}): ${(e as Error).message}`);
      }
    }
  };

  try {
    // MANAGER — panel trimmed, tree row shows Verified chip only
    {
      const { ctx, page } = await pageFor(M.cookie);
      await go(page, panelPath);
      rec("MGR panel: gates checklist hidden", await page.getByText(/Gates \(/).count(), 0);
      rec("MGR panel: Deliverable hidden", await page.getByText("Deliverable link").count(), 0);
      rec("MGR panel: Links field hidden", await page.getByText("Links", { exact: true }).count(), 0);
      rec("MGR panel: Tags field hidden", await page.getByText("Tags", { exact: true }).count(), 0);
      rec("MGR panel: Colour field hidden", await page.getByText("Colour", { exact: true }).count(), 0);
      rec("MGR panel: standalone 'Mark verified' shown", (await page.getByText("Mark verified").count()) >= 1, true);
      rec("MGR panel: Notes kept", (await page.getByText("Notes", { exact: true }).count()) >= 1, true);
      await go(page, treePath);
      rec("MGR tree: gate cluster hidden", await count(page, '[aria-label$="gates passed"]'), 0);
      rec("MGR tree: Verified chip shown", (await count(page, '[aria-label="Not yet verified"]')) >= 1, true);
      rec("MGR tree: tags hidden", await page.getByText("backend", { exact: true }).count(), 0);
      await ctx.close();
    }
    // DEVELOPER — unchanged (full panel + full tree row)
    {
      const { ctx, page } = await pageFor(V.cookie);
      await go(page, panelPath);
      rec("DEV panel: gates checklist shown", (await page.getByText(/Gates \(/).count()) >= 1, true);
      rec("DEV panel: Deliverable shown", (await page.getByText("Deliverable link").count()) >= 1, true);
      rec("DEV panel: Links field shown", (await page.getByText("Links", { exact: true }).count()) >= 1, true);
      rec("DEV panel: Tags field shown", (await page.getByText("Tags", { exact: true }).count()) >= 1, true);
      rec("DEV panel: Colour field shown", (await page.getByText("Colour", { exact: true }).count()) >= 1, true);
      rec("DEV panel: no standalone 'Mark verified'", await page.getByText("Mark verified").count(), 0);
      await go(page, treePath);
      rec("DEV tree: gate cluster shown", (await count(page, '[aria-label$="gates passed"]')) >= 1, true);
      rec("DEV tree: tags shown", (await page.getByText("backend", { exact: true }).count()) >= 1, true);
      await ctx.close();
    }
    // TEAM_LEAD — unchanged (full panel), proves no regression for leads
    {
      const { ctx, page } = await pageFor(L.cookie);
      await go(page, panelPath);
      rec("LEAD panel: gates checklist shown", (await page.getByText(/Gates \(/).count()) >= 1, true);
      rec("LEAD panel: Deliverable shown", (await page.getByText("Deliverable link").count()) >= 1, true);
      rec("LEAD panel: no standalone 'Mark verified'", await page.getByText("Mark verified").count(), 0);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  // ── teardown ──
  await cleanup();
  const residue = (await prisma.user.count({ where: { email: { startsWith: PREFIX } } })) + (await prisma.project.count({ where: { slug: SLUG } }));
  console.log(`\nresidue -> ${residue}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0 || residue) process.exit(1);
}
main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
