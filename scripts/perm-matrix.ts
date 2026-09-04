/**
 * The permission matrix (records/plans/restructure-plan.md §3), exercised
 * against a running server.
 *
 * Creates throwaway `permtest-` accounts — one per mintable role, NEVER a
 * FOUNDER (capped at one, never minted) — a throwaway department the director
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

type Actor = { label: string; email: string; cookie: string; id: string };
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
    { label: "director", role: "DIRECTOR" },
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
    actors[spec.label] = { label: spec.label, email, id: user.id, cookie: await signIn(email, password) };
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
  const { director, hod, manager, manager2, lead, dev, dev2, dev3, admin } = actors;
  const today = new Date();

  console.log("\n── departments ───────────────────────────────────────────────");
  record("manager creates a department -> 403", (await call(manager, "POST", "/api/departments", { name: "PT manager department", color: "#0d9488" })).status, 403);
  const dept = await call(director, "POST", "/api/departments", { name: "PT department", color: "#0d9488", hodId: hod.id });
  record("director creates a department, hod as its head -> 201", dept.status, 201);
  if (dept.status !== 201) throw new Error(`fixture department not created: ${dept.status} ${JSON.stringify(dept.json)}`);
  const deptId: string = dept.json.id;
  const otherDept = await call(director, "POST", "/api/departments", { name: "PT other department", color: "#7c3aed" });
  record("director creates a second, empty department -> 201", otherDept.status, 201);
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
  record("director deletes an empty department -> 200", (await call(director, "DELETE", `/api/departments/${otherDeptId}`)).status, 200);

  console.log("\n── seeing a project ──────────────────────────────────────────");
  record("director reads the project -> 200", (await call(director, "GET", `/api/projects/${projectId}`)).status, 200);
  record("hod reads a project in their department -> 200", (await call(hod, "GET", `/api/projects/${projectId}`)).status, 200);
  record("lead reads any project -> 200", (await call(lead, "GET", `/api/projects/${projectId}`)).status, 200);
  record("another manager (not on it) reads the project -> 404", (await call(manager2, "GET", `/api/projects/${projectId}`)).status, 404);
  record("dev (not on it yet) reads the project -> 404", (await call(dev, "GET", `/api/projects/${projectId}`)).status, 404);

  console.log("\n── add people ────────────────────────────────────────────────");
  record("lead adds a member -> 403", (await call(lead, "POST", `/api/projects/${projectId}/members`, { userId: dev.id })).status, 403);
  record("manager (owner) adds dev -> 200", (await call(manager, "POST", `/api/projects/${projectId}/members`, { userId: dev.id })).status, 200);
  record("manager (owner) adds dev2 -> 200", (await call(manager, "POST", `/api/projects/${projectId}/members`, { userId: dev2.id })).status, 200);
  record(
    "manager invites someone new by email -> 201",
    (await call(manager, "POST", `/api/projects/${projectId}/members`, { invite: { name: "PT invited", email: `${PREFIX}invited@orbit.local` } })).status,
    201,
  );
  record("another manager adds a member -> 404", (await call(manager2, "POST", `/api/projects/${projectId}/members`, { userId: dev3.id })).status, 404);
  record("added dev now reads the project -> 200", (await call(dev, "GET", `/api/projects/${projectId}`)).status, 200);

  console.log("\n── edit project ──────────────────────────────────────────────");
  record("dev renames the project -> 403", (await call(dev, "PATCH", `/api/projects/${projectId}`, { name: "PT nope" })).status, 403);
  record("lead renames the project -> 403", (await call(lead, "PATCH", `/api/projects/${projectId}`, { name: "PT nope" })).status, 403);
  record("manager (owner) renames the project -> 200", (await call(manager, "PATCH", `/api/projects/${projectId}`, { name: "PT fixture project" })).status, 200);
  record("hod (own department) sets the status -> 200", (await call(hod, "PATCH", `/api/projects/${projectId}`, { status: "ACTIVE" })).status, 200);
  record("another manager renames the project -> 404", (await call(manager2, "PATCH", `/api/projects/${projectId}`, { name: "PT nope" })).status, 404);
  record("manager sets progress -> 403", (await call(manager, "PATCH", `/api/projects/${projectId}`, { progress: 10 })).status, 403);
  record("director sets progress -> 200", (await call(director, "PATCH", `/api/projects/${projectId}`, { progress: 10 })).status, 200);

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
  record("dev2 completes it -> 200", (await call(dev2, "PATCH", `/api/tasks/${rootId}`, { status: "DONE" })).status, 200);
  record("another manager edits it -> 404", (await call(manager2, "PATCH", `/api/tasks/${rootId}`, { title: "PT nope" })).status, 404);

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
  record(
    "lead adds a milestone -> 403",
    (await call(lead, "POST", "/api/milestones", { projectId, name: "PT milestone", reviewDate: reviewDay })).status,
    403,
  );
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
    (await call(director, "POST", `/api/milestones/${milestoneId}/outcome`, { outcome: "ON_TRACK", note: "PT on track", progress: 40 })).status,
    200,
  );
  const outcomeNotes = await call(director, "GET", `/api/comments?targetType=MILESTONE&targetId=${milestoneId}`);
  check(
    "…the outcome became a note on the milestone",
    Array.isArray(outcomeNotes.json) && outcomeNotes.json.some((n: any) => String(n.body).startsWith("On track")),
    `notes: ${JSON.stringify(outcomeNotes.json)}`,
  );
  const afterOutcome = await call(director, "GET", `/api/projects/${projectId}`);
  check("…and the project's progress was set with it", afterOutcome.json?.progress === 40, `progress ${afterOutcome.json?.progress}`);

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
  record("director asks to reschedule -> 200", (await call(director, "GET", `/api/events/${eventId}/reschedule`)).status, 200);
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
  record("hod creates a manager -> 201", (await mint(hod, "hodmgr", "MANAGER")).status, 201);
  record("director creates a head of department -> 201", (await mint(director, "dirhod", "HOD")).status, 201);
  record("admin creates a director -> 403", (await mint(admin, "admdir", "DIRECTOR")).status, 403);
  record("admin creates a manager -> 201", (await mint(admin, "admmgr", "MANAGER")).status, 201);
  record("manager places dev in a department -> 200", (await call(manager, "PATCH", `/api/users/${dev.id}`, { departmentId: deptId })).status, 200);
  record("lead places dev in a department -> 403", (await call(lead, "PATCH", `/api/users/${dev.id}`, { departmentId: deptId })).status, 403);
  record("dev reads the people list -> 403", (await call(dev, "GET", "/api/users")).status, 403);
  record("lead reads the people list -> 200", (await call(lead, "GET", "/api/users")).status, 200);
  record("admin reads the people list -> 200", (await call(admin, "GET", "/api/users")).status, 200);

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
  record("director reads it -> 404 (no role override)", (await call(director, "GET", `/api/tasks/${privId}`)).status, 404);
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
