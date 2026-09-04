import { chromium } from "playwright";
import { generateKeyBetween } from "fractional-indexing";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const BASE = "http://localhost:3009";
const PRE = "trint-";
const p = new PrismaClient();
async function teardown() {
  const projs = await p.project.findMany({ where: { slug: { startsWith: PRE } }, select: { id: true } });
  const ids = projs.map((x) => x.id);
  if (ids.length) await p.task.deleteMany({ where: { projectId: { in: ids } } });
  await p.project.deleteMany({ where: { slug: { startsWith: PRE } } });
  await p.department.deleteMany({ where: { name: PRE + "D" } });
  await p.user.deleteMany({ where: { email: { startsWith: PRE } } });
}

async function main() {
  await teardown();
  const lead = await p.user.create({ data: { email: PRE + "l@orbit.local", name: "Lead", role: "TEAM_LEAD", status: "ACTIVE", passwordHash: await hashPassword("leadpass12345") } });
  const dept = await p.department.create({ data: { name: PRE + "D", color: "#4f7cff", orderKey: generateKeyBetween(null, null), createdById: lead.id } });
  const slug = PRE + "proj";
  const project = await p.project.create({ data: { name: "Interact", slug, color: "#4f7cff", orderKey: generateKeyBetween(null, null), departmentId: dept.id, leadId: lead.id, description: "t" } });
  let k = generateKeyBetween(null, null); const nk = () => { const c = k; k = generateKeyBetween(c, null); return c; };
  const parent = await p.task.create({ data: { projectId: project.id, title: "Parent task", status: "IN_PROGRESS", dueDate: new Date(Date.now() + 9 * 864e5), orderKey: nk() }, select: { id: true } });
  const child = await p.task.create({ data: { projectId: project.id, parentId: parent.id, title: "Child task", status: "BACKLOG", dueDate: new Date(Date.now() + 5 * 864e5), orderKey: nk() }, select: { id: true } });

  const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: lead.email, password: "leadpass12345" }) });
  const cookie = (auth.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("=");
  const rows = async () => (await (await fetch(`${BASE}/api/tasks?projectId=${project.id}`, { headers: { cookie: `orbit_session=${cookie}` } })).json()) as { id: string; parentId: string | null; status: string }[];
  const waitFor = async (pred: (r: any[]) => boolean, ms = 12000) => { const t0 = Date.now(); let r = await rows(); while (!pred(r) && Date.now() - t0 < ms) { await new Promise((x) => setTimeout(x, 300)); r = await rows(); } return r; };

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "orbit_session", value: cookie, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  const out: string[] = [];
  const check = (n: string, ok: boolean, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n} ${d}`);

  await page.goto(`${BASE}/t/${slug}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForResponse((r) => r.url().includes("/api/tasks?projectId="), { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // 1) Collapse / expand
  const childRow = () => page.locator(`[data-task-id="${child.id}"]`);
  const parentRow = page.locator(`[data-task-id="${parent.id}"]`);
  await parentRow.getByRole("button", { name: "Collapse" }).click();
  await page.waitForTimeout(500);
  const hiddenAfterCollapse = (await childRow().count()) === 0;
  await parentRow.getByRole("button", { name: "Expand" }).click();
  await page.waitForTimeout(500);
  const shownAfterExpand = await childRow().isVisible();
  check("expand/collapse toggles children", hiddenAfterCollapse && shownAfterExpand, `(collapsed hid child=${hiddenAfterCollapse}, expand showed=${shownAfterExpand})`);

  // 2) Complete (click the child's checkbox)
  await childRow().getByRole("checkbox").click();
  const afterDone = await waitFor((r) => r.find((t) => t.id === child.id)?.status === "DONE");
  check("complete via checkbox persists DONE", afterDone.find((t) => t.id === child.id)?.status === "DONE");
  // undo it back
  await childRow().getByRole("checkbox").click();
  await waitFor((r) => r.find((t) => t.id === child.id)?.status !== "DONE");

  // 3) Open panel via the hover toolbar
  await parentRow.hover();
  await parentRow.getByRole("button", { name: /Open details/ }).first().click();
  await page.getByRole("dialog").waitFor({ timeout: 8000 });
  const panelOpen = await page.getByRole("dialog").isVisible();
  check("open panel from a row", panelOpen);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // 4) Add subtask via the hover toolbar
  const before = (await rows()).length;
  await parentRow.hover();
  await parentRow.getByRole("button", { name: "Add a subtask" }).click();
  const afterAdd = await waitFor((r) => r.length === before + 1);
  check("add subtask creates a child", afterAdd.length === before + 1, `(before=${before} after=${afterAdd.length})`);

  await ctx.close();
  await browser.close();
  await teardown();
  console.log(out.join("\n"));
  console.log(out.every((r) => r.startsWith("PASS")) ? "\nALL PASS" : "\nSOME FAILED");
  await p.$disconnect();
}
main().catch(async (e) => { console.error("ERR", String(e).slice(0, 300)); await teardown().catch(() => {}); await p.$disconnect(); process.exit(1); });
