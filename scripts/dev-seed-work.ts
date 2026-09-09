/* Fill the clone with work that looks like the company's (2026-09-09).
 *   npx tsx --env-file=.env.local scripts/dev-seed-work.ts   (dev server up)
 *
 * Every department gets projects named for what it actually does, each with
 * tasks across the types, priorities and states — some overdue, some unheld,
 * some given to several people at once — and real attachments with the words
 * that explain them, a few pinned. It goes through the API, so every rule,
 * notification and activity row fires exactly as it would for a person.
 *
 * Idempotent: a project whose name is already there is left alone.
 * Undo with --undo (removes only what this script names).
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const SEEDER = "seed-manager@orbit.local";
const SEEDER_PASSWORD = "Seed-Manager-42";

/** What each department is actually working on. */
const PLAN: Record<string, { project: string; tasks: { title: string; type: string; priority: string; due?: number; unheld?: boolean; crew?: number }[] }[]> = {
  Development: [
    { project: "Careers Portal v2", tasks: [
      { title: "Rebuild the openings page", type: "PROJECT_TASK", priority: "HIGH", due: 6 },
      { title: "Applicant tracking screen", type: "PROJECT_TASK", priority: "MEDIUM", due: 12, crew: 2 },
      { title: "Fix the résumé upload timeout", type: "ISSUE", priority: "CRITICAL", due: -2 },
      { title: "Search is slow on long lists", type: "ISSUE", priority: "MEDIUM", unheld: true },
      { title: "Sign off the staging build", type: "APPROVAL", priority: "HIGH", due: 3 },
    ] },
    { project: "Mobile App Release", tasks: [
      { title: "Push notification setup", type: "PROJECT_TASK", priority: "HIGH", due: 8 },
      { title: "Crash on the tasks list", type: "ISSUE", priority: "CRITICAL", due: -1 },
      { title: "Store listing and screenshots", type: "GENERAL", priority: "LOW", due: 20, crew: 2 },
    ] },
  ],
  Administration: [
    { project: "Office Move", tasks: [
      { title: "Floor plan for the new wing", type: "PROJECT_TASK", priority: "MEDIUM", due: 15 },
      { title: "Furniture quotes from three vendors", type: "REQUEST", priority: "MEDIUM", due: 9, crew: 2 },
      { title: "Approve the moving date", type: "APPROVAL", priority: "HIGH", due: 4 },
      { title: "Visitor badges are running out", type: "SUPPORT", priority: "LOW", unheld: true },
    ] },
  ],
  Accounts: [
    { project: "Quarterly Close", tasks: [
      { title: "Reconcile the vendor ledger", type: "PROJECT_TASK", priority: "HIGH", due: 5 },
      { title: "GST filing for the quarter", type: "PROJECT_TASK", priority: "CRITICAL", due: 2 },
      { title: "Approve the travel reimbursements", type: "APPROVAL", priority: "MEDIUM", due: 7, crew: 2 },
      { title: "Invoice mismatch on PO-2291", type: "ISSUE", priority: "HIGH", due: -3 },
    ] },
  ],
  Operations: [
    { project: "Delivery Reliability", tasks: [
      { title: "Weekly on-time report", type: "GENERAL", priority: "MEDIUM", due: 3 },
      { title: "Courier is missing pickups", type: "ISSUE", priority: "HIGH", due: -1, crew: 2 },
      { title: "Renew the warehouse contract", type: "REQUEST", priority: "MEDIUM", due: 25 },
    ] },
  ],
  "Research and Development": [
    { project: "Resume Parsing Engine", tasks: [
      { title: "Benchmark three parsing libraries", type: "PROJECT_TASK", priority: "HIGH", due: 10, crew: 3 },
      { title: "Label a thousand sample resumes", type: "GENERAL", priority: "MEDIUM", due: 18 },
      { title: "Accuracy drops on scanned PDFs", type: "ISSUE", priority: "HIGH", unheld: true },
    ] },
  ],
  ERM: [
    { project: "Risk Register 2026", tasks: [
      { title: "Refresh the top-ten risk list", type: "PROJECT_TASK", priority: "HIGH", due: 11 },
      { title: "Vendor security questionnaires", type: "REQUEST", priority: "MEDIUM", due: 14, crew: 2 },
      { title: "Sign off the business continuity plan", type: "APPROVAL", priority: "CRITICAL", due: 6 },
    ] },
  ],
  HR: [
    { project: "Hiring Drive Q4", tasks: [
      { title: "Job descriptions for four roles", type: "PROJECT_TASK", priority: "HIGH", due: 4, crew: 2 },
      { title: "Schedule the campus interviews", type: "GENERAL", priority: "MEDIUM", due: 13 },
      { title: "Offer letter template needs legal review", type: "APPROVAL", priority: "MEDIUM", due: 8 },
      { title: "Induction pack for new joiners", type: "GENERAL", priority: "LOW", unheld: true },
    ] },
  ],
  "Network Admins": [
    { project: "Network Hardening", tasks: [
      { title: "Rotate the VPN certificates", type: "PROJECT_TASK", priority: "CRITICAL", due: 1 },
      { title: "Wi-Fi drops in the east block", type: "ISSUE", priority: "HIGH", due: -4, crew: 2 },
      { title: "Quarterly firewall rule review", type: "GENERAL", priority: "MEDIUM", due: 21 },
    ] },
  ],
};

/** Files worth attaching, with the words that say what they are. */
const FILES = [
  { name: "requirements.txt", type: "text/plain", body: "Requirements\n\n1. Works on a phone.\n2. Loads in under two seconds.\n3. Nobody sees another team's data.\n", note: "The requirements as agreed in the review. Point 3 is the one that blocks release.", pin: true },
  { name: "review-notes.txt", type: "text/plain", body: "Review notes\n\n- Approved in principle.\n- Come back with costs before the 20th.\n", note: "What came out of the review meeting — read before the next one." },
  { name: "checklist.csv", type: "text/csv", body: "item,done\nspec agreed,yes\nbudget signed,no\nvendor picked,no\n", note: "Where each item stands. Two still open." },
];

async function call(cookie: string, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, json };
}

async function upload(cookie: string, f: (typeof FILES)[number]) {
  const form = new FormData();
  form.append("file", new File([f.body], f.name, { type: f.type }));
  const res = await fetch(`${BASE}/api/uploads`, { method: "POST", headers: { cookie }, body: form });
  return res.ok ? ((await res.json()) as { url: string; name: string; type: string }) : null;
}

const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const pick = <T,>(list: T[], i: number) => list[i % list.length];

async function undo() {
  const names = Object.values(PLAN).flat().map((p) => p.project);
  const projects = await prisma.project.findMany({ where: { name: { in: names } }, select: { id: true, name: true } });
  const ids = projects.map((p) => p.id);
  const tasks = await prisma.task.deleteMany({ where: { projectId: { in: ids } } });
  const gone = await prisma.project.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: SEEDER } });
  console.log(`removed ${gone.count} projects and ${tasks.count} tasks`);
}

async function main() {
  if (process.argv.includes("--undo")) return undo();

  const departments = await prisma.department.findMany({ select: { id: true, name: true } });
  const byName = new Map(departments.map((d) => [d.name, d.id] as const));

  // The seeder is a manager, so every rule that applies to a person applies here.
  const hash = await hashPassword(SEEDER_PASSWORD);
  const seeder = await prisma.user.upsert({
    where: { email: SEEDER },
    update: { passwordHash: hash, role: "MANAGER", status: "ACTIVE", disabledAt: null },
    create: { email: SEEDER, name: "Seed Manager", role: "MANAGER", passwordHash: hash, status: "ACTIVE" },
  });
  const signIn = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: SEEDER, password: SEEDER_PASSWORD }) });
  if (!signIn.ok) throw new Error(`seeder sign-in failed: ${signIn.status}`);
  const cookie = (signIn.headers.get("set-cookie") ?? "").split(";")[0];

  const people = await prisma.user.findMany({
    where: { disabledAt: null, status: "ACTIVE", role: { notIn: ["PERSON", "ADMIN"] }, id: { not: seeder.id } },
    select: { id: true, name: true, departmentId: true },
    orderBy: { createdAt: "asc" },
  });
  if (people.length === 0) throw new Error("nobody to give work to");

  let projects = 0;
  let tasks = 0;
  let crews = 0;
  let attached = 0;
  let n = 0;

  for (const [deptName, plans] of Object.entries(PLAN)) {
    const departmentId = byName.get(deptName);
    if (!departmentId) { console.log(`skip ${deptName} — no such department`); continue; }
    // Its own people first, so the work sits with the department it belongs to.
    const local = people.filter((p) => p.departmentId === departmentId);
    const crew = local.length ? local : people;

    for (const plan of plans) {
      const existing = await prisma.project.findFirst({ where: { name: plan.project }, select: { id: true } });
      let projectId = existing?.id;
      if (!projectId) {
        const made = await call(cookie, "POST", "/api/projects", {
          name: plan.project,
          departmentId,
          priority: "MEDIUM",
          leadId: crew[0]?.id ?? null,
          memberIds: crew.slice(0, 4).map((p) => p.id),
          startDate: iso(-14),
          deadline: iso(45),
        });
        if (made.status !== 201) { console.log(`  project ${plan.project} -> ${made.status} ${JSON.stringify(made.json?.error ?? "")}`); continue; }
        projectId = made.json.id;
        projects++;
        console.log(`${deptName}: ${plan.project}`);
      }

      for (const t of plan.tasks) {
        // Distinct people only — the same person twice is one person, not a crew.
        const wanted = Math.min(t.crew ?? 1, crew.length);
        const holders = t.unheld
          ? [null]
          : [...new Set(Array.from({ length: wanted }, (_, k) => pick(crew, n + k).id))];
        const siblingKey = holders.length > 1 ? `seed-${projectId}-${n}` : undefined;
        if (holders.length > 1) crews++;
        let firstId: string | null = null;
        for (const assigneeId of holders) {
          const made = await call(cookie, "POST", "/api/tasks", {
            title: t.title,
            type: t.type,
            priority: t.priority,
            projectId,
            departmentId,
            assigneeId,
            descriptionMd: `What is needed: ${t.title.toLowerCase()}. Raised while filling ${plan.project}.`,
            ...(t.due === undefined ? {} : { dueDate: iso(t.due) }),
            ...(siblingKey ? { siblingKey } : {}),
          });
          if (made.status === 201) { tasks++; firstId = firstId ?? made.json.id; }
        }
        n++;

        // Every third task carries a file, with the words that explain it.
        if (firstId && n % 3 === 0) {
          const f = pick(FILES, n);
          const up = await upload(cookie, f);
          if (up) {
            const row = await call(cookie, "POST", `/api/tasks/${firstId}/attachments`, {
              body: f.note,
              attachmentUrl: up.url,
              attachmentName: up.name,
              attachmentType: up.type,
            });
            if (row.status === 201) {
              attached++;
              if (f.pin) await call(cookie, "PATCH", `/api/tasks/${firstId}/attachments/${row.json.id}`, { pinned: true });
            }
          }
        }
      }
    }
  }

  console.log(`\n${projects} projects, ${tasks} tasks (${crews} given to several people), ${attached} files attached`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
