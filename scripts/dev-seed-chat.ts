/* Put conversation on the seeded tasks (2026-09-09), so a demo shows work being
 * talked about rather than a wall of empty records.
 *   npx tsx --env-file=.env.local scripts/dev-seed-chat.ts          (local)
 *   SCREEN_BASE=https://… npx tsx --env-file=.env scripts/dev-seed-chat.ts
 *
 * Notes are written by the people actually on each task — its holder answers,
 * its head replies — through the API, so every mention, bell and activity row
 * happens exactly as it would for a person. Idempotent: a task that already has
 * notes is left alone. Undo with --undo.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PASSWORD = "orbit123";
const MARK = "​"; // an invisible mark, so --undo can find only these

/** What people actually say on a task, in the order they say it. */
const SCRIPTS: string[][] = [
  ["Picked this up — starting with the parts we already agreed.", "First pass is done, sending it over for a look.", "Looks good from my side. Anything else before I close it?"],
  ["Had a question on scope: does this include the older records too?", "Ignore the older ones for now — this quarter only.", "Understood, carrying on with that."],
  ["Blocked until the vendor comes back to us. Chasing them today.", "Thanks for flagging. Give them until Friday, then escalate.", "They replied — unblocked, back on it."],
  ["This one is bigger than it looked. I may need another day.", "Take the day. Better right than fast.", "Done, and tested twice."],
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

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  return res.ok ? (res.headers.get("set-cookie") ?? "").split(";")[0] : "";
}

async function undo() {
  const gone = await prisma.taskActivity.deleteMany({ where: { body: { contains: MARK } } });
  console.log(`removed ${gone.count} seeded notes`);
}

async function main() {
  if (process.argv.includes("--undo")) return undo();

  // The demo projects, and the people who can speak on their tasks.
  const projects = await prisma.project.findMany({
    where: { name: { in: ["Careers Portal v2", "Mobile App Release", "Office Move", "Quarterly Close", "Delivery Reliability", "Resume Parsing Engine", "Risk Register 2026", "Hiring Drive Q4", "Network Hardening"] } },
    select: { id: true, name: true, departmentId: true },
  });
  if (projects.length === 0) throw new Error("no seeded projects — run dev-seed-work.ts first");

  const cookies = new Map<string, string>();
  const as = async (email: string) => {
    if (!cookies.has(email)) cookies.set(email, await signIn(email));
    return cookies.get(email) ?? "";
  };

  let wrote = 0;
  let n = 0;

  for (const project of projects) {
    // The two people this script can actually speak as: the department's own
    // head and its lead. A task's holder may be a real account whose password
    // nobody here knows, so the conversation is between the two who run it.
    const [head, lead] = await Promise.all([
      prisma.user.findFirst({ where: { departmentId: project.departmentId, role: { in: ["HOD", "MANAGER"] }, email: { startsWith: "staff-" }, passwordHash: { not: null } }, select: { email: true } }),
      prisma.user.findFirst({ where: { departmentId: project.departmentId, role: { in: ["TEAM_LEAD", "RESOURCE"] }, email: { startsWith: "staff-" }, passwordHash: { not: null } }, select: { email: true } }),
    ]);
    if (!head || !lead) continue;
    const tasks = await prisma.task.findMany({
      where: { projectId: project.id, deletedAt: null },
      select: { id: true, title: true },
      orderBy: { createdAt: "asc" },
    });

    for (const t of tasks) {
      // Anything already talked about is left alone.
      const talked = await prisma.taskActivity.count({ where: { taskId: t.id, type: { in: ["COMMENT", "WORK_NOTE"] } } });
      if (talked > 0) continue;

      const lines = SCRIPTS[n % SCRIPTS.length];
      n++;

      for (const [i, line] of lines.entries()) {
        // The lead speaks first and last; the head answers in the middle.
        const speaker = i === 1 ? head.email : lead.email;
        const cookie = await as(speaker);
        if (!cookie) continue;
        const said = await call(cookie, "POST", `/api/tasks/${t.id}/comments`, { body: `${line}${MARK}` });
        if (said.status === 201) wrote++;
      }
    }
  }

  console.log(`\n${wrote} notes written across ${projects.length} projects`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
