import { chromium } from "playwright";
import { generateKeyBetween } from "fractional-indexing";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const BASE = process.env.ORBIT_BASE ?? "http://localhost:3000";
const PRE = "unt-";
const p = new PrismaClient();
async function teardown() {
  const dept = await p.department.findMany({ where: { name: PRE + "Dept" }, select: { id: true } });
  const projs = await p.project.findMany({ where: { slug: { startsWith: PRE } }, select: { id: true } });
  await p.task.deleteMany({ where: { projectId: { in: projs.map((x) => x.id) } } });
  await p.projectMember.deleteMany({ where: { projectId: { in: projs.map((x) => x.id) } } });
  await p.project.deleteMany({ where: { slug: { startsWith: PRE } } });
  await p.department.deleteMany({ where: { id: { in: dept.map((x) => x.id) } } });
  await p.user.deleteMany({ where: { email: { startsWith: PRE } } });
}

async function main() {
  await teardown();
  const lead = await p.user.create({ data: { email: PRE + "lead@orbit.local", name: "Lead", role: "TEAM_LEAD", status: "ACTIVE", passwordHash: await hashPassword("leadpass12345") } });
  const dept = await p.department.create({ data: { name: PRE + "Dept", color: "#4f7cff", orderKey: generateKeyBetween(null, null), createdById: lead.id } });
  const slug = PRE + "proj";
  const project = await p.project.create({ data: { name: "Untitled Test Project", slug, color: "#4f7cff", orderKey: generateKeyBetween(null, null), departmentId: dept.id, leadId: lead.id, description: "test" } });
  const existing = await p.task.create({ data: { projectId: project.id, title: "Existing task", status: "BACKLOG", priority: "P2", dueDate: new Date("2026-09-20"), dueProvisional: false, orderKey: generateKeyBetween(null, null) } });

  const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: lead.email, password: "leadpass12345" }) });
  const cookie = (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");
  type Row = { id: string; parentId: string | null; title: string };
  const count = async (): Promise<Row[]> => {
    const r = await fetch(`${BASE}/api/tasks?projectId=${project.id}`, { headers: { cookie: `orbit_session=${cookie}` } });
    return (await r.json()) as Row[];
  };
  // Poll the SERVER (not the optimistic cache) until it settles — the first create/delete
  // compiles its route cold, so a fixed wait would race it; real use never does.
  const waitFor = async (pred: (rows: Row[]) => boolean, ms = 15000): Promise<Row[]> => {
    const t0 = Date.now();
    let rows = await count();
    while (!pred(rows) && Date.now() - t0 < ms) { await new Promise((r) => setTimeout(r, 300)); rows = await count(); }
    return rows;
  };

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: "orbit_session", value: cookie, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  const results: string[] = [];
  const check = (name: string, ok: boolean, detail: string) => { results.push(`${ok ? "PASS" : "FAIL"}  ${name} ${detail}`); };

  const listUrl = (r: { url(): string; request(): { method(): string }; status(): number }) => r.url().includes(`/api/tasks?projectId=${project.id}`) && r.request().method() === "GET" && r.status() === 200;

  // ── A) Board "+" then close without naming → discarded ──
  await page.goto(`${BASE}/t/${slug}/board`, { waitUntil: "domcontentloaded" });
  await page.waitForResponse(listUrl, { timeout: 40000 }); // task list loaded → cache warm
  await page.getByRole("button", { name: "Add a task to Backlog" }).first().waitFor({ timeout: 40000 });
  const before = (await count()).length;
  await page.getByRole("button", { name: "Add a task to Backlog" }).first().click();
  await page.getByRole("dialog").waitFor({ timeout: 10000 });
  await page.waitForFunction(() => !!new URLSearchParams(location.search).get("task"), { timeout: 10000 }); // panel settled on the new row
  const landed = await waitFor((r) => r.length === before + 1); // create reached the server
  const during = landed.length;
  await page.waitForTimeout(300); // a human looks at the row before closing
  await page.keyboard.press("Escape");
  const afterA = await waitFor((r) => r.length === before); // discard reached the server
  check("board '+' then Escape discards the untitled task", afterA.length === before, `(before=${before} during=${during} after=${afterA.length})`);

  // ── B) Board "+", NAME it, then close → kept ──
  await page.getByRole("button", { name: "Add a task to Backlog" }).first().click();
  await page.getByRole("dialog").waitFor({ timeout: 10000 });
  await waitFor((r) => r.length === before + 1); // let the create land before naming
  await page.locator("#detail-title").fill("A real board task");
  await page.keyboard.press("Enter"); // commits the title (blur)
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape");
  const afterB = await waitFor((r) => r.some((t) => t.title === "A real board task"));
  check("board '+' with a name is KEPT", afterB.some((t) => t.title === "A real board task"), `(count=${afterB.length})`);

  const subs = (rows: Row[]) => rows.filter((t) => t.parentId === existing.id);

  // ── C) "Add subtask" then close without naming → discarded ──
  await page.goto(`${BASE}/t/${slug}?task=${existing.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForResponse(listUrl, { timeout: 40000 });
  await page.getByRole("button", { name: "Add subtask" }).waitFor({ timeout: 40000 });
  await page.getByRole("button", { name: "Add subtask" }).click();
  await page.waitForFunction((eid) => new URLSearchParams(location.search).get("task") !== eid, existing.id, { timeout: 10000 }); // panel navigated to the new subtask
  const subLanded = await waitFor((r) => subs(r).length === 1);
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  const subAfterC = await waitFor((r) => subs(r).length === 0);
  check("'Add subtask' then Escape discards the untitled subtask", subs(subAfterC).length === 0, `(during=${subs(subLanded).length} after=${subs(subAfterC).length})`);

  // ── D) "Add subtask", NAME it, then close → kept ──
  await page.goto(`${BASE}/t/${slug}?task=${existing.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForResponse(listUrl, { timeout: 40000 });
  await page.getByRole("button", { name: "Add subtask" }).waitFor({ timeout: 40000 });
  await page.getByRole("button", { name: "Add subtask" }).click();
  await page.waitForFunction((eid) => new URLSearchParams(location.search).get("task") !== eid, existing.id, { timeout: 10000 });
  await page.getByRole("dialog").waitFor({ timeout: 10000 });
  await waitFor((r) => subs(r).length === 1);
  await page.locator("#detail-title").fill("A real subtask");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape");
  const subAfterD = await waitFor((r) => subs(r).some((t) => t.title === "A real subtask"));
  check("'Add subtask' with a name is KEPT", subs(subAfterD).some((t) => t.title === "A real subtask"), `(count=${subs(subAfterD).length})`);

  // ── E) Tree "New task" left untitled → discarded on blur ──
  await page.goto(`${BASE}/t/${slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForResponse(listUrl, { timeout: 40000 });
  await page.getByRole("button", { name: "New task" }).first().waitFor({ timeout: 40000 });
  const roots = (rows: Row[]) => rows.filter((t) => t.parentId === null);
  const treeBefore = roots(await count()).length;
  await page.getByRole("button", { name: "New task" }).first().click();
  await waitFor((r) => roots(r).length === treeBefore + 1); // row reached the server
  await page.waitForTimeout(300);
  await page.getByText(/press Enter on any task/).click(); // blur the untitled row
  const treeAfterE = await waitFor((r) => roots(r).length === treeBefore);
  check("tree 'New task' left untitled is discarded on blur", roots(treeAfterE).length === treeBefore, `(before=${treeBefore} after=${roots(treeAfterE).length})`);

  // ── F) Tree "New task", NAME it, then blur → kept ──
  await page.getByRole("button", { name: "New task" }).first().click();
  await waitFor((r) => roots(r).length === treeBefore + 1);
  await page.keyboard.type("A real tree task");
  await page.waitForTimeout(500); // debounced title flush
  await page.getByText(/press Enter on any task/).click(); // blur (also flushes the title)
  const treeAfterF = await waitFor((r) => r.some((t) => t.title === "A real tree task"));
  check("tree 'New task' with a name is KEPT", treeAfterF.some((t) => t.title === "A real tree task"), `(count=${roots(treeAfterF).length})`);

  await ctx.close();
  await browser.close();
  await teardown();
  console.log(results.join("\n"));
  console.log(results.every((r) => r.startsWith("PASS")) ? "\nALL PASS" : "\nSOME FAILED");
  await p.$disconnect();
}
main().catch(async (e) => { console.error("ERR", e); await teardown().catch(() => {}); await p.$disconnect(); process.exit(1); });
