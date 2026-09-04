/**
 * Disposable tool for the interaction rig. Every mutating pointer gesture in
 * this repo happens here and nowhere else — created through the API as the
 * screenshot manager, torn down hard afterwards.
 *
 *   npx tsx --env-file=.env scripts/sandbox.ts          create
 *   npx tsx --env-file=.env scripts/sandbox.ts --remove teardown
 *
 * Every title is prefixed RS- so the interaction scripts can assert they are
 * touching sandbox rows before they click anything.
 */
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
export const SANDBOX_SLUG = "rig-sandbox";

let cookie = "";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", cookie, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

async function signIn() {
  const res = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.SCREEN_EMAIL,
      password: process.env.SCREEN_PASSWORD,
    }),
  });
  if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
}

type Project = { id: string; slug: string; name: string; gateTemplate: unknown[] };
type Task = { id: string };

const TREE = [
  {
    title: "RS- Pipeline rebuild",
    status: "IN_PROGRESS",
    children: [
      {
        title: "RS- Ingest rewrite",
        status: "IN_PROGRESS",
        children: [
          { title: "RS- Verify signatures", status: "DONE" },
          { title: "RS- Replay window", status: "BACKLOG" },
        ],
      },
      { title: "RS- Retry policy", status: "BLOCKED" },
    ],
  },
  {
    title: "RS- Observability",
    status: "PLANNED",
    children: [
      { title: "RS- Ship structured logs", status: "DONE" },
      { title: "RS- Failure-rate alert", status: "BACKLOG" },
    ],
  },
  { title: "RS- Retire v1", status: "CANCELLED" },
];

async function create() {
  await signIn();

  const existing = (await api<Project[]>("/api/projects")).find(
    (p) => p.slug === SANDBOX_SLUG,
  );
  if (existing) {
    console.log("sandbox already exists, removing first");
    await api(`/api/projects/${existing.id}`, { method: "DELETE" });
  }

  const project = await api<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Rig Sandbox", color: "#a78bfa" }),
  });

  let made = 0;
  const walk = async (
    nodes: typeof TREE,
    parentId: string | null,
  ): Promise<void> => {
    for (const node of nodes) {
      const task = await api<Task>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          projectId: project.id,
          parentId,
          title: node.title,
          status: node.status,
        }),
      });
      made++;
      if ("children" in node && node.children) {
        await walk(node.children as typeof TREE, task.id);
      }
    }
  };
  await walk(TREE, null);

  console.log(`created ${project.name} (${project.slug}) with ${made} RS- tasks`);
}

async function remove() {
  await signIn();
  const project = (await api<Project[]>("/api/projects")).find(
    (p) => p.slug === SANDBOX_SLUG,
  );
  if (!project) {
    console.log("sandbox already gone");
    return;
  }
  await api(`/api/projects/${project.id}`, { method: "DELETE" });
  console.log("sandbox deleted (tasks and notes cascaded)");
}

const run = process.argv.includes("--remove") ? remove : create;
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
