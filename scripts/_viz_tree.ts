import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { generateKeyBetween } from "fractional-indexing";
import { PrismaClient, type Prisma } from "@prisma/client";
import { hashPassword } from "../lib/password";
import { DEFAULT_GATE_TEMPLATE } from "../lib/gates";

const BASE = "http://localhost:3009";
const OUT = "records/evidence/phase47";
const PRE = "tree-";
const p = new PrismaClient();
const iso = (daysFromNow: number) => { const d = new Date(); d.setDate(d.getDate() + daysFromNow); return d; };
const gates = (doneKeys: string[]): Prisma.InputJsonValue => DEFAULT_GATE_TEMPLATE.map((g) => ({ ...g, done: doneKeys.includes(g.key), at: doneKeys.includes(g.key) ? new Date().toISOString() : null })) as unknown as Prisma.InputJsonValue;

async function teardown() {
  const projs = await p.project.findMany({ where: { slug: { startsWith: PRE } }, select: { id: true } });
  const ids = projs.map((x) => x.id);
  if (ids.length) { await p.taskNote.deleteMany({ where: { task: { projectId: { in: ids } } } }); await p.task.deleteMany({ where: { projectId: { in: ids } } }); await p.projectMember.deleteMany({ where: { projectId: { in: ids } } }); }
  await p.project.deleteMany({ where: { slug: { startsWith: PRE } } });
  await p.department.deleteMany({ where: { name: PRE + "Dept" } });
  await p.user.deleteMany({ where: { email: { startsWith: PRE } } });
}

async function main() {
  await teardown();
  await mkdir(OUT, { recursive: true });
  const mgr = await p.user.create({ data: { email: PRE + "mgr@orbit.local", name: "Priya Manager", role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword("mgrpass12345") } });
  const lead = await p.user.create({ data: { email: PRE + "lead@orbit.local", name: "Sam Lead", role: "TEAM_LEAD", status: "ACTIVE", passwordHash: await hashPassword("leadpass12345") } });
  const dev = await p.user.create({ data: { email: PRE + "dev@orbit.local", name: "Dev One", role: "RESOURCE", status: "ACTIVE", passwordHash: await hashPassword("devpass123456") } });
  const dept = await p.department.create({ data: { name: PRE + "Dept", color: "#4f7cff", orderKey: generateKeyBetween(null, null), createdById: mgr.id } });
  const slug = PRE + "proj";
  const project = await p.project.create({ data: { name: "Payments Platform", slug, color: "#4f7cff", orderKey: generateKeyBetween(null, null), departmentId: dept.id, leadId: lead.id, ownerId: mgr.id, description: "Core payments", gateTemplate: DEFAULT_GATE_TEMPLATE as unknown as Prisma.InputJsonValue } });
  await p.projectMember.create({ data: { projectId: project.id, userId: dev.id } });

  let k = generateKeyBetween(null, null);
  const nextKey = () => { const cur = k; k = generateKeyBetween(cur, null); return cur; };
  type T = { id: string };
  const mk = async (title: string, parentId: string | null, o: Partial<Prisma.TaskCreateInput> & { status?: string; priority?: string; due?: Date | null; prov?: boolean; tags?: string[]; desc?: string; gateKeys?: string[]; assigneeId?: string }): Promise<T> => {
    return p.task.create({ data: {
      projectId: project.id, parentId, title, orderKey: nextKey(),
      status: (o.status ?? "BACKLOG") as any, priority: (o.priority ?? "P2") as any,
      dueDate: o.due ?? null, dueProvisional: o.prov ?? false, tags: o.tags ?? [],
      descriptionMd: o.desc ?? "", gates: gates(o.gateKeys ?? []), assigneeId: o.assigneeId ?? null,
    }, select: { id: true } });
  };

  // Root A — a real, busy task (priority, date, gates, tags, description, note) + a deep branch.
  const A = await mk("Payment reconciliation service", null, { status: "IN_PROGRESS", priority: "P0", due: iso(9), tags: ["backend", "urgent"], desc: "Reconcile settled vs captured across processors nightly.", gateKeys: ["built", "reviewed"], assigneeId: dev.id });
  await p.taskNote.create({ data: { taskId: A.id, authorId: lead.id, body: "Blocked on the processor sandbox creds — chasing." } });
  const A1 = await mk("Signature verification", A.id, { status: "IN_PROGRESS", priority: "P1", due: iso(5) });
  const A1a = await mk("Add replay-window check", A1.id, { status: "BLOCKED", priority: "P0", due: iso(3) });
  await mk("Handle clock skew across regions", A1a.id, { status: "BACKLOG", due: iso(-4), tags: ["edge"] }); // overdue (deepest)
  await mk("Idempotency keys", A.id, { status: "DONE", gateKeys: ["built", "reviewed", "tested", "deployed", "verified"] });
  await mk("Backfill last quarter", A.id, { status: "ON_HOLD", priority: "P2", due: iso(20) });

  // Root B — duplicate names living in a DIFFERENT branch (per the spec's note).
  const B = await mk("Fraud rules engine", null, { status: "BACKLOG", priority: "P1", due: iso(14), assigneeId: lead.id });
  await mk("Signature verification", B.id, { status: "BACKLOG", due: iso(12) });
  await mk("Add replay-window check", B.id, { status: "IN_PROGRESS", due: iso(7), tags: ["rules"] });

  const cookie = async (email: string, pw: string) => { const a = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: pw }) }); return (a.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("="); };
  const lv = await cookie(lead.email, "leadpass12345"), mv = await cookie(mgr.email, "mgrpass12345");

  const browser = await chromium.launch();
  const shot = async (name: string, path: string, cv: string, w: number, opts: { clipH?: number } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: opts.clipH ?? 1100 }, deviceScaleFactor: 1.25 });
    await ctx.addCookies([{ name: "orbit_session", value: cv, domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForResponse((r) => r.url().includes(`/api/tasks?projectId=`) && r.status() === 200, { timeout: 40000 }).catch(() => {});
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    await ctx.close();
  };
  await shot("p47-tree-lead-1440", `/t/${slug}`, lv, 1440);
  await shot("p47-tree-lead-390", `/t/${slug}`, lv, 390);
  await shot("p47-tree-manager-1440", `/t/${slug}`, mv, 1440);
  await shot("p47-panel-1440", `/t/${slug}?task=${A.id}`, lv, 1440);
  await shot("p47-panel-390", `/t/${slug}?task=${A.id}`, lv, 390);

  await browser.close();
  await teardown();
  console.log("tree shots written + torn down");
  await p.$disconnect();
}
main().catch(async (e) => { console.error("ERR", e); await teardown().catch(() => {}); await p.$disconnect(); process.exit(1); });
