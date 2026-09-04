/**
 * The phase 5 permission matrix, exercised against a running server.
 *
 * Creates three throwaway accounts (one per role), runs every case, then
 * deletes them. It never touches the owner's real accounts — those keep their
 * ids, roles and passwords, and this script has no code path that writes to
 * a user it did not create.
 *
 *   npx tsx scripts/perm-matrix.ts
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PREFIX = "permtest-";

type Actor = { label: string; email: string; cookie: string; id: string };

let pass = 0;
let fail = 0;

function record(name: string, got: number, want: number | number[]) {
  const wants = Array.isArray(want) ? want : [want];
  const ok = wants.includes(got);
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(52)} got ${got}, want ${wants.join("/")}`);
}

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in failed for ${email}: ${res.status}`);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

async function call(
  actor: Actor,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", cookie: actor.cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty body is fine */
  }
  return { status: res.status, json };
}

async function main() {
  // ── throwaway actors ──────────────────────────────────────────────────────
  const specs = [
    { label: "manager", role: "MANAGER" as const },
    { label: "lead", role: "TEAM_LEAD" as const },
    { label: "dev", role: "RESOURCE" as const },
    { label: "dev2", role: "RESOURCE" as const },
    { label: "admin", role: "ADMIN" as const },
  ];

  const actors: Record<string, Actor> = {};
  for (const spec of specs) {
    const email = `${PREFIX}${spec.label}@orbit.local`;
    const password = generateTempPassword(16);
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash: await hashPassword(password), role: spec.role, disabledAt: null },
      create: {
        email,
        name: `Perm ${spec.label}`,
        role: spec.role,
        passwordHash: await hashPassword(password),
      },
    });
    actors[spec.label] = {
      label: spec.label,
      email,
      id: user.id,
      cookie: await signIn(email, password),
    };
  }

  const { manager, lead, dev, dev2, admin } = actors;
  /* A tool THIS SCRIPT owns. It used to grab projects[0] from an unordered
     findMany and run the tool-edit cases against it, then "clean up" by setting
     leadId = null — not by restoring what was there. On one run projects[0] was
     a tool the owner had just created with a lead, and the cleanup silently
     wiped that assignment. The rig must never mutate a real project; it makes
     its own. */
  const own = await call(manager, "POST", "/api/projects", {
    name: "PT fixture tool",
    description: "Created by the permission matrix; deleted at the end.",
    leadId: lead.id,
  });
  if (own.status !== 201) throw new Error(`fixture tool not created: ${own.status}`);
  const projectId: string = own.json.id;

  console.log("\n── tool creation ─────────────────────────────────────────────");

  const toolBody = (n: string) => ({
    name: n,
    description: "Created by the permission matrix.",
    leadId: lead.id,
  });

  record("dev creates tool", (await call(dev, "POST", "/api/projects", toolBody("PT dev"))).status, 403);
  record("lead creates tool", (await call(lead, "POST", "/api/projects", toolBody("PT lead"))).status, 403);

  record(
    "manager creates tool without description",
    (await call(manager, "POST", "/api/projects", { name: "PT nodesc", leadId: lead.id })).status,
    400,
  );
  record(
    "manager creates tool without lead",
    (await call(manager, "POST", "/api/projects", { name: "PT nolead", description: "x" })).status,
    400,
  );
  record(
    "manager creates tool with a DEVELOPER as lead",
    (await call(manager, "POST", "/api/projects", {
      name: "PT badlead",
      description: "x",
      leadId: dev.id,
    })).status,
    400,
  );

  const created = await call(manager, "POST", "/api/projects", toolBody("PT manager"));
  record("manager creates tool, fully specified", created.status, 201);
  const newProjectId: string | undefined = created.json?.id;

  console.log("\n── tool edit ─────────────────────────────────────────────────");
  record(
    "dev edits tool",
    (await call(dev, "PATCH", `/api/projects/${projectId}`, { description: "nope" })).status,
    403,
  );
  record(
    "lead edits tool",
    (await call(lead, "PATCH", `/api/projects/${projectId}`, { description: "nope" })).status,
    403,
  );
  record(
    "manager assigns a lead to a legacy tool",
    (await call(manager, "PATCH", `/api/projects/${projectId}`, { leadId: lead.id })).status,
    200,
  );

  console.log("\n── estimated completion ──────────────────────────────────────");
  const rootNoDate = await call(dev, "POST", "/api/tasks", { projectId, title: "PT no date" });
  record("root task without a date", rootNoDate.status, 400);

  const rootDated = await call(dev, "POST", "/api/tasks", {
    projectId,
    title: "PT dated root",
    dueDate: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  });
  record("root task with a date", rootDated.status, 201);
  const rootId: string = rootDated.json?.id;

  const sub = await call(dev, "POST", "/api/tasks", {
    projectId,
    parentId: rootId,
    title: "PT subtask",
  });
  record("subtask without a date is accepted", sub.status, 201);
  // Phase 11: a subtask is never assigned, not even auto-assigned to its
  // dev creator (which is what a root task would get).
  record("dev-created subtask is NOT auto-assigned", sub.json?.assigneeId === null ? 1 : 0, 1);
  const inherited = sub.json?.dueDate?.slice(0, 10);
  const parentDay = rootDated.json?.dueDate?.slice(0, 10);
  record(
    `subtask inherited the parent's date (${inherited} == ${parentDay})`,
    inherited === parentDay ? 1 : 0,
    1,
  );

  console.log("\n── assignment ────────────────────────────────────────────────");
  /* Phase 11: a developer can only touch a project they can see. Make dev and
     dev2 explicit members of the fixture so this section exercises the pure
     assignment rules (claim / drop / can't-deal-it-out) rather than visibility,
     which the membership section proves on its own tool. */
  await call(manager, "POST", `/api/projects/${projectId}/members`, { userId: dev.id });
  await call(manager, "POST", `/api/projects/${projectId}/members`, { userId: dev2.id });

  record(
    "dev-created task auto-assigned to the creator",
    rootDated.json?.assigneeId === dev.id ? 1 : 0,
    1,
  );
  record(
    "dev assigns their own task to someone else",
    (await call(dev, "PATCH", `/api/tasks/${rootId}`, { assigneeId: dev2.id })).status,
    403,
  );
  record(
    "dev unassigns their own task",
    (await call(dev, "PATCH", `/api/tasks/${rootId}`, { assigneeId: null })).status,
    200,
  );
  record(
    "dev2 claims the now-unassigned task",
    (await call(dev2, "PATCH", `/api/tasks/${rootId}`, { assigneeId: dev2.id })).status,
    200,
  );
  record(
    "dev takes a task assigned to someone else",
    (await call(dev, "PATCH", `/api/tasks/${rootId}`, { assigneeId: dev.id })).status,
    403,
  );
  record(
    "lead reassigns anyone's task",
    (await call(lead, "PATCH", `/api/tasks/${rootId}`, { assigneeId: dev.id })).status,
    200,
  );
  record(
    "manager assigns to a disabled/unknown user",
    (await call(manager, "PATCH", `/api/tasks/${rootId}`, { assigneeId: "nope" })).status,
    400,
  );

  console.log("\n── gates (phase 11 roles) ────────────────────────────────────");
  /* Phase 11 splits the gates: Verified is the manager's sign-off, and the
     four build gates (built, reviewed, tested, deployed) are the team's. Each
     flip is computed against FRESH server state so exactly one gate changes —
     otherwise a stale snapshot would flip several keys and confuse the check. */
  const flipAs = async (actor: Actor, key: string, done: boolean) => {
    const current = (await call(manager, "GET", `/api/tasks/${rootId}`)).json?.gates ?? [];
    const next = current.map((g: any) => (g.key === key ? { ...g, done } : g));
    return (await call(actor, "PATCH", `/api/tasks/${rootId}`, { gates: next })).status;
  };

  record("dev flips built (team gate)", await flipAs(dev, "built", true), 200);
  record("lead flips tested (team gate)", await flipAs(lead, "tested", true), 200);
  record("dev flips reviewed (now a team gate)", await flipAs(dev, "reviewed", true), 200);
  record("dev flips verified -> 403", await flipAs(dev, "verified", true), 403);
  record("lead flips verified -> 403", await flipAs(lead, "verified", true), 403);
  record("manager flips a team gate (built) -> 403", await flipAs(manager, "built", false), 403);
  record("manager flips verified -> 200", await flipAs(manager, "verified", true), 200);

  console.log("\n── statuses ──────────────────────────────────────────────────");
  for (const who of [dev, lead, manager]) {
    record(
      `${who.label} sets ON_HOLD`,
      (await call(who, "PATCH", `/api/tasks/${rootId}`, { status: "ON_HOLD" })).status,
      200,
    );
  }

  console.log("\n── project notes ─────────────────────────────────────────────");
  const devNote = await call(dev, "POST", `/api/projects/${projectId}/notes`, {
    body: "PT note from a developer",
  });
  record("dev posts a project note", devNote.status, 201);
  record(
    "lead deletes someone else's note",
    (await call(lead, "DELETE", `/api/project-notes/${devNote.json?.id}`)).status,
    403,
  );
  record(
    "manager deletes someone else's note",
    (await call(manager, "DELETE", `/api/project-notes/${devNote.json?.id}`)).status,
    403,
  );
  record(
    "author deletes their own note",
    (await call(dev, "DELETE", `/api/project-notes/${devNote.json?.id}`)).status,
    200,
  );

  console.log("\n── people: lead scope (phase 6) ──────────────────────────────");
  /* A lead onboards the developers they will assign work to. Anything that
     grants authority (a lead or a manager), or changes an existing account
     (role, password, disabled), stays with managers. The server decides on the
     role in the request body, before any write. */
  const leadDev = await call(lead, "POST", "/api/users", {
    name: "PT lead-made dev",
    email: "permtest-leadmade@orbit.local",
    role: "RESOURCE",
  });
  record("lead creates a DEVELOPER", leadDev.status, 201);
  record(
    "lead creates a MANAGER",
    (await call(lead, "POST", "/api/users", { name: "PT x", email: "permtest-x1@orbit.local", role: "MANAGER" })).status,
    403,
  );
  record(
    "lead creates a TEAM_LEAD",
    (await call(lead, "POST", "/api/users", { name: "PT y", email: "permtest-x2@orbit.local", role: "TEAM_LEAD" })).status,
    403,
  );
  record("lead disables a user", (await call(lead, "PATCH", `/api/users/${dev.id}`, { disable: true })).status, 403);
  record("lead changes a role", (await call(lead, "PATCH", `/api/users/${dev.id}`, { role: "MANAGER" })).status, 403);
  record("lead resets a password", (await call(lead, "PATCH", `/api/users/${dev.id}`, { reset: true })).status, 403);
  record("lead reads the people list", (await call(lead, "GET", "/api/users")).status, 200);
  record(
    "lead assigns the dev they just made",
    (await call(lead, "PATCH", `/api/tasks/${rootId}`, { assigneeId: leadDev.json?.user?.id })).status,
    200,
  );

  console.log("\n── invites: resend + cancel (phase 10) ───────────────────────");
  const leadDevId: string = leadDev.json?.user?.id;
  // Resend mirrors create scope: lead may resend a developer's invite, not a
  // manager's; a dev may resend nobody. Manager may resend anyone's.
  record("lead resends a developer invite", (await call(lead, "POST", `/api/users/${leadDevId}/resend`, {})).status, 200);
  record("dev resends an invite -> 403", (await call(dev, "POST", `/api/users/${leadDevId}/resend`, {})).status, 403);
  record("lead resends a MANAGER invite -> 403", (await call(lead, "POST", `/api/users/${manager.id}/resend`, {})).status, 403);
  record("manager resends a developer invite", (await call(manager, "POST", `/api/users/${leadDevId}/resend`, {})).status, 200);
  // Manager may resend only PENDING accounts.
  record("manager resends an ACTIVE account -> 409", (await call(manager, "POST", `/api/users/${dev.id}/resend`, {})).status, 409);
  // Cancel/delete: manager-only. Phase 29 — a member-only ACTIVE user (owns no
  // projects) is now DELETABLE (200); only OWNING projects blocks deletion.
  record("lead cancels a pending invite -> 403", (await call(lead, "DELETE", `/api/users/${leadDevId}`)).status, 403);
  record("manager deletes a member-only ACTIVE user -> 200 (phase 29)", (await call(manager, "DELETE", `/api/users/${dev.id}`)).status, 200);
  record("manager cancels a pending invite -> 200", (await call(manager, "DELETE", `/api/users/${leadDevId}`)).status, 200);

  console.log("\n── people ────────────────────────────────────────────────────");
  record(
    "dev lists users",
    (await call(dev, "GET", "/api/users")).status,
    403,
  );
  record("manager lists users", (await call(manager, "GET", "/api/users")).status, 200);
  record(
    "manager promotes someone to TEAM_LEAD",
    (await call(manager, "PATCH", `/api/users/${dev2.id}`, { role: "TEAM_LEAD" })).status,
    200,
  );

  console.log("\n── calendar events (phase 8) ─────────────────────────────────");
  const scopedEv = await call(manager, "POST", "/api/events", { title: "PT event", date: "2026-08-15", projectId });
  record("manager creates scoped event", scopedEv.status, 201);
  const eventId: string = scopedEv.json?.id;
  // Global event via PRISMA, not the API: creating (or deleting) a global event
  // through the endpoint fires notifyEvent to every real lead/dev (push + email).
  // The manager-write permission is already proven by the scoped create above
  // (same endpoint, same gate); here we only confirm a null-project event is a
  // valid row — without spamming real people.
  const globalEv = await prisma.calendarEvent.create({
    data: { title: "PT global", date: new Date("2026-08-16T00:00:00.000Z"), projectId: null, createdById: manager.id },
  });
  record("manager global event persists (null project)", globalEv.projectId === null ? 200 : 500, 200);
  record("dev creates event", (await call(dev, "POST", "/api/events", { title: "PT x", date: "2026-08-15", projectId })).status, 403);
  record("lead creates event", (await call(lead, "POST", "/api/events", { title: "PT y", date: "2026-08-15", projectId })).status, 403);
  record("dev edits event", (await call(dev, "PATCH", `/api/events/${eventId}`, { title: "z" })).status, 403);
  record("lead edits event", (await call(lead, "PATCH", `/api/events/${eventId}`, { title: "z" })).status, 403);
  record("manager edits event", (await call(manager, "PATCH", `/api/events/${eventId}`, { title: "PT event 2" })).status, 200);
  record("dev deletes event", (await call(dev, "DELETE", `/api/events/${eventId}`)).status, 403);
  record("lead deletes event", (await call(lead, "DELETE", `/api/events/${eventId}`)).status, 403);

  console.log("\n── notifications (phase 8) ───────────────────────────────────");
  record("dev reads own notifications", (await call(dev, "GET", "/api/notifications")).status, 200);
  const leadNotif = await prisma.notification.findFirst({ where: { userId: lead.id } });
  const devNotif = await prisma.notification.findFirst({ where: { userId: dev.id } });
  record(
    "dev marks ANOTHER user's notification read -> 404",
    (await call(dev, "POST", "/api/notifications/read", { id: leadNotif?.id ?? "none" })).status,
    404,
  );
  record(
    "dev marks own notification read",
    (await call(dev, "POST", "/api/notifications/read", { id: devNotif?.id ?? "none" })).status,
    devNotif ? 200 : 404,
  );
  record("dev marks all read", (await call(dev, "POST", "/api/notifications/read", { all: true })).status, 200);
  // Manager deletes the scoped event via the API — notifies only the permtest
  // fixtures (cascade-cleaned at teardown). The global event is removed via
  // prisma so its delete never notifies real users.
  record("manager deletes event", (await call(manager, "DELETE", `/api/events/${eventId}`)).status, 200);
  await prisma.calendarEvent.delete({ where: { id: globalEv.id } }).catch(() => undefined);

  console.log("\n── cron (phase 9) ────────────────────────────────────────────");
  // Cron endpoint: not session-guarded, demands CRON_SECRET; anything else 401.
  record("cron: no CRON_SECRET header -> 401", (await fetch(`${BASE}/api/cron/task-due`)).status, 401);
  record(
    "cron: wrong CRON_SECRET -> 401",
    (await fetch(`${BASE}/api/cron/task-due`, { headers: { authorization: "Bearer wrong" } })).status,
    401,
  );

  console.log("\n── membership visibility (phase 11) ──────────────────────────");
  /* A tool that `dev` is neither a member of nor assigned a task in. `dev2` is
     made a member at creation, so the same tool is visible to them. */
  const hidden = await call(manager, "POST", "/api/projects", {
    name: "PT hidden tool",
    description: "Scoped away from dev; visible to dev2 as a member.",
    leadId: lead.id,
    developerIds: [dev2.id],
  });
  record("manager creates a scoped tool with a member", hidden.status, 201);
  const hiddenId: string = hidden.json?.id;
  const hiddenTask = await call(manager, "POST", "/api/tasks", {
    projectId: hiddenId,
    title: "PT hidden root",
    dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    assigneeId: dev2.id,
  });
  record("manager creates a root task assigned to dev2", hiddenTask.status, 201);
  const hiddenTaskId: string = hiddenTask.json?.id;

  const inList = async (actor: Actor, id: string) =>
    ((await call(actor, "GET", "/api/projects")).json ?? []).some((p: any) => p.id === id);
  record("dev's project list EXCLUDES a non-member tool", (await inList(dev, hiddenId)) ? 0 : 1, 1);
  record("lead's project list INCLUDES every tool", (await inList(lead, hiddenId)) ? 1 : 0, 1);
  record("member dev's list INCLUDES their tool", (await inList(dev2, hiddenId)) ? 1 : 0, 1);
  record("dev reads a non-member tool's tasks -> 404", (await call(dev, "GET", `/api/tasks?projectId=${hiddenId}`)).status, 404);
  record("dev reads a task in a non-member tool -> 404", (await call(dev, "GET", `/api/tasks/${hiddenTaskId}`)).status, 404);
  record("dev deletes a task in a non-member tool -> 404", (await call(dev, "DELETE", `/api/tasks/${hiddenTaskId}`)).status, 404);
  record("member dev reads their tool's tasks -> 200", (await call(dev2, "GET", `/api/tasks?projectId=${hiddenId}`)).status, 200);

  console.log("\n── project rename + delete (phase 11 UI-bug fix) ─────────────");
  record("dev renames a tool -> 403", (await call(dev, "PATCH", `/api/projects/${hiddenId}`, { name: "PT nope" })).status, 403);
  record("lead renames a tool -> 403", (await call(lead, "PATCH", `/api/projects/${hiddenId}`, { name: "PT nope" })).status, 403);
  record("manager renames a tool -> 200", (await call(manager, "PATCH", `/api/projects/${hiddenId}`, { name: "PT hidden tool" })).status, 200);
  const delFixture = await call(manager, "POST", "/api/projects", { name: "PT deltest", description: "x", leadId: lead.id });
  const delId: string = delFixture.json?.id;
  record("dev deletes a tool -> 403", (await call(dev, "DELETE", `/api/projects/${delId}`)).status, 403);
  record("lead deletes a tool -> 403", (await call(lead, "DELETE", `/api/projects/${delId}`)).status, 403);
  record("manager deletes a tool -> 200", (await call(manager, "DELETE", `/api/projects/${delId}`)).status, 200);

  console.log("\n── members management (phase 11) ─────────────────────────────");
  record("dev manages members -> 403", (await call(dev, "POST", `/api/projects/${hiddenId}/members`, { userId: dev.id })).status, 403);
  record("lead manages members -> 403", (await call(lead, "POST", `/api/projects/${hiddenId}/members`, { userId: dev.id })).status, 403);
  record("manager adds a non-developer -> 400", (await call(manager, "POST", `/api/projects/${hiddenId}/members`, { userId: lead.id })).status, 400);
  record("manager adds a developer -> 200", (await call(manager, "POST", `/api/projects/${hiddenId}/members`, { userId: dev.id })).status, 200);
  record("added dev now reads the tool's tasks -> 200", (await call(dev, "GET", `/api/tasks?projectId=${hiddenId}`)).status, 200);
  const removed = await call(manager, "DELETE", `/api/projects/${hiddenId}/members`, { userId: dev.id });
  record("manager removes a member -> 200", removed.status, 200);
  record("removed dev reports 0 still-assigned tasks", removed.json?.stillAssignedTasks === 0 ? 1 : 0, 1);
  record("removed dev can no longer read the tool -> 404", (await call(dev, "GET", `/api/tasks?projectId=${hiddenId}`)).status, 404);

  console.log("\n── assignee: root-only (phase 11) ────────────────────────────");
  record(
    "POST a subtask WITH an assignee -> 400",
    (await call(lead, "POST", "/api/tasks", { projectId, parentId: rootId, title: "PT sub assigned", assigneeId: dev2.id })).status,
    400,
  );
  record("PATCH a subtask's assignee -> 400", (await call(lead, "PATCH", `/api/tasks/${sub.json?.id}`, { assigneeId: dev2.id })).status, 400);
  record("PATCH a subtask's status (not assignee) -> 200", (await call(lead, "PATCH", `/api/tasks/${sub.json?.id}`, { status: "IN_PROGRESS" })).status, 200);
  record("PATCH a root task's assignee -> 200", (await call(lead, "PATCH", `/api/tasks/${rootId}`, { assigneeId: dev.id })).status, 200);

  console.log("\n── task colour (phase 11) ────────────────────────────────────");
  record("editor sets a task colour -> 200", (await call(dev, "PATCH", `/api/tasks/${rootId}`, { color: "#f87171" })).status, 200);
  record("invalid colour format -> 400", (await call(dev, "PATCH", `/api/tasks/${rootId}`, { color: "red" })).status, 400);
  record("clearing a task colour -> 200", (await call(dev, "PATCH", `/api/tasks/${rootId}`, { color: null })).status, 200);
  record("non-member dev sets a colour -> 404", (await call(dev, "PATCH", `/api/tasks/${hiddenTaskId}`, { color: "#f87171" })).status, 404);

  console.log("\n── departments / departments (phase 12) ──────────────────────────");
  // Writes are manager-only.
  record("dev creates a department -> 403", (await call(dev, "POST", "/api/departments", { name: "PT dev department", color: "#0d9488" })).status, 403);
  record("lead creates a department -> 403", (await call(lead, "POST", "/api/departments", { name: "PT lead department", color: "#0d9488" })).status, 403);
  const departmentA = await call(manager, "POST", "/api/departments", { name: "PT department A", color: "#0d9488" });
  record("manager creates a department -> 201", departmentA.status, 201);
  const departmentAId: string = departmentA.json?.id;
  const departmentB = await call(manager, "POST", "/api/departments", { name: "PT department B", color: "#7c3aed" });
  const departmentBId: string = departmentB.json?.id;

  record("manager edits a department -> 200", (await call(manager, "PATCH", `/api/departments/${departmentAId}`, { name: "PT department A2" })).status, 200);
  record("dev edits a department -> 403", (await call(dev, "PATCH", `/api/departments/${departmentAId}`, { name: "no" })).status, 403);
  record("lead deletes a department -> 403", (await call(lead, "DELETE", `/api/departments/${departmentBId}`)).status, 403);

  // Filing tools into departments is a project edit → manager-only. projectId has
  // dev + dev2 as members; hiddenId has neither dev.
  record("manager files a member tool into department A -> 200", (await call(manager, "PATCH", `/api/projects/${projectId}`, { departmentId: departmentAId })).status, 200);
  record("manager files the hidden tool into department B -> 200", (await call(manager, "PATCH", `/api/projects/${hiddenId}`, { departmentId: departmentBId })).status, 200);
  record("dev changes a tool's department -> 403", (await call(dev, "PATCH", `/api/projects/${projectId}`, { departmentId: null })).status, 403);
  record("lead changes a tool's department -> 403", (await call(lead, "PATCH", `/api/projects/${projectId}`, { departmentId: null })).status, 403);
  record("filing into a non-existent department -> 400", (await call(manager, "PATCH", `/api/projects/${projectId}`, { departmentId: "nope" })).status, 400);

  // Department READ is visibility-scoped: a developer only sees departments holding a
  // tool they can see.
  const seesDepartment = async (actor: Actor, id: string) =>
    ((await call(actor, "GET", "/api/departments")).json ?? []).some((f: any) => f.id === id);
  record("dev SEES a department holding their member tool", (await seesDepartment(dev, departmentAId)) ? 1 : 0, 1);
  record("dev does NOT see a department holding only hidden tools", (await seesDepartment(dev, departmentBId)) ? 0 : 1, 1);
  record("manager sees every department (A)", (await seesDepartment(manager, departmentAId)) ? 1 : 0, 1);
  record("manager sees every department (B)", (await seesDepartment(manager, departmentBId)) ? 1 : 0, 1);

  // Deleting a department UNFILES its tools — never deletes them.
  const delDepartment = await call(manager, "DELETE", `/api/departments/${departmentAId}`);
  record("manager deletes a department -> 200", delDepartment.status, 200);
  record("delete reports its tools unfiled (>=1)", (delDepartment.json?.unfiledProjects ?? 0) >= 1 ? 1 : 0, 1);
  const survived = await prisma.project.findUnique({ where: { id: projectId }, select: { departmentId: true } });
  record("the filed tool SURVIVES the department delete", survived ? 1 : 0, 1);
  record("the filed tool is now unfiled (departmentId null)", survived?.departmentId === null ? 1 : 0, 1);

  console.log("\n── admin: a peer of manager (phase 13) ───────────────────────");
  // Visibility: an admin sees everything, like a manager (no department/project filter).
  record("admin sees a tool a dev can't (no visibility filter)", (await inList(admin, hiddenId)) ? 1 : 0, 1);
  record("admin reads any task in any tool -> 200", (await call(admin, "GET", `/api/tasks/${rootId}`)).status, 200);

  // The two strict powers admins do NOT get.
  record("admin creates a project -> 403", (await call(admin, "POST", "/api/projects", { name: "PT admin proj", description: "x", leadId: lead.id })).status, 403);
  record("admin deletes a project -> 403", (await call(admin, "DELETE", `/api/projects/${projectId}`)).status, 403);
  const mgrDepartment = await call(manager, "POST", "/api/departments", { name: "PT mgr department", color: "#0d9488" });
  const mgrDepartmentId: string = mgrDepartment.json?.id;
  record("admin creates a department -> 403", (await call(admin, "POST", "/api/departments", { name: "PT admin department", color: "#0d9488" })).status, 403);
  record("admin edits a department -> 403", (await call(admin, "PATCH", `/api/departments/${mgrDepartmentId}`, { name: "no" })).status, 403);
  record("admin deletes a department -> 403", (await call(admin, "DELETE", `/api/departments/${mgrDepartmentId}`)).status, 403);
  record("admin re-files a project (departmentId) -> 403", (await call(admin, "PATCH", `/api/projects/${projectId}`, { departmentId: mgrDepartmentId })).status, 403);

  // Project metadata (name, description) — admins may edit an existing tool.
  record("admin renames a project -> 200", (await call(admin, "PATCH", `/api/projects/${projectId}`, { name: "PT fixture tool" })).status, 200);
  record("admin edits a project description -> 200", (await call(admin, "PATCH", `/api/projects/${projectId}`, { description: "edited by admin" })).status, 200);

  // Tasks, assignment, membership — full manager-peer powers.
  record("admin edits a task (status) -> 200", (await call(admin, "PATCH", `/api/tasks/${rootId}`, { status: "IN_PROGRESS" })).status, 200);
  record("admin assigns a task -> 200", (await call(admin, "PATCH", `/api/tasks/${rootId}`, { assigneeId: dev.id })).status, 200);
  // dev is still a DEVELOPER (dev2 was promoted to lead earlier); membership is developers-only.
  record("admin adds a project member -> 200", (await call(admin, "POST", `/api/projects/${projectId}/members`, { userId: dev.id })).status, 200);
  record("admin removes a project member -> 200", (await call(admin, "DELETE", `/api/projects/${projectId}/members`, { userId: dev.id })).status, 200);

  // Gates: admin signs off Verified (peer), but never touches the build gates.
  record("admin ticks Verified -> 200", await flipAs(admin, "verified", true), 200);
  record("admin ticks a build gate -> 403", await flipAs(admin, "built", false), 403);

  // Accounts: admin invites any role, including manager and admin.
  const invMgr = await call(admin, "POST", "/api/users", { name: "PT amgr", email: "permtest-amgr@orbit.local", role: "MANAGER" });
  record("admin invites a MANAGER -> 201", invMgr.status, 201);
  const invAdmin = await call(admin, "POST", "/api/users", { name: "PT aadm", email: "permtest-aadm@orbit.local", role: "ADMIN" });
  record("admin invites an ADMIN -> 201", invAdmin.status, 201);

  // Safety guards.
  record("admin disables self -> 403", (await call(admin, "PATCH", `/api/users/${admin.id}`, { disable: true })).status, 403);
  record("admin deletes self -> 403", (await call(admin, "DELETE", `/api/users/${admin.id}`)).status, 403);
  // The permtest manager is disableable because the owner's real manager backs it.
  record("admin disables a manager (backup exists) -> 200", (await call(admin, "PATCH", `/api/users/${manager.id}`, { disable: true })).status, 200);
  await prisma.user.update({ where: { id: manager.id }, data: { disabledAt: null } }); // restore for later tests/cleanup
  record("manager disables an admin -> 200", (await call(manager, "PATCH", `/api/users/${admin.id}`, { disable: true })).status, 200);
  await prisma.user.update({ where: { id: admin.id }, data: { disabledAt: null } });

  // The invite list is SHARED: an invite a MANAGER created, an ADMIN can act on.
  const shared = await call(manager, "POST", "/api/users", { name: "PT shared", email: "permtest-shared@orbit.local", role: "RESOURCE" });
  const sharedId: string = shared.json?.user?.id;
  record("manager creates an invite", shared.status, 201);
  record("admin RESENDS a manager-created invite -> 200", (await call(admin, "POST", `/api/users/${sharedId}/resend`, {})).status, 200);
  record("admin CANCELS a manager-created invite -> 200", (await call(admin, "DELETE", `/api/users/${sharedId}`)).status, 200);
  // …and the reverse: an admin-created invite, a manager can act on.
  const shared2 = await call(admin, "POST", "/api/users", { name: "PT shared2", email: "permtest-shared2@orbit.local", role: "RESOURCE" });
  record("manager RESENDS an admin-created invite -> 200", (await call(manager, "POST", `/api/users/${shared2.json?.user?.id}/resend`, {})).status, 200);
  record("manager CANCELS an admin-created invite -> 200", (await call(manager, "DELETE", `/api/users/${shared2.json?.user?.id}`)).status, 200);

  await call(manager, "DELETE", `/api/departments/${mgrDepartmentId}`);

  // ── cleanup: only what this script created ────────────────────────────────
  console.log("\n── cleanup ───────────────────────────────────────────────────");
  await prisma.emailLog.deleteMany({ where: { refId: "test" } });
  await prisma.calendarEvent.deleteMany({ where: { title: { startsWith: "PT " } } });
  await prisma.task.deleteMany({ where: { title: { startsWith: "PT " } } });
  await prisma.projectNote.deleteMany({ where: { body: { startsWith: "PT " } } });
  if (newProjectId) await prisma.project.delete({ where: { id: newProjectId } });
  await prisma.project.deleteMany({ where: { name: { startsWith: "PT " } } });
  // Departments before their creator: Department.createdById is Restrict, so a department
  // this run made must go before the manager account that made it.
  await prisma.department.deleteMany({ where: { name: { startsWith: "PT " } } });

  const ids = Object.values(actors).map((a) => a.id);
  await prisma.projectNote.deleteMany({ where: { authorId: { in: ids } } });
  await prisma.taskNote.deleteMany({ where: { authorId: { in: ids } } });
  await prisma.task.updateMany({
    where: { completedById: { in: ids } },
    data: { completedById: null },
  });
  await prisma.task.updateMany({
    where: { assigneeId: { in: ids } },
    data: { assigneeId: null },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  console.log(`removed ${ids.length} throwaway accounts and their artefacts`);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
