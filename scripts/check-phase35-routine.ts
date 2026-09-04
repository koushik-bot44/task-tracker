/**
 * Phase 35 — the Routine v2 feature + the PERSON wall (was CHILD).
 *
 * CRITICAL: a PERSON account may reach NOTHING work. This enumerates every work
 * API family and asserts a PERSON is 403'd on each; that a PERSON is invisible in
 * People and cannot be created there; that the manager routine flow works (seed
 * grid, add segment/habit, set target, mark a cell MET/MISSED/NA, non-negotiable
 * crossed toggle, weight CRUD, assign task, person checks it, manager sees it);
 * that Routine is manager-only and each manager sees only their OWN person; one
 * person per manager; and that the person can touch ONLY their tasks (grid/weight/
 * non-negotiables -> 403, another person's task -> 404).
 *
 * Runs against the running app + prod DB with throwaway p35- actors; hard teardown.
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";
import { istDayKey } from "../lib/timezone";

const BASE = "http://localhost:3000";
const PREFIX = "p35-";
const prisma = new PrismaClient();
let pass = 0, fail = 0;
function rec(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(60)} got ${JSON.stringify(got)}`);
  ok ? pass++ : fail++;
}
async function signIn(email: string, password: string) {
  const r = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`sign-in ${email}: ${r.status}`);
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
async function call(cookie: string, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie }, redirect: "manual", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let json: any = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
}
async function teardown() {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

async function main() {
  await teardown();
  const mk = async (label: string, role: "MANAGER" | "TEAM_LEAD" | "RESOURCE" | "ADMIN") => {
    const email = `${PREFIX}${label.toLowerCase()}@orbit.local`;
    const password = generateTempPassword(16);
    const u = await prisma.user.create({ data: { email, name: `P35 ${label}`, role, status: "ACTIVE", passwordHash: await hashPassword(password) } });
    return { id: u.id, cookie: await signIn(email, password), email };
  };
  const M = await mk("mgr", "MANAGER");
  const M2 = await mk("mgr2", "MANAGER");
  const L = await mk("lead", "TEAM_LEAD");
  const D = await mk("dev", "RESOURCE");
  const AD = await mk("admin", "ADMIN");
  const today = istDayKey(new Date());

  console.log("\n-- Routine flow (manager sets up the segmented grid) --");
  const personEmail = `${PREFIX}person@orbit.local`;
  const personPassword = "personpass123";
  const created = await call(M.cookie, "POST", "/api/routine", { name: "Aarav", email: personEmail, password: personPassword });
  rec("manager creates a person -> 201", created.status, 201);
  rec("one person per manager (2nd -> 409)", (await call(M.cookie, "POST", "/api/routine", { name: "Bo", email: `${PREFIX}p2@orbit.local`, password: "abc123" })).status, 409);

  const ov1 = await call(M.cookie, "GET", "/api/routine");
  rec("GET overview -> 200 with a seeded grid (4 default segments)", [ov1.status, ov1.json?.segments?.length], [200, 4]);
  rec("  the week has 7 day-keys (Mon..Sun)", ov1.json?.week?.days?.length, 7);
  const seg0 = ov1.json.segments[0];
  const habit0 = seg0.habits[0];

  const newSeg = await call(M.cookie, "POST", "/api/routine/segments", { name: "Extra" });
  rec("add a segment -> 201", newSeg.status, 201);
  const newHabit = await call(M.cookie, "POST", "/api/routine/habits", { segmentId: newSeg.json.id, name: "Journaling", targetPerWeek: 3 });
  rec("add a habit (target 3) -> 201", [newHabit.status, newHabit.json?.targetPerWeek], [201, 3]);
  rec("set the habit target to 5 -> 200", (await call(M.cookie, "PATCH", `/api/routine/habits/${newHabit.json.id}`, { targetPerWeek: 5 })).status, 200);

  rec("mark a habit cell MET -> 200", (await call(M.cookie, "PATCH", "/api/routine/habit-mark", { habitId: habit0.id, date: today, value: "MET" })).status, 200);
  rec("mark another cell MISSED -> 200", (await call(M.cookie, "PATCH", "/api/routine/habit-mark", { habitId: habit0.id, date: addDays(today, -1), value: "MISSED" })).status, 200);
  rec("mark a cell NA -> 200", (await call(M.cookie, "PATCH", "/api/routine/habit-mark", { habitId: habit0.id, date: addDays(today, -2), value: "NA" })).status, 200);
  const ov2 = await call(M.cookie, "GET", "/api/routine");
  const h0after = ov2.json.segments[0].habits[0];
  rec("  overview reflects the MET mark + weekly tally", [h0after.marks[today], h0after.metThisWeek], ["MET", 1]);
  rec("clear a cell (value null) -> 200", (await call(M.cookie, "PATCH", "/api/routine/habit-mark", { habitId: habit0.id, date: addDays(today, -2), value: null })).status, 200);

  const nn = await call(M.cookie, "POST", "/api/routine/non-negotiables", { name: "No screens past bedtime" });
  rec("add a non-negotiable -> 201", nn.status, 201);
  rec("manager schedules it required today -> 200", (await call(M.cookie, "PATCH", "/api/routine/non-negotiable-mark", { nonNegotiableId: nn.json.id, date: today, required: true })).status, 200);
  const wt = await call(M.cookie, "POST", "/api/routine/weight", { date: today, weightKg: 42.5 });
  rec("log a weight entry -> 201", [wt.status, wt.json?.weightKg], [201, 42.5]);
  rec("edit the weight entry -> 200", (await call(M.cookie, "PATCH", `/api/routine/weight/${wt.json.id}`, { weightKg: 43 })).status, 200);
  const task = await call(M.cookie, "POST", "/api/routine/tasks", { title: "Finish homework", dueDate: today });
  rec("assign a task -> 201", task.status, 201);
  const taskId = task.json.id;

  const ov3 = await call(M.cookie, "GET", "/api/routine");
  const nnOv = ov3.json.nonNegotiables.find((n: any) => n.id === nn.json.id);
  rec("overview shows the rule scheduled today (required, not done) + weight + task", [
    nnOv?.requiredThisWeek,
    nnOv?.days?.[today],
    ov3.json.weights.find((w: any) => w.id === wt.json.id)?.weightKg,
    ov3.json.tasks.some((t: any) => t.id === taskId),
  ], [1, false, 43, true]);

  console.log("\n-- PERSON login: sees ONLY tasks, checks one off --");
  const personCookie = await signIn(personEmail, personPassword);
  const kidView = await call(personCookie, "GET", "/api/routine/kid");
  rec("person GET their own screen -> 200", kidView.status, 200);
  rec("  it shows their name + the assigned task", [kidView.json?.name, kidView.json?.tasks?.length, kidView.json?.tasks?.[0]?.title], ["Aarav", 1, "Finish homework"]);
  // Phase 37: the person sees their OWN habit grid (segments) to mark. Phase 42:
  // they also see the rules the manager SCHEDULED this week, each day required -> done,
  // so they can mark them done — "No screens past bedtime" was scheduled today, so it
  // shows here as required (done=false). Still NO weight, NO score/targets, NO missed.
  const kidRule = kidView.json?.nonNegotiables?.find((n: any) => n.name === "No screens past bedtime");
  rec("  person sees grid + scheduled rule's day (required, not done), no weight/score", [Array.isArray(kidView.json?.segments), kidView.json?.weights, kidRule?.days?.[today], JSON.stringify(kidView.json).includes("weightKg"), JSON.stringify(kidView.json).includes("targetPerWeek")], [true, undefined, false, false, false]);
  rec("  person side carries NO score / missed count (manager-only)", [JSON.stringify(kidView.json).includes("missedThisWeek"), JSON.stringify(kidView.json).includes("requiredThisWeek")], [false, false]);
  rec("person checks the task done -> 200", (await call(personCookie, "PATCH", `/api/routine/kid/tasks/${taskId}`, { done: true })).status, 200);
  const afterCheck = await call(M.cookie, "GET", "/api/routine");
  rec("manager sees the person's check in the overview", afterCheck.json?.tasks?.find((t: any) => t.id === taskId)?.done, true);

  console.log("\n-- THE PERSON WALL: every work API -> 403 (and pages redirect) --");
  const workApis: [string, string][] = [
    ["GET", "/api/users/me"], ["GET", "/api/users"], ["PATCH", "/api/users/does-not-exist"], ["POST", "/api/users/does-not-exist/resend"],
    ["GET", "/api/tasks?view=all"], ["GET", "/api/tasks?scope=private"], ["GET", "/api/tasks/does-not-exist"], ["GET", "/api/tasks/does-not-exist/notes"],
    ["GET", "/api/projects"], ["PATCH", "/api/projects/does-not-exist"], ["GET", "/api/projects/does-not-exist/attendees"], ["GET", "/api/projects/does-not-exist/managers"], ["GET", "/api/projects/does-not-exist/members"], ["GET", "/api/projects/does-not-exist/notes"], ["GET", "/api/projects/does-not-exist/team"],
    ["GET", "/api/departments"], ["PATCH", "/api/departments/does-not-exist"], ["GET", "/api/overview"], ["GET", "/api/calendar"], ["POST", "/api/events"], ["PATCH", "/api/events/does-not-exist"],
    ["GET", "/api/meetings"], ["GET", "/api/review"], ["GET", "/api/notifications"], ["POST", "/api/notifications/read"], ["PATCH", "/api/notifications/does-not-exist/snooze"],
    ["GET", "/api/my-space/departments"], ["PATCH", "/api/my-space/departments/does-not-exist"], ["GET", "/api/my-space/projects"], ["PATCH", "/api/my-space/projects/does-not-exist"], ["POST", "/api/my-space/prompt"],
    ["DELETE", "/api/notes/does-not-exist"], ["DELETE", "/api/project-notes/does-not-exist"], ["POST", "/api/push/subscribe"], ["GET", "/api/password-reset"], ["GET", "/api/whatsapp/test"],
    ["GET", "/api/collaboration-invites"], ["POST", "/api/collaboration-invites/does-not-exist"], ["POST", "/api/collaboration-invites/respond"],
    ["GET", "/api/invite/does-not-exist/validate"], ["POST", "/api/invite/does-not-exist/accept"], ["GET", "/api/cron/task-due"], ["GET", "/api/cron/snooze-wake"],
    // The routine MANAGER surfaces are work too — a PERSON reaches none of them.
    ["GET", "/api/routine"], ["POST", "/api/routine/segments"], ["POST", "/api/routine/habits"], ["PATCH", "/api/routine/habit-mark"],
    ["POST", "/api/routine/non-negotiables"], ["PATCH", "/api/routine/non-negotiable-mark"], ["POST", "/api/routine/weight"], ["POST", "/api/routine/tasks"], ["PATCH", "/api/routine/person"],
  ];
  let allWalled = true;
  for (const [m, p] of workApis) {
    const s = (await call(personCookie, m, p, m === "GET" ? undefined : {})).status;
    if (s !== 403) { allWalled = false; console.log(`    LEAK: ${m} ${p} -> ${s}`); }
  }
  rec(`person is 403 on ALL ${workApis.length} non-person API probes`, allWalled, true);
  rec("person hitting a work PAGE (/) is redirected (not 200)", (await call(personCookie, "GET", "/")).status !== 200, true);
  rec("person CAN reach its own routine API -> 200", (await call(personCookie, "GET", "/api/routine/kid")).status, 200);
  rec("person touching ANOTHER task -> 404", (await call(personCookie, "PATCH", `/api/routine/kid/tasks/does-not-exist`, { done: true })).status, 404);

  console.log("\n-- PERSON excluded from every work surface --");
  const people = await call(M.cookie, "GET", "/api/users");
  rec("the person account is ABSENT from People", (people.json as any[]).some((u) => u.email === personEmail), false);
  rec("People cannot mint a PERSON (role PERSON -> 403)", (await call(M.cookie, "POST", "/api/users", { name: "x", email: `${PREFIX}nope@orbit.local`, role: "PERSON" })).status, 403);

  console.log("\n-- Routine is MANAGER-only + each manager sees only THEIR person --");
  rec("lead GET /api/routine -> 403", (await call(L.cookie, "GET", "/api/routine")).status, 403);
  rec("developer GET /api/routine -> 403", (await call(D.cookie, "GET", "/api/routine")).status, 403);
  rec("admin GET /api/routine -> 403", (await call(AD.cookie, "GET", "/api/routine")).status, 403);
  const m2View = await call(M2.cookie, "GET", "/api/routine");
  rec("another manager (no person) -> 200 with person:null", [m2View.status, m2View.json?.person], [200, null]);
  rec("  ...and cannot see M's habit (mark it) -> 404", (await call(M2.cookie, "PATCH", "/api/routine/habit-mark", { habitId: habit0.id, date: today, value: "MET" })).status, 404);
  rec("  ...and cannot log weight (no person of their own) -> 404", (await call(M2.cookie, "POST", "/api/routine/weight", { date: today, weightKg: 50 })).status, 404);

  console.log("\n-- person edit + remove (cascade) --");
  rec("manager resets the person's password -> 200", (await call(M.cookie, "PATCH", "/api/routine/person", { password: "newpass123" })).status, 200);
  rec("  the person can log in with the new password", (await signIn(personEmail, "newpass123")).startsWith("orbit_session="), true);
  const personId = (await prisma.person.findFirst({ where: { user: { email: personEmail } }, select: { id: true } }))?.id;
  rec("manager removes the person -> 200", (await call(M.cookie, "DELETE", "/api/routine/person")).status, 200);
  rec("  the person login account is gone", (await prisma.user.findUnique({ where: { email: personEmail } })) === null, true);
  rec("  ALL routine data cascaded (segments/weight/tasks 0)", [
    await prisma.habitSegment.count({ where: { personId } }),
    await prisma.weightEntry.count({ where: { personId } }),
    await prisma.routineTask.count({ where: { personId } }),
  ], [0, 0, 0]);

  await teardown();
  rec("teardown: no p35- residue", await prisma.user.count({ where: { email: { startsWith: PREFIX } } }), 0);
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}
function addDays(key: string, n: number) {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
