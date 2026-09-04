/**
 * A disposable tool carrying every state the dashboards can render, so the
 * charts, filters and pills are reviewed populated rather than empty.
 *
 * The owner's real data has two leads and seven dates — no assignees, no
 * provisional dates, no ON_HOLD — so the workload bars, the assignee filter,
 * the provisional pill and the On hold column cannot be judged from it. This
 * builds those states on purpose, and deletes itself afterwards.
 *
 * Created through the API as the shot manager, owned by the shot lead.
 * Everything is prefixed SS- and the whole tool is removed at teardown.
 *
 *   npx tsx --env-file=.env scripts/shot-sandbox.ts create
 *   npx tsx --env-file=.env scripts/shot-sandbox.ts remove
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const NAME = "SS- Shot Sandbox";

let cookie = "";

async function signIn(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
}

async function api<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const days = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

async function main() {
  if (process.argv.includes("remove")) {
    const gone = await prisma.project.deleteMany({ where: { name: NAME } });
    const stray = await prisma.task.count({ where: { title: { startsWith: "SS- " } } });
    console.log(
      `deleted ${gone.count} sandbox tool(s); remaining ${await prisma.project.count({ where: { name: NAME } })}, stray SS- tasks ${stray}`,
    );
    return;
  }

  await signIn(process.env.SHOT_MANAGER_EMAIL!, process.env.SHOT_MANAGER_PASSWORD!);

  const lead = await prisma.user.findUnique({ where: { email: "shot-lead@orbit.local" } });
  const dev = await prisma.user.findUnique({ where: { email: "shot-dev@orbit.local" } });
  const mgr = await prisma.user.findUnique({ where: { email: "shot-manager@orbit.local" } });
  if (!lead || !dev || !mgr) throw new Error("run scripts/roles-fixture.ts create first");

  const project = await api<{ id: string; slug: string }>("/api/projects", "POST", {
    name: NAME,
    description:
      "Disposable tool used to review the dashboards against every state they can render — overdue and at-risk dates, a provisional estimate, work on hold, three people carrying load, and a long enough list to overflow. Deleted at the end of the run.",
    leadId: lead.id,
  });

  /* Deliberately spread: every status incl. ON_HOLD, overdue / at-risk /
     comfortable / provisional / undated dates, three assignees plus unassigned,
     and one very long title to test the truncation law. */
  const ROOTS: Array<{
    title: string;
    status: string;
    due: number | null;
    provisional?: boolean;
    who: string | null;
    kids?: number;
  }> = [
    { title: "SS- Migrate the ingest queue to the new broker", status: "IN_PROGRESS", due: -4, who: dev.id, kids: 3 },
    { title: "SS- Harden webhook retries", status: "IN_PROGRESS", due: 2, who: dev.id, kids: 2 },
    { title: "SS- Retire the legacy exporter", status: "ON_HOLD", due: 21, who: lead.id },
    { title: "SS- Consolidate the delivery-receipt pipeline and remove the shim", status: "PLANNED", due: 9, provisional: true, who: lead.id, kids: 2 },
    { title: "SS- Ship the audit log", status: "DONE", due: -12, who: dev.id },
    { title: "SS- Backfill historical deliveries", status: "DONE", due: -20, who: mgr.id },
    { title: "SS- Investigate duplicate deliveries", status: "BLOCKED", due: 1, who: null },
    { title: "SS- Rewrite the onboarding email", status: "BACKLOG", due: 30, who: null },
    { title: "SS- Add per-endpoint rate limits", status: "BACKLOG", due: 16, who: mgr.id },
    { title: "SS- Decommission the v1 webhook endpoint", status: "CANCELLED", due: -30, who: null },
  ];

  for (const r of ROOTS) {
    const root = await api<{ id: string }>("/api/tasks", "POST", {
      projectId: project.id,
      title: r.title,
      status: r.status,
      dueDate: r.due === null ? undefined : days(r.due),
      dueProvisional: r.provisional ?? false,
      assigneeId: r.who,
    });
    for (let i = 0; i < (r.kids ?? 0); i++) {
      await api("/api/tasks", "POST", {
        projectId: project.id,
        parentId: root.id,
        title: `${r.title} — step ${i + 1}`,
        status: i === 0 ? "DONE" : i === 1 ? "IN_PROGRESS" : "BACKLOG",
        assigneeId: i % 2 === 0 ? dev.id : lead.id,
      });
    }
  }

  console.log(`created ${NAME} (${project.slug}) with ${ROOTS.length} roots`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
