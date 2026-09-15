/**
 * The permission matrix (records/plans/restructure-plan.md §3), exercised
 * against a running server.
 *
 * Creates throwaway `permtest-` accounts — one per mintable role, NEVER a
 * The CEO is borrowed (capped at one, never minted) — a throwaway department he
 * hands to the throwaway HOD, and a fixture project the throwaway manager
 * owns. Every case is a real HTTP call carrying a real sign-in cookie. At the
 * end it deletes only what it created (in a `finally`, so a crash mid-run
 * still cleans up); it has no code path that writes to a user, project or
 * department it did not make.
 *
 *   npx tsx --env-file=.env.local scripts/perm-matrix.ts     (dev server up)
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PREFIX = "permtest-";

type Actor = { label: string; email: string; cookie: string; id: string; password?: string };
type Reply = { status: number; json: any };

let pass = 0;
let fail = 0;

function record(name: string, got: number, want: number | number[]) {
  const wants = Array.isArray(want) ? want : [want];
  const ok = wants.includes(got);
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(62)} got ${got}, want ${wants.join("/")}`);
}

function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(62)} ${ok ? "" : detail}`.trimEnd());
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

/** One HTTP call as `actor` (or anonymous when null). Redirects are reported, never followed. */
async function call(
  actor: Actor | null,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Reply> {
  const res = await fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: { "Content-Type": "application/json", ...(actor ? { cookie: actor.cookie } : {}), ...headers },
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

/** "YYYY-MM-DD" (UTC) of the first Mon–Fri at least `days` after `from`. */
function workingDay(from: Date | string, days: number): string {
  const d = typeof from === "string" ? new Date(`${from}T00:00:00.000Z`) : new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Every calendar event the actor can see on one day. */
async function eventsOn(actor: Actor, day: string): Promise<any[]> {
  const r = await call(actor, "GET", `/api/calendar?from=${day}&to=${day}`);
  return Array.isArray(r.json?.events) ? r.json.events : [];
}

/** Poll until `probe` returns something — for the server's fire-and-forget review syncs. */
async function waitFor<T>(probe: () => Promise<T | null | undefined>, tries = 20, ms = 250): Promise<T | null> {
  for (let i = 0; i < tries; i++) {
    const v = await probe();
    if (v) return v;
    await new Promise((r) => setTimeout(r, ms));
  }
  return null;
}

async function main() {
  // ── throwaway actors ──────────────────────────────────────────────────────
  // No FOUNDER: the account is capped at one and never minted (lib/permissions).
  const specs = [
    { label: "hod", role: "HOD" },
    { label: "manager", role: "MANAGER" },
    { label: "manager2", role: "MANAGER" },
    { label: "lead", role: "TEAM_LEAD" },
    { label: "dev", role: "RESOURCE" },
    { label: "dev2", role: "RESOURCE" },
    { label: "dev3", role: "RESOURCE" },
    { label: "admin", role: "ADMIN" },
  ] as const;

  const actors: Record<string, Actor> = {};
  for (const spec of specs) {
    const email = `${PREFIX}${spec.label}@orbit.local`;
    const password = generateTempPassword(16);
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash: await hashPassword(password), role: spec.role, disabledAt: null, status: "ACTIVE" },
      create: { email, name: `Perm ${spec.label}`, role: spec.role, passwordHash: await hashPassword(password) },
    });
    actors[spec.label] = { label: spec.label, email, id: user.id, cookie: await signIn(email, password), password };
  }
  // Every account this run made, for the cleanup — the PERSON is added later.
  const userIds = Object.values(actors).map((a) => a.id);

  try {
    await runCases(actors, userIds);
  } finally {
    await cleanup(userIds);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

async function runCases(actors: Record<string, Actor>, userIds: string[]) {
  // Exactly one CEO exists on the clone; the rig borrows him rather than
  // minting a second top-of-the-ladder account (owner, 2026-09-08).
  const ceoRow = await prisma.user.findFirst({ where: { role: "FOUNDER" }, select: { id: true, email: true } });
  if (!ceoRow) throw new Error("no CEO account on the clone");
  actors.director = { label: "ceo", email: ceoRow.email, id: ceoRow.id, cookie: await signIn(ceoRow.email, "orbit123") };
  const { director, hod, manager, manager2, lead, dev, dev2, dev3, admin } = actors;
  const today = new Date();

  console.log("\n── departments ───────────────────────────────────────────────");
  record("manager creates a department -> 403", (await call(manager, "POST", "/api/departments", { name: "PT manager department", color: "#0d9488" })).status, 403);
  const dept = await call(director, "POST", "/api/departments", { name: "PT department", color: "#0d9488", hodId: hod.id });
  record("the CEO creates a department, hod as its head -> 201", dept.status, 201);
  if (dept.status !== 201) throw new Error(`fixture department not created: ${dept.status} ${JSON.stringify(dept.json)}`);
  const deptId: string = dept.json.id;
  const otherDept = await call(director, "POST", "/api/departments", { name: "PT other department", color: "#7c3aed" });
  record("the CEO creates a second, empty department -> 201", otherDept.status, 201);
  const otherDeptId: string = otherDept.json?.id;
  record("hod edits their own department's description -> 200", (await call(hod, "PATCH", `/api/departments/${deptId}`, { description: "PT described by its head" })).status, 200);
  record("hod renames their own department -> 403", (await call(hod, "PATCH", `/api/departments/${deptId}`, { name: "PT renamed" })).status, 403);
  record("hod edits another department's description -> 403", (await call(hod, "PATCH", `/api/departments/${otherDeptId}`, { description: "PT nope" })).status, 403);

  console.log("\n── new project ───────────────────────────────────────────────");
  const projectBody = (name: string, departmentId: string) => ({
    name,
    departmentId,
    leadId: lead.id,
    description: "Created by the permission matrix; deleted at the end.",
  });
  record("dev starts a project -> 403", (await call(dev, "POST", "/api/projects", projectBody("PT dev project", deptId))).status, 403);
  record("lead starts a project -> 403", (await call(lead, "POST", "/api/projects", projectBody("PT lead project", deptId))).status, 403);
  record("admin starts a project -> 403", (await call(admin, "POST", "/api/projects", projectBody("PT admin project", deptId))).status, 403);
  const own = await call(manager, "POST", "/api/projects", projectBody("PT fixture project", deptId));
  record("manager starts a project -> 201", own.status, 201);
  if (own.status !== 201) throw new Error(`fixture project not created: ${own.status} ${JSON.stringify(own.json)}`);
  const projectId: string = own.json.id;
  check("the project belongs to the manager who started it", own.json.ownerId === manager.id, `ownerId ${own.json.ownerId}`);
  record("hod starts a project in their own department -> 201", (await call(hod, "POST", "/api/projects", projectBody("PT hod project", deptId))).status, 201);
  record("hod starts a project in another department -> 403", (await call(hod, "POST", "/api/projects", projectBody("PT hod elsewhere", otherDeptId))).status, 403);
  const other = await call(manager2, "POST", "/api/projects", projectBody("PT other project", deptId));
  record("another manager starts their own project -> 201", other.status, 201);
  const otherProjectId: string = other.json?.id;
  record("the CEO deletes an empty department -> 200", (await call(director, "DELETE", `/api/departments/${otherDeptId}`)).status, 200);

  console.log("\n── seeing a project ──────────────────────────────────────────");
  record("the CEO reads the project -> 200", (await call(director, "GET", `/api/projects/${projectId}`)).status, 200);
  record("hod reads a project in their department -> 200", (await call(hod, "GET", `/api/projects/${projectId}`)).status, 200);
  record("lead reads any project -> 200", (await call(lead, "GET", `/api/projects/${projectId}`)).status, 200);
  record("another manager (not on it) reads the project -> 404", (await call(manager2, "GET", `/api/projects/${projectId}`)).status, 404);
  record("dev (not on it yet) reads the project -> 404", (await call(dev, "GET", `/api/projects/${projectId}`)).status, 404);

  console.log("\n── add people ────────────────────────────────────────────────");
  // The project's lead runs it (2026-09-11): projectBody names `lead` as every project's lead.
  record("lead (the project's lead) adds a member -> 200", (await call(lead, "POST", `/api/projects/${projectId}/members`, { userId: dev.id })).status, 200);
  record("manager (owner) adds dev -> 200", (await call(manager, "POST", `/api/projects/${projectId}/members`, { userId: dev.id })).status, 200);
  record("manager (owner) adds dev2 -> 200", (await call(manager, "POST", `/api/projects/${projectId}/members`, { userId: dev2.id })).status, 200);
  record(
    "manager invites someone new by email -> 201",
    (await call(manager, "POST", `/api/projects/${projectId}/members`, { invite: { name: "PT invited", email: `${PREFIX}invited@orbit.local` } })).status,
    201,
  );
  record("another manager adds a member -> 404", (await call(manager2, "POST", `/api/projects/${projectId}/members`, { userId: dev3.id })).status, 404);
  record("added dev now reads the project -> 200", (await call(dev, "GET", `/api/projects/${projectId}`)).status, 200);
  record("dev (on it, but not its lead) adds someone -> 403", (await call(dev, "POST", `/api/projects/${projectId}/members`, { userId: dev3.id })).status, 403);

  // Several at once, after the project exists (owner, 2026-09-10).
  const batch = await call(manager, "POST", `/api/projects/${projectId}/members`, {
    invites: [
      { name: "PT batch one", emails: [`${PREFIX}batch1@orbit.local`], role: "TEAM_LEAD" },
      { emails: [`${PREFIX}batch2@orbit.local`] },
      { name: "Perm dev2", emails: [dev2.email] },
    ],
  });
  record("manager (owner) invites several at once -> 201", batch.status, 201);
  check("…two invited, the one already on it added", batch.json?.invited === 2 && batch.json?.added === 1, `invited ${batch.json?.invited}, added ${batch.json?.added}`);
  const batchOne = await prisma.user.findUnique({ where: { email: `${PREFIX}batch1@orbit.local` }, select: { status: true, role: true, departmentId: true } });
  check("…the new ones wait in the project's department, as the role given", batchOne?.status === "PENDING" && batchOne.role === "TEAM_LEAD" && batchOne.departmentId === deptId, JSON.stringify(batchOne));
  record(
    "a mistyped address refuses the whole list -> 400",
    (await call(manager, "POST", `/api/projects/${projectId}/members`, { invites: [{ emails: [`${PREFIX}batch3@orbit.local`] }, { emails: ["not-an-address"] }] })).status,
    400,
  );
  check("…and nobody on it was made", !(await prisma.user.findUnique({ where: { email: `${PREFIX}batch3@orbit.local` }, select: { id: true } })));
  record(
    "one address written for two people -> 400",
    (await call(manager, "POST", `/api/projects/${projectId}/members`, { invites: [{ emails: [`${PREFIX}batch4@orbit.local`] }, { emails: [`${PREFIX}batch4@orbit.local`] }] })).status,
    400,
  );
  record("lead invites several -> 403", (await call(lead, "POST", `/api/projects/${projectId}/members`, { invites: [{ emails: [`${PREFIX}bylead@orbit.local`] }] })).status, 403);
  record("another manager invites several -> 404", (await call(manager2, "POST", `/api/projects/${projectId}/members`, { invites: [{ emails: [`${PREFIX}bymanager2@orbit.local`] }] })).status, 404);
  record("admin invites several -> 403/404", (await call(admin, "POST", `/api/projects/${projectId}/members`, { invites: [{ emails: [`${PREFIX}byadmin@orbit.local`] }] })).status, [403, 404]);
  check("…the batch hands back a set-password link for each new person", (batch.json?.links ?? []).length === 2, `${(batch.json?.links ?? []).length} links`);
  // A fresh link to send by hand, on WhatsApp say, for someone who hasn't joined (owner, 2026-09-10).
  const batchOneId = (await prisma.user.findUnique({ where: { email: `${PREFIX}batch1@orbit.local` }, select: { id: true } }))?.id;
  if (batchOneId) {
    // The same people as Resend invite: the chain over that person's department.
    const fresh = await call(hod, "POST", `/api/users/${batchOneId}/resend`, { email: false });
    record("hod gets a new invite link for someone in their department, without an email -> 200", fresh.status, 200);
    check("…and it is a set-password link", /\/invite\/[A-Za-z0-9_-]{20,}$/.test(fresh.json?.inviteUrl ?? ""));
    record("a manager outside that department gets the link -> 403", (await call(manager, "POST", `/api/users/${batchOneId}/resend`, { email: false })).status, 403);
    record("dev gets someone's invite link -> 403", (await call(dev, "POST", `/api/users/${batchOneId}/resend`, { email: false })).status, 403);
  }

  console.log("\n── names ─────────────────────────────────────────────────────");
  // A name can change as often as it needs to (owner, 2026-09-10).
  record("manager renames dev -> 200", (await call(manager, "PATCH", `/api/users/${dev.id}`, { name: "Perm dev renamed" })).status, 200);
  record("…and renames dev again -> 200", (await call(manager, "PATCH", `/api/users/${dev.id}`, { name: "Perm dev" })).status, 200);
  check("…the second name is the one kept", (await prisma.user.findUnique({ where: { id: dev.id }, select: { name: true } }))?.name === "Perm dev");
  record("manager renames another manager -> 403", (await call(manager, "PATCH", `/api/users/${manager2.id}`, { name: "PT nope" })).status, 403);
  record("hod renames the CEO -> 403", (await call(hod, "PATCH", `/api/users/${director.id}`, { name: "PT nope" })).status, 403);
  record("dev renames dev2 -> 403", (await call(dev, "PATCH", `/api/users/${dev2.id}`, { name: "PT nope" })).status, 403);
  record("an empty name -> 400", (await call(manager, "PATCH", `/api/users/${dev.id}`, { name: "   " })).status, 400);
  record("dev renames themselves -> 200", (await call(dev, "PATCH", "/api/users/me", { name: "Perm dev self" })).status, 200);
  record("…and back again -> 200", (await call(dev, "PATCH", "/api/users/me", { name: "Perm dev" })).status, 200);
  // …and the address someone signs in with (owner, 2026-09-10).
  record("manager changes dev's email -> 200", (await call(manager, "PATCH", `/api/users/${dev.id}`, { email: `${PREFIX}dev-moved@orbit.local` })).status, 200);
  record("…onto someone else's address -> 409", (await call(manager, "PATCH", `/api/users/${dev.id}`, { email: dev2.email })).status, 409);
  record("…a malformed address -> 400", (await call(manager, "PATCH", `/api/users/${dev.id}`, { email: "not-an-address" })).status, 400);
  record("dev changes dev2's email -> 403", (await call(dev, "PATCH", `/api/users/${dev2.id}`, { email: `${PREFIX}nope@orbit.local` })).status, 403);
  record("…and dev's goes back to the old one -> 200", (await call(manager, "PATCH", `/api/users/${dev.id}`, { email: dev.email })).status, 200);

  console.log("\n── edit project ──────────────────────────────────────────────");
  record("dev renames the project -> 403", (await call(dev, "PATCH", `/api/projects/${projectId}`, { name: "PT nope" })).status, 403);
  record("lead renames the project -> 403", (await call(lead, "PATCH", `/api/projects/${projectId}`, { name: "PT nope" })).status, 403);
  record("manager (owner) renames the project -> 200", (await call(manager, "PATCH", `/api/projects/${projectId}`, { name: "PT fixture project" })).status, 200);
  record("hod (own department) sets the status -> 200", (await call(hod, "PATCH", `/api/projects/${projectId}`, { status: "ACTIVE" })).status, 200);
  record("another manager renames the project -> 404", (await call(manager2, "PATCH", `/api/projects/${projectId}`, { name: "PT nope" })).status, 404);
  // The percentage counts tasks done (lib/projects.ts) until the CEO — and only
  // the CEO — types one (owner, 2026-09-04).
  const beforeTyped = await call(director, "GET", `/api/projects/${projectId}`);
  const typed = await call(director, "PATCH", `/api/projects/${projectId}`, { progress: 10 });
  const afterTyped = await call(director, "GET", `/api/projects/${projectId}`);
  check(
    "the CEO sets the % by hand (200, his number stands)",
    typed.status === 200 && afterTyped.json?.progress === 10,
    `status ${typed.status}, progress ${beforeTyped.json?.progress} -> ${afterTyped.json?.progress}`,
  );
  const byHod = await call(hod, "PATCH", `/api/projects/${projectId}`, { progress: 90 });
  check("a head of department cannot set the %", byHod.status === 403, `status ${byHod.status}`);
  // Hand it back to the count for the checks that follow.
  await call(director, "PATCH", `/api/projects/${projectId}`, { progress: null });

  console.log("\n── give a task ───────────────────────────────────────────────");
  const dueDate = new Date(today.getTime() + 5 * 86_400_000).toISOString();
  record(
    "dev (member) gives a task to dev2 (member) -> 201",
    (await call(dev, "POST", "/api/tasks", { projectId, title: "PT task for dev2", dueDate, assigneeId: dev2.id })).status,
    201,
  );
  record(
    "dev gives a task to someone not on the project -> 400",
    (await call(dev, "POST", "/api/tasks", { projectId, title: "PT task for dev3", dueDate, assigneeId: dev3.id })).status,
    400,
  );
  const leadGiven = await call(lead, "POST", "/api/tasks", { projectId, title: "PT task for dev3", dueDate, assigneeId: dev3.id });
  record("lead gives a task to someone not on the project -> 201", leadGiven.status, 201);
  const people = await call(lead, "GET", `/api/projects/${projectId}/members`);
  check(
    "…and that person is now on the project",
    Array.isArray(people.json) && people.json.some((p: any) => p.id === dev3.id),
    `people: ${JSON.stringify(people.json?.map?.((p: any) => p.name))}`,
  );
  record(
    "dev gives a task in a project they're not on -> 403/404",
    (await call(dev, "POST", "/api/tasks", { projectId: otherProjectId, title: "PT nope", dueDate })).status,
    [403, 404],
  );

  console.log("\n── reassign / edit a task ────────────────────────────────────");
  const mine = await call(dev, "POST", "/api/tasks", { projectId, title: "PT dev's own task", dueDate });
  record("dev gives a task with no one named -> 201", mine.status, 201);
  if (mine.status !== 201) throw new Error(`root task not created: ${mine.status}`);
  const rootId: string = mine.json.id;
  check("…and it lands on the giver", mine.json.assigneeId === dev.id, `assigneeId ${mine.json.assigneeId}`);
  record("dev reassigns it to dev2 -> 200", (await call(dev, "PATCH", `/api/tasks/${rootId}`, { assigneeId: dev2.id })).status, 200);
  record("dev3 (holds a task here) stars it -> 200", (await call(dev3, "PATCH", `/api/tasks/${rootId}`, { important: true })).status, 200);
  // Owner, 2026-09-04: the tick is a lead's to give.
  record("dev2 says Doing -> 200", (await call(dev2, "PATCH", `/api/tasks/${rootId}`, { status: "DOING" })).status, 200);
  record("dev2 ticks it done -> 403", (await call(dev2, "PATCH", `/api/tasks/${rootId}`, { status: "DONE" })).status, 403);
  record("lead ticks it done -> 200", (await call(lead, "PATCH", `/api/tasks/${rootId}`, { status: "DONE" })).status, 200);
  record("another manager edits it -> 404", (await call(manager2, "PATCH", `/api/tasks/${rootId}`, { title: "PT nope" })).status, 404);
  // A task's progress and its meetings (owner, 2026-09-11).
  record("dev2 (holder) marks its progress -> 200", (await call(dev2, "PATCH", `/api/tasks/${rootId}`, { progress: 30 })).status, 200);
  record("progress over 100 -> 400", (await call(dev2, "PATCH", `/api/tasks/${rootId}`, { progress: 120 })).status, 400);
  record("another manager marks its progress -> 404", (await call(manager2, "PATCH", `/api/tasks/${rootId}`, { progress: 50 })).status, 404);
  const taskMeetingDay = workingDay(today, 3);
  const taskMeeting = { title: "PT task meeting", date: taskMeetingDay, startTime: "10:00", taskId: rootId };
  record("dev schedules a meeting on the task -> 403", (await call(dev, "POST", "/api/events", { ...taskMeeting, attendeeIds: [dev.id] })).status, 403);
  record("another manager puts a meeting on a task they can't see -> 404", (await call(manager2, "POST", "/api/events", { ...taskMeeting, attendeeIds: [manager2.id] })).status, 404);
  const onTask = await call(manager, "POST", "/api/events", { ...taskMeeting, attendeeIds: [dev.id, dev2.id] });
  record("manager (owner) schedules a meeting on the task -> 201", onTask.status, 201);
  check("…and the task lists it", ((await call(dev2, "GET", `/api/tasks/${rootId}/meetings`)).json ?? []).some((m: any) => m.id === onTask.json?.id));
  record("another manager reads the task's meetings -> 404", (await call(manager2, "GET", `/api/tasks/${rootId}/meetings`)).status, 404);

  console.log("\n── steps ─────────────────────────────────────────────────────");
  record(
    "a step with its own person -> 400",
    (await call(dev, "POST", "/api/tasks", { projectId, parentId: rootId, title: "PT step", assigneeId: dev2.id })).status,
    400,
  );
  const step = await call(dev, "POST", "/api/tasks", { projectId, parentId: rootId, title: "PT step" });
  record("a step under a task -> 201", step.status, 201);
  check("…its parent is the root task", step.json?.parentId === rootId, `parentId ${step.json?.parentId}`);
  const deeper = await call(dev, "POST", "/api/tasks", { projectId, parentId: step.json?.id, title: "PT step of a step" });
  record("a step under a step -> 201", deeper.status, 201);
  check("…re-pointed to the root task", deeper.json?.parentId === rootId, `parentId ${deeper.json?.parentId}`);

  console.log("\n── milestones ────────────────────────────────────────────────");
  const reviewDay = workingDay(today, 7);
  // The project's lead runs it (2026-09-11), milestones included. Its own name and a
  // review date well clear of the days the meeting cases use, removed straight away.
  const leadMilestone = await call(lead, "POST", "/api/milestones", { projectId, name: "PT lead milestone", reviewDate: workingDay(today, 30) });
  record("lead (the project's lead) adds a milestone -> 201", leadMilestone.status, 201);
  if (leadMilestone.json?.id) record("…and removes it again -> 200", (await call(lead, "DELETE", `/api/milestones/${leadMilestone.json.id}`)).status, 200);
  const ms = await call(manager, "POST", "/api/milestones", { projectId, name: "PT milestone", reviewDate: reviewDay });
  record("manager adds a milestone -> 201", ms.status, 201);
  if (ms.status !== 201) throw new Error(`milestone not created: ${ms.status} ${JSON.stringify(ms.json)}`);
  const milestoneId: string = ms.json.id;
  const reviewEventId: string | null = ms.json.reviewEventId ?? null;
  check("…it has a review meeting", Boolean(reviewEventId), "reviewEventId null");

  const boxed = await call(manager, "POST", "/api/tasks", { projectId, milestoneId, title: "PT milestone task", assigneeId: dev.id });
  record("manager gives a task inside the milestone -> 201", boxed.status, 201);
  const boxedId: string = boxed.json?.id;
  check("…'by when' defaulted to the review date", (boxed.json?.dueDate ?? "").slice(0, 10) === reviewDay, `dueDate ${boxed.json?.dueDate}`);

  // The task route refreshes the review's attendees in the background — poll.
  const review = await waitFor(async () => {
    const ev = (await eventsOn(manager, reviewDay)).find((e) => e.id === reviewEventId);
    return ev && ev.attendees.some((a: any) => a.userId === dev.id) ? ev : null;
  });
  check("the review meeting shows on the calendar that day", Boolean(review), "not found (or dev never joined it)");
  check(
    "…its attendees include the lead and the task holder",
    Boolean(review) && [lead.id, dev.id].every((id) => review.attendees.some((a: any) => a.userId === id)),
    `attendees: ${JSON.stringify(review?.attendees?.map((a: any) => a.name))}`,
  );
  const movedDay = workingDay(reviewDay, 1);
  record("manager moves the review date -> 200", (await call(manager, "PATCH", `/api/milestones/${milestoneId}`, { reviewDate: movedDay })).status, 200);
  const movedReview = (await eventsOn(manager, movedDay)).find((e) => e.id === reviewEventId);
  check("…the review meeting moved with it", Boolean(movedReview), `no meeting ${reviewEventId} on ${movedDay}`);

  console.log("\n── review outcome (Needs your OK) ────────────────────────────");
  record(
    "manager records an outcome -> 403",
    (await call(manager, "POST", `/api/milestones/${milestoneId}/outcome`, { outcome: "ON_TRACK", note: "PT fine" })).status,
    403,
  );
  record(
    "hod records an outcome -> 403",
    (await call(hod, "POST", `/api/milestones/${milestoneId}/outcome`, { outcome: "ON_TRACK", note: "PT fine" })).status,
    403,
  );
  record(
    "director records an outcome -> 200",
    (await call(director, "POST", `/api/milestones/${milestoneId}/outcome`, { outcome: "ON_TRACK", note: "PT on track" })).status,
    200,
  );
  const outcomeNotes = await call(director, "GET", `/api/comments?targetType=MILESTONE&targetId=${milestoneId}`);
  check(
    "…the outcome became a note on the milestone",
    Array.isArray(outcomeNotes.json) && outcomeNotes.json.some((n: any) => String(n.body).startsWith("On track")),
    `notes: ${JSON.stringify(outcomeNotes.json)}`,
  );
  // The project's % is tasks done over its tasks (root tasks, not archived, not
  // deleted — the rows lib/projects.ts counts), never a number anyone typed.
  const projectTasks = await call(director, "GET", `/api/tasks?projectId=${projectId}`);
  const roots = (Array.isArray(projectTasks.json) ? projectTasks.json : []).filter((t: any) => t.parentId === null && !t.archived);
  const doneRoots = roots.filter((t: any) => t.status === "DONE").length;
  const computed = roots.length === 0 ? 0 : Math.round((doneRoots / roots.length) * 100);
  const afterOutcome = await call(director, "GET", `/api/projects/${projectId}`);
  check(
    "…and the project's progress is tasks done over tasks (computed)",
    roots.length > 0 && afterOutcome.json?.progress === computed,
    `progress ${afterOutcome.json?.progress}, computed ${doneRoots}/${roots.length} = ${computed}`,
  );

  record("dev deletes the milestone -> 403", (await call(dev, "DELETE", `/api/milestones/${milestoneId}`)).status, 403);
  record("manager deletes the milestone -> 200", (await call(manager, "DELETE", `/api/milestones/${milestoneId}`)).status, 200);
  const unboxed = await call(manager, "GET", `/api/tasks/${boxedId}`);
  check("…its task moved to 'Not in a milestone yet'", unboxed.status === 200 && unboxed.json?.milestoneId === null, `milestoneId ${unboxed.json?.milestoneId}`);

  console.log("\n── notes ─────────────────────────────────────────────────────");
  const note = await call(dev, "POST", "/api/comments", { targetType: "TASK", targetId: rootId, body: "PT note from dev" });
  record("dev posts a note on a task in their project -> 201", note.status, 201);
  record("lead deletes someone else's note -> 403", (await call(lead, "DELETE", `/api/comments/${note.json?.id}`)).status, 403);
  record("manager (owner) deletes someone else's note -> 403", (await call(manager, "DELETE", `/api/comments/${note.json?.id}`)).status, 403);
  record("the author deletes their own note -> 200", (await call(dev, "DELETE", `/api/comments/${note.json?.id}`)).status, 200);
  record("dev posts a project note -> 201", (await call(dev, "POST", "/api/comments", { targetType: "PROJECT", targetId: projectId, body: "PT project note" })).status, 201);
  record(
    "dev reads notes of a project they're not on -> 404",
    (await call(dev, "GET", `/api/comments?targetType=PROJECT&targetId=${otherProjectId}`)).status,
    404,
  );
  record(
    "dev posts a note on a project they're not on -> 404",
    (await call(dev, "POST", "/api/comments", { targetType: "PROJECT", targetId: otherProjectId, body: "PT nope" })).status,
    404,
  );

  console.log("\n── meetings ──────────────────────────────────────────────────");
  const meetDay = workingDay(today, 5);
  const meetingBody = { title: "PT meeting", date: meetDay, projectId, startTime: "10:00", attendeeIds: [dev.id] };
  record("dev schedules a meeting -> 403", (await call(dev, "POST", "/api/events", meetingBody)).status, 403);
  record("lead schedules a meeting -> 403", (await call(lead, "POST", "/api/events", meetingBody)).status, 403);
  const meeting = await call(manager, "POST", "/api/events", meetingBody);
  record("manager schedules a meeting with dev -> 201", meeting.status, 201);
  const eventId: string = meeting.json?.id;
  record("dev replies Can't -> 200", (await call(dev, "POST", `/api/events/${eventId}/reply`, { response: "NO" })).status, 200);
  record("dev2 (not invited) replies -> 404", (await call(dev2, "POST", `/api/events/${eventId}/reply`, { response: "YES" })).status, 404);
  record("dev asks to reschedule -> 403", (await call(dev, "GET", `/api/events/${eventId}/reschedule`)).status, 403);
  record("the CEO asks to reschedule -> 200", (await call(director, "GET", `/api/events/${eventId}/reschedule`)).status, 200);
  const slots = await call(manager, "GET", `/api/events/${eventId}/reschedule`);
  record("manager (organiser) asks to reschedule -> 200", slots.status, 200);
  const slotList: string[] = Array.isArray(slots.json?.slots) ? slots.json.slots : [];
  check("…three slots offered", slotList.length === 3, `slots ${JSON.stringify(slotList)}`);
  check(
    "…every slot is a working day (Mon–Fri)",
    slotList.length > 0 && slotList.every((s) => [1, 2, 3, 4, 5].includes(new Date(s).getUTCDay())),
    `slots ${JSON.stringify(slotList)}`,
  );
  const newDay = (slotList[0] ?? "").slice(0, 10);
  record("manager reschedules to the first slot -> 200", (await call(manager, "POST", `/api/events/${eventId}/reschedule`, { date: newDay })).status, 200);
  const movedMeeting = (await eventsOn(manager, newDay)).find((e) => e.id === eventId);
  check("…the meeting is on the new day", Boolean(movedMeeting), `no meeting ${eventId} on ${newDay}`);
  check(
    "…and every reply was cleared",
    Boolean(movedMeeting) && movedMeeting.attendees.length > 0 && movedMeeting.attendees.every((a: any) => a.response === null),
    `attendees ${JSON.stringify(movedMeeting?.attendees)}`,
  );

  console.log("\n── accounts ──────────────────────────────────────────────────");
  const mint = (actor: Actor, label: string, role: string) =>
    call(actor, "POST", "/api/users", { name: `PT ${label}`, email: `${PREFIX}${label}@orbit.local`, role });
  record("lead creates a team member -> 403", (await mint(lead, "leadmade", "RESOURCE")).status, 403);
  record("manager creates a team lead -> 201", (await mint(manager, "mgrlead", "TEAM_LEAD")).status, 201);
  record("manager creates a manager -> 403", (await mint(manager, "mgrmgr", "MANAGER")).status, 403);
  // A head places people in the department they head (2026-09-11).
  record("hod creates a manager in their department -> 201", (await call(hod, "POST", "/api/users", { name: "PT hodmgr", email: `${PREFIX}hodmgr@orbit.local`, role: "MANAGER", departmentId: deptId })).status, 201);
  record("the CEO creates a head of department -> 201", (await mint(director, "dirhod", "HOD")).status, 201);
  record("admin creates a head of department -> 403", (await mint(admin, "admhod", "HOD")).status, 403);
  record("admin creates a manager -> 201", (await mint(admin, "admmgr", "MANAGER")).status, 201);
  // A manager places people only in a department they run; this one runs none (2026-09-11).
  record("a manager with no department places dev in one -> 403", (await call(manager, "PATCH", `/api/users/${dev.id}`, { departmentId: deptId })).status, 403);
  record("lead places dev in a department -> 403", (await call(lead, "PATCH", `/api/users/${dev.id}`, { departmentId: deptId })).status, 403);
  record("dev reads the people list -> 403", (await call(dev, "GET", "/api/users")).status, 403);
  record("lead reads the people list -> 200", (await call(lead, "GET", "/api/users")).status, 200);
  record("admin reads the people list -> 200", (await call(admin, "GET", "/api/users")).status, 200);

  console.log("\n── organisation set-up (2026-09-11) ─────────────────────────");
  const unsigned = async (method: string, path: string, body: unknown) =>
    (await fetch(BASE + path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).status;
  // A head or a manager places people only in a department they run.
  record("hod creates someone and leaves them unplaced -> 400", (await mint(hod, "hodloose", "RESOURCE")).status, 400);
  const elsewhere = await prisma.department.findFirst({ where: { id: { not: deptId }, name: { not: { startsWith: "PT " } } }, select: { id: true } });
  if (elsewhere) {
    record(
      "hod creates someone in another department -> 403",
      (await call(hod, "POST", "/api/users", { name: "PT hodelse", email: `${PREFIX}hodelse@orbit.local`, role: "RESOURCE", departmentId: elsewhere.id })).status,
      403,
    );
  }
  const placedPassword = generateTempPassword(16);
  const placedUser = await prisma.user.create({
    data: { email: `${PREFIX}placedmgr@orbit.local`, name: "Perm placed manager", role: "MANAGER", departmentId: deptId, passwordHash: await hashPassword(placedPassword) },
  });
  userIds.push(placedUser.id);
  const placedMgr: Actor = { label: "placedmgr", email: placedUser.email, id: placedUser.id, cookie: await signIn(placedUser.email, placedPassword), password: placedPassword };
  record("a manager places dev in their own department -> 200", (await call(placedMgr, "PATCH", `/api/users/${dev.id}`, { departmentId: deptId })).status, 200);
  if (elsewhere) record("…but not in another -> 403", (await call(placedMgr, "PATCH", `/api/users/${dev2.id}`, { departmentId: elsewhere.id })).status, 403);

  // Several people at once, each with a position or none.
  const invitePeople = (actor: Actor, people: unknown[]) => call(actor, "POST", "/api/users/invite", { people });
  const pair = await invitePeople(placedMgr, [
    { name: "PT pm one", emails: [`${PREFIX}pm1@orbit.local`], departmentId: deptId },
    { name: "PT pm two", emails: [`${PREFIX}pm2@orbit.local`], role: "TEAM_LEAD", departmentId: deptId },
  ]);
  record("a manager invites two at once into their own department -> 201", pair.status, 201);
  check(
    "…one left a Team member, one a team lead, each with a link",
    pair.json?.people?.[0]?.role === "RESOURCE" && pair.json?.people?.[1]?.role === "TEAM_LEAD" && (pair.json?.people ?? []).every((p: any) => /\/invite\//.test(p.url)),
    JSON.stringify((pair.json?.people ?? []).map((p: any) => p.role)),
  );
  record("…leaving them unplaced -> 400", (await invitePeople(placedMgr, [{ emails: [`${PREFIX}pm3@orbit.local`] }])).status, 400);
  const mixed = await invitePeople(placedMgr, [
    { emails: [`${PREFIX}pm4@orbit.local`], departmentId: deptId },
    { emails: [`${PREFIX}pm5@orbit.local`], role: "HOD", departmentId: deptId },
  ]);
  record("…a batch holding a position they may not give is refused whole -> 403", mixed.status, 403);
  check("…and nobody in it is made", (await prisma.user.count({ where: { email: { in: [`${PREFIX}pm4@orbit.local`, `${PREFIX}pm5@orbit.local`] } } })) === 0);
  record(
    "the CEO invites a head and a co-founder at once -> 201",
    (await invitePeople(director, [{ emails: [`${PREFIX}ceohod@orbit.local`], role: "HOD" }, { emails: [`${PREFIX}ceoco@orbit.local`], role: "CO_FOUNDER" }])).status,
    201,
  );
  record("an invite as CEO is refused -> 400", (await invitePeople(director, [{ emails: [`${PREFIX}ceo2@orbit.local`], role: "FOUNDER" }])).status, 400);
  record("the admin invites a head -> 403", (await invitePeople(admin, [{ emails: [`${PREFIX}adminhod@orbit.local`], role: "HOD" }])).status, 403);
  record("lead invites anyone -> 403", (await invitePeople(lead, [{ emails: [`${PREFIX}leadinv@orbit.local`] }])).status, 403);
  record("dev invites anyone -> 403", (await invitePeople(dev, [{ emails: [`${PREFIX}devinv@orbit.local`] }])).status, 403);
  record("signed out, inviting -> 401", await unsigned("POST", "/api/users/invite", { people: [{ emails: [`${PREFIX}anon@orbit.local`] }] }), 401);

  // A head of department heads the department they are placed in, and stops when they are no longer a head.
  const headless = await call(director, "POST", "/api/departments", { name: "PT headless department", color: "#0d9488" });
  const headlessId: string = headless.json?.id ?? "";
  const newHead = await call(director, "POST", "/api/users", { name: "PT new head", email: `${PREFIX}newhead@orbit.local`, role: "HOD", departmentId: headlessId });
  record("the CEO invites a head into a department with none -> 201", newHead.status, 201);
  const headOfHeadless = async () => (await prisma.department.findUnique({ where: { id: headlessId }, select: { hodId: true } }))?.hodId ?? null;
  check("…who heads it at once", (await headOfHeadless()) === newHead.json?.user?.id);
  record("…the CEO makes them a manager -> 200", (await call(director, "PATCH", `/api/users/${newHead.json?.user?.id}`, { role: "MANAGER" })).status, 200);
  check("…and the department has no head again", (await headOfHeadless()) === null);

  // A department with people in it isn't deleted.
  record("the CEO deletes a department that still has a person -> 409", (await call(director, "DELETE", `/api/departments/${headlessId}`)).status, 409);
  await call(director, "PATCH", `/api/users/${newHead.json?.user?.id}`, { departmentId: null });
  record("…and once they are moved out -> 200", (await call(director, "DELETE", `/api/departments/${headlessId}`)).status, 200);

  // Nobody resets their own password from People; your own sign-in email changes with your password.
  record("the admin resets their own password from People -> 403", (await call(admin, "PATCH", `/api/users/${admin.id}`, { reset: true })).status, 403);
  record("…and is still signed in -> 200", (await call(admin, "GET", "/api/users/me")).status, 200);
  const myEmail = (body: unknown) => call(dev, "POST", "/api/users/me/email", body);
  record("dev changes their sign-in email with the wrong password -> 403", (await myEmail({ email: `${PREFIX}dev-new@orbit.local`, password: "not-it-at-all" })).status, 403);
  record("…to someone else's address -> 409", (await myEmail({ email: lead.email, password: dev.password })).status, 409);
  record("…to something that isn't an address -> 400", (await myEmail({ email: "no-at-sign", password: dev.password })).status, 400);
  record("…to a new one, with their password -> 200", (await myEmail({ email: `${PREFIX}dev-new@orbit.local`, password: dev.password })).status, 200);
  record("…and back -> 200", (await myEmail({ email: dev.email, password: dev.password })).status, 200);
  record("signed out, changing an email -> 401", await unsigned("POST", "/api/users/me/email", { email: `${PREFIX}anon2@orbit.local`, password: "x" }), 401);

  // A project's lead runs it.
  const extra = await prisma.user.create({
    data: { email: `${PREFIX}extra@orbit.local`, name: "Perm extra", role: "RESOURCE", passwordHash: await hashPassword(generateTempPassword(16)) },
  });
  userIds.push(extra.id);
  const ledProject = await call(director, "POST", "/api/projects", { name: "PT lead-run project", departmentId: deptId, leadId: lead.id });
  record("the CEO starts a project led by the team lead -> 201", ledProject.status, 201);
  record("the project's lead adds someone to it -> 200", (await call(lead, "POST", `/api/projects/${ledProject.json?.id}/members`, { userId: extra.id })).status, [200, 201]);
  record("another manager adds someone to it -> 404", (await call(manager2, "POST", `/api/projects/${ledProject.json?.id}/members`, { userId: extra.id })).status, 404);

  console.log("\n── walls: admin ──────────────────────────────────────────────");
  record("admin lists projects -> 403", (await call(admin, "GET", "/api/projects")).status, 403);
  record("admin lists tasks -> 403", (await call(admin, "GET", "/api/tasks?view=all")).status, 403);
  record("admin reads Today -> 403", (await call(admin, "GET", "/api/today")).status, 403);
  record("admin reads the calendar -> 403", (await call(admin, "GET", `/api/calendar?from=${meetDay}&to=${meetDay}`)).status, 403);
  record("a PERSON can't be created through People -> 403", (await mint(director, "person-x", "PERSON")).status, 403);

  console.log("\n── walls: person ─────────────────────────────────────────────");
  // A Well Being login, made directly (the Family tab is the only real door),
  // owned by a throwaway manager. The middleware answers 403 at the edge for
  // every /api path outside /api/routine/kid, and requireUser backs it up.
  const personPassword = generateTempPassword(16);
  const personEmail = `${PREFIX}person@orbit.local`;
  const personUser = await prisma.user.create({
    data: { email: personEmail, name: "PT person", role: "PERSON", passwordHash: await hashPassword(personPassword) },
  });
  userIds.push(personUser.id);
  await prisma.person.create({ data: { managerId: manager2.id, userId: personUser.id, name: "PT person" } });
  const person: Actor = { label: "person", email: personEmail, id: personUser.id, cookie: await signIn(personEmail, personPassword) };
  const walled: [string, string, unknown?][] = [
    ["GET", "/api/projects"],
    ["POST", "/api/projects", projectBody("PT person project", deptId)],
    ["GET", `/api/projects/${projectId}`],
    ["PATCH", `/api/projects/${projectId}`, { name: "PT nope" }],
    ["GET", `/api/projects/${projectId}/members`],
    ["GET", "/api/tasks?view=all"],
    ["GET", "/api/tasks?scope=private"],
    ["POST", "/api/tasks", { projectId, title: "PT nope", dueDate }],
    ["GET", `/api/tasks/${rootId}`],
    ["PATCH", `/api/tasks/${rootId}`, { title: "PT nope" }],
    ["GET", "/api/today"],
    ["GET", `/api/calendar?from=${meetDay}&to=${meetDay}`],
    ["GET", `/api/comments?targetType=TASK&targetId=${rootId}`],
    ["POST", "/api/comments", { targetType: "TASK", targetId: rootId, body: "PT nope" }],
    ["GET", `/api/milestones?projectId=${projectId}`],
    ["POST", "/api/milestones", { projectId, name: "PT nope", reviewDate: reviewDay }],
    ["GET", "/api/users"],
    ["POST", "/api/users", { name: "PT nope", email: `${PREFIX}nope@orbit.local`, role: "RESOURCE" }],
    ["GET", "/api/users/me"],
    ["GET", "/api/departments"],
    ["POST", "/api/departments", { name: "PT nope", color: "#0d9488" }],
    ["GET", "/api/notifications"],
    ["POST", "/api/events", meetingBody],
    ["GET", "/api/my-space/departments"],
  ];
  let walledOk = 0;
  for (const [method, path, body] of walled) {
    const r = await call(person, method, path, body);
    if (r.status === 403) walledOk++;
    else console.log(`      person ${method} ${path} -> ${r.status}`);
  }
  check(`a PERSON gets 403 from every work endpoint (${walledOk}/${walled.length}, ≥20 distinct)`, walledOk === walled.length && walled.length >= 20);

  console.log("\n── cron ──────────────────────────────────────────────────────");
  record("cron without the secret -> 401", (await call(null, "GET", "/api/cron/tomorrow")).status, 401);
  record("cron with a wrong secret -> 401", (await call(null, "GET", "/api/cron/tomorrow", undefined, { authorization: "Bearer wrong" })).status, 401);

  console.log("\n── My notes: isolation ───────────────────────────────────────");
  const pdept = await call(dev, "POST", "/api/my-space/departments", { name: "PT personal department" });
  record("dev creates a personal department -> 201", pdept.status, 201);
  const pproj = await call(dev, "POST", "/api/my-space/projects", { departmentId: pdept.json?.id, name: "PT personal project" });
  record("dev creates a personal project -> 201", pproj.status, 201);
  const priv = await call(dev, "POST", "/api/tasks", { isPrivate: true, personalProjectId: pproj.json?.id, title: "PT private note" });
  record("dev creates a private note -> 201", priv.status, 201);
  const privId: string = priv.json?.id;
  record("dev reads their own private note -> 200", (await call(dev, "GET", `/api/tasks/${privId}`)).status, 200);
  record("dev2 reads it -> 404", (await call(dev2, "GET", `/api/tasks/${privId}`)).status, 404);
  record("dev2 reads its notes -> 404", (await call(dev2, "GET", `/api/comments?targetType=TASK&targetId=${privId}`)).status, 404);
  record("the CEO reads it -> 404 (no role override)", (await call(director, "GET", `/api/tasks/${privId}`)).status, 404);
}

/**
 * Only what this run created, in FK-safe order. Restrict FKs that would wall
 * off a user delete: Comment.author, Invite.createdBy, CalendarEvent.createdBy.
 * Milestones, members and project tasks cascade with their project; a review
 * meeting does NOT (SetNull), so events go by creator. A private note's
 * ownerId would only SetNull, so tasks go by owner too.
 */
async function cleanup(userIds: string[]) {
  console.log("\n── cleanup ───────────────────────────────────────────────────");
  const tasks = await prisma.task.deleteMany({
    where: { OR: [{ title: { startsWith: "PT " } }, { ownerId: { in: userIds } }, { givenById: { in: userIds } }] },
  });
  const notes = await prisma.comment.deleteMany({ where: { authorId: { in: userIds } } });
  const events = await prisma.calendarEvent.deleteMany({
    where: { OR: [{ createdById: { in: userIds } }, { title: { startsWith: "PT " } }] },
  });
  const projects = await prisma.project.deleteMany({
    where: { OR: [{ name: { startsWith: "PT " } }, { ownerId: { in: userIds } }] },
  });
  const departments = await prisma.department.deleteMany({ where: { name: { startsWith: "PT " } } });
  await prisma.invite.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.task.updateMany({ where: { completedById: { in: userIds } }, data: { completedById: null } });
  await prisma.task.updateMany({ where: { assigneeId: { in: userIds } }, data: { assigneeId: null } });
  await prisma.task.updateMany({ where: { givenById: { in: userIds } }, data: { givenById: null } });
  await prisma.project.updateMany({ where: { leadId: { in: userIds } }, data: { leadId: null } });
  // Invitees (PENDING, never signed in) first: their Invite rows cascade with
  // them, and an inviter can't go while an invite it created remains.
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX }, status: "PENDING" } });
  await prisma.notification.deleteMany({ where: { OR: [{ title: { contains: "PT " } }, { body: { contains: "PT " } }] } });
  const users = await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  console.log(
    `removed ${users.count} throwaway accounts (tasks ${tasks.count}, notes ${notes.count}, ` +
      `events ${events.count}, projects ${projects.count}, departments ${departments.count})`,
  );
  console.log(`remaining ${PREFIX}* accounts: ${await prisma.user.count({ where: { email: { startsWith: PREFIX } } })}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
