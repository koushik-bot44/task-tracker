/**
 * Regression guard for the cross-list task-cache contract (lib/task-cache.ts).
 *
 * The bug: editing a task wrote only ["tasks", projectId], so Focus, the
 * Changelog and Home — which read ["tasks","all"] — stayed stale until a hard
 * reload, because TanStack invalidation is a prefix match and never crossed
 * over. This asserts the contract that makes that impossible:
 *
 *   1. taskListKeys(p) targets BOTH the project list and the "all" list.
 *   2. writeTaskLists applies an update / create / delete to BOTH lists.
 *   3. every mutation (create/update/delete/restore) in use-tasks.ts actually
 *      routes through writeLists — so no future edit can quietly touch one list.
 *
 * Pure: a real QueryClient, no browser, no server, no database.
 *
 *   npm run test:cross-list
 */
import { QueryClient } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  allTasksKey,
  restoreTaskLists,
  taskListKeys,
  tasksKey,
  writeTaskLists,
} from "../lib/task-cache";
import type { TaskDTO } from "../lib/types";

let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(52)} got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

function task(id: string, over: Partial<TaskDTO> = {}): TaskDTO {
  return {
    id,
    projectId: "p1",
    isPrivate: false,
    ownerId: null,
    personalProjectId: null,
    groupColor: null,
    parentId: null,
    title: id,
    descriptionMd: "",
    status: "BACKLOG",
    priority: "P2",
    dueDate: null,
    dueProvisional: false,
    orderKey: "a0",
    gates: [],
    tags: [],
    links: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    deletedAt: null,
    pinnedAt: null,
    deliverableUrl: null,
    completedById: null,
    completedByName: null,
    assigneeId: null,
    assigneeName: null,
    color: null,
    hasDescription: false,
    noteCount: 0,
    ...over,
  };
}

// ── 1. the key set names both lists ──────────────────────────────────────────
const keys = taskListKeys({ projectId: "p1" }).map((k) => JSON.stringify(k));
check("taskListKeys includes the project list", keys.includes(JSON.stringify(tasksKey("p1"))), true);
check("taskListKeys includes the 'all' list", keys.includes(JSON.stringify(allTasksKey)), true);

// A helper: seed both lists with the same task and return a fresh client.
function seed(rows: TaskDTO[]) {
  const qc = new QueryClient();
  qc.setQueryData(tasksKey("p1"), rows.map((t) => ({ ...t })));
  qc.setQueryData(allTasksKey, rows.map((t) => ({ ...t })));
  return qc;
}
const readBoth = (qc: QueryClient) => ({
  proj: qc.getQueryData<TaskDTO[]>(tasksKey("p1")),
  all: qc.getQueryData<TaskDTO[]>(allTasksKey),
});

// ── 2a. UPDATE reaches both lists ────────────────────────────────────────────
{
  const qc = seed([task("t1")]);
  writeTaskLists(qc, { projectId: "p1" }, (rows) =>
    rows.map((t) => (t.id === "t1" ? { ...t, status: "DONE" } : t)),
  );
  const { proj, all } = readBoth(qc);
  check("update — project list sees DONE", proj?.[0]?.status, "DONE");
  check("update — 'all' list sees DONE", all?.[0]?.status, "DONE");
}

// ── 2b. CREATE reaches both lists ────────────────────────────────────────────
{
  const qc = seed([task("t1")]);
  writeTaskLists(qc, { projectId: "p1" }, (rows) => [...rows, task("t2")]);
  const { proj, all } = readBoth(qc);
  check("create — project list has the new row", proj?.some((t) => t.id === "t2"), true);
  check("create — 'all' list has the new row", all?.some((t) => t.id === "t2"), true);
}

// ── 2c. DELETE reaches both lists ────────────────────────────────────────────
{
  const qc = seed([task("t1"), task("t2")]);
  writeTaskLists(qc, { projectId: "p1" }, (rows) => rows.filter((t) => t.id !== "t1"));
  const { proj, all } = readBoth(qc);
  check("delete — project list dropped the row", proj?.some((t) => t.id === "t1"), false);
  check("delete — 'all' list dropped the row", all?.some((t) => t.id === "t1"), false);
}

// ── 2d. rollback restores both lists ─────────────────────────────────────────
{
  const qc = seed([task("t1")]);
  const prior = writeTaskLists(qc, { projectId: "p1" }, (rows) => rows.map((t) => ({ ...t, status: "DONE" as const })));
  restoreTaskLists(qc, prior);
  const { proj, all } = readBoth(qc);
  check("rollback — project list back to BACKLOG", proj?.[0]?.status, "BACKLOG");
  check("rollback — 'all' list back to BACKLOG", all?.[0]?.status, "BACKLOG");
}

// ── 3. every mutation routes through writeLists ──────────────────────────────
// A future edit that writes a list directly (bypassing the helper) is the way
// this bug comes back; catch it at the source.
const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "hooks", "use-tasks.ts"),
  "utf8",
);
for (const name of ["createTask", "updateTask", "deleteTask", "restoreTask"]) {
  const start = src.indexOf(`const ${name} = useMutation(`);
  const rest = src.slice(start + 1);
  const nextConst = rest.search(/\n  const \w+ = useMutation\(|\n  return \{/);
  const body = rest.slice(0, nextConst < 0 ? undefined : nextConst);
  check(`${name} writes through writeLists`, start >= 0 && /writeLists\(/.test(body), true);
}
// And that nobody reintroduced a project-only writer.
check("no writeEverywhere/project-only write helper remains", /writeEverywhere|const write =/.test(src), false);

console.log(fail === 0 ? "\nall cross-list checks passed" : `\n${fail} FAILED`);
if (fail > 0) process.exitCode = 1;
