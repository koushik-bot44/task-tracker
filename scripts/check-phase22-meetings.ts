/**
 * Phase 22 — meetings (scheduling, attendee selection, notify-exactly-selected,
 * attendee-based visibility, and the non-meeting event left unchanged).
 *
 * Meetings ARE calendar events; they go through /api/events with isMeeting.
 * Scheduling is the project's OWNER + COLLABORATOR managers (= canSeeProject);
 * not leads/devs; admin is project-blind. A meeting notifies EXACTLY its selected
 * EventAttendees (creator excluded); a deselected member is not an attendee, is
 * not notified, and cannot see the meeting on their calendar. Throwaway p22-
 * actors; hard teardown.
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const BASE = "http://localhost:3000";
const PREFIX = "p22-";
const prisma = new PrismaClient();
let pass = 0,
  fail = 0;
function rec(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(58)} got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
type Actor = { id: string; cookie: string };
async function signIn(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`sign-in ${email}: ${res.status}`);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}
async function call(a: Actor | null, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...(a ? { cookie: a.cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let json: any = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const bellFor = async (userIds: string[], type: string) =>
  new Set((await prisma.notification.findMany({ where: { userId: { in: userIds }, type }, select: { userId: true } })).map((n) => n.userId));

async function teardown() {
  const ids = (await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } })).map((u) => u.id);
  await prisma.eventAttendee.deleteMany({ where: { OR: [{ userId: { in: ids } }, { event: { createdById: { in: ids } } }] } });
  await prisma.calendarEvent.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.emailLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.task.deleteMany({ where: { project: { slug: { startsWith: PREFIX } } } });
  await prisma.projectMember.deleteMany({ where: { project: { slug: { startsWith: PREFIX } } } });
  await prisma.projectManager.deleteMany({ where: { project: { slug: { startsWith: PREFIX } } } });
  await prisma.project.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.department.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

async function main() {
  const mk = async (label: string, role: "MANAGER" | "TEAM_LEAD" | "RESOURCE" | "ADMIN", emailOptIn = true): Promise<Actor> => {
    const email = `${PREFIX}${label}@orbit.local`;
    const password = generateTempPassword(16);
    const u = await prisma.user.create({ data: { email, name: `P22 ${label}`, role, status: "ACTIVE", emailOptIn, passwordHash: await hashPassword(password) } });
    return { id: u.id, cookie: await signIn(email, password) };
  };
  await teardown();

  const MO = await mk("owner", "MANAGER");
  const MC = await mk("collab", "MANAGER");
  const MX = await mk("other", "MANAGER");
  const L = await mk("lead", "TEAM_LEAD");
  const V = await mk("dev", "RESOURCE"); // member, opted-in
  const W = await mk("wade", "RESOURCE", false); // assigned, opted-OUT (deselected later)
  const admin = await mk("admin", "ADMIN");

  const dept = await prisma.department.create({ data: { name: "P22 Dept", color: "#475569", orderKey: "a0", createdById: MO.id } });
  const proj = await prisma.project.create({ data: { name: "P22 Proj", slug: `${PREFIX}proj`, color: "#2f68f0", orderKey: "a0", ownerId: MO.id, leadId: L.id, departmentId: dept.id } });
  await prisma.projectManager.create({ data: { projectId: proj.id, userId: MC.id, status: "ACCEPTED" } });
  await prisma.projectMember.create({ data: { projectId: proj.id, userId: V.id } });
  await prisma.task.create({ data: { projectId: proj.id, title: "t", status: "IN_PROGRESS", orderKey: "a0", assigneeId: W.id } });
  const deptX = await prisma.department.create({ data: { name: "P22 DeptX", color: "#475569", orderKey: "a0", createdById: MX.id } });
  const projX = await prisma.project.create({ data: { name: "P22 ProjX", slug: `${PREFIX}projx`, color: "#2f68f0", orderKey: "a0", ownerId: MX.id, departmentId: deptX.id } });

  const meeting = (extra: Record<string, unknown> = {}) => ({
    title: "Kickoff", description: "d", date: "2026-08-10", projectId: proj.id,
    isMeeting: true, startTime: "10:00", attendeeIds: [L.id, V.id, W.id], ...extra,
  });

  console.log("-- scheduling permission (owner + collaborator managers) --");
  const owned = await call(MO, "POST", "/api/events", meeting());
  rec("owner manager schedules on own project -> 201", owned.status, 201);
  rec("  it is a meeting with a start time", owned.json?.isMeeting === true && owned.json?.startTime === "10:00", true);
  rec("collaborator manager schedules on shared project -> 201", (await call(MC, "POST", "/api/events", meeting({ title: "Collab sync" }))).status, 201);
  rec("lead schedules -> 403", (await call(L, "POST", "/api/events", meeting())).status, 403);
  rec("developer schedules -> 403", (await call(V, "POST", "/api/events", meeting())).status, 403);
  rec("admin schedules -> 403", (await call(admin, "POST", "/api/events", meeting())).status, 403);
  rec("manager schedules on a project they can't see -> 404", (await call(MO, "POST", "/api/events", meeting({ projectId: projX.id }))).status, 404);
  rec("admin opens the meetings tab -> 403", (await call(admin, "GET", "/api/meetings")).status, 403);

  console.log("\n-- meeting validation --");
  rec("end time before start -> 400", (await call(MO, "POST", "/api/events", meeting({ startTime: "14:00", endTime: "13:00" }))).status, 400);
  rec("zero attendees -> 400", (await call(MO, "POST", "/api/events", meeting({ attendeeIds: [] }))).status, 400);
  rec("meeting without a project -> 400", (await call(MO, "POST", "/api/events", meeting({ projectId: null }))).status, 400);
  // The modal sends endTime:null when End is left blank — must be accepted, not rejected.
  rec("blank end (endTime null) -> 201", (await call(MO, "POST", "/api/events", meeting({ endTime: null }))).status, 201);

  console.log("\n-- notify EXACTLY the selected attendees (deselect Wade) --");
  // Clear the bell first — earlier cases invited Wade, so isolate this meeting.
  await prisma.notification.deleteMany({ where: { userId: { in: [MO.id, L.id, V.id, W.id] } } });
  const m = await call(MO, "POST", "/api/events", { title: "Sprint", description: "d", date: "2026-08-11", projectId: proj.id, isMeeting: true, startTime: "09:30", endTime: "10:30", attendeeIds: [L.id, V.id] });
  rec("scheduled -> 201", m.status, 201);
  await new Promise((r) => setTimeout(r, 1200));
  const attSet = new Set((m.json?.attendees ?? []).map((a: any) => a.userId));
  rec("attendees are exactly L + V (Wade deselected)", attSet.has(L.id) && attSet.has(V.id) && !attSet.has(W.id), true);
  const bell = await bellFor([MO.id, L.id, V.id, W.id], "event.created");
  rec("bell: L + V notified", bell.has(L.id) && bell.has(V.id), true);
  rec("bell: deselected Wade NOT notified", bell.has(W.id), false);
  rec("bell: creator (owner) NOT notified", bell.has(MO.id), false);
  rec("exactly 2 EventAttendee rows", await prisma.eventAttendee.count({ where: { eventId: m.json.id } }), 2);

  console.log("\n-- attendee-based visibility --");
  const range = "from=2026-08-01&to=2026-08-31";
  const vSees = ((await call(V, "GET", `/api/calendar?${range}`)).json?.events ?? []).some((e: any) => e.id === m.json.id);
  const wSees = ((await call(W, "GET", `/api/calendar?${range}`)).json?.events ?? []).some((e: any) => e.id === m.json.id);
  rec("attendee V sees the meeting on their calendar", vSees, true);
  rec("deselected Wade does NOT see the meeting", wSees, false);

  console.log("\n-- edit re-notifies the current attendees (Meeting updated) --");
  await prisma.notification.deleteMany({ where: { userId: { in: [L.id, V.id, W.id] } } });
  rec("edit the meeting (move time) -> 200", (await call(MO, "PATCH", `/api/events/${m.json.id}`, { startTime: "11:00", endTime: "12:00" })).status, 200);
  await new Promise((r) => setTimeout(r, 1000));
  const upd = await bellFor([L.id, V.id, W.id], "event.updated");
  rec("update bell: L + V notified", upd.has(L.id) && upd.has(V.id), true);
  rec("update bell: Wade (not an attendee) NOT notified", upd.has(W.id), false);

  console.log("\n-- a NON-meeting event still uses the old broad scope (unchanged) --");
  await prisma.notification.deleteMany({ where: { userId: { in: [L.id, V.id, W.id] } } });
  const ev = await call(MO, "POST", "/api/events", { title: "All team sync", description: "d", date: "2026-08-12", projectId: proj.id });
  rec("plain event created -> 201", ev.status, 201);
  rec("  it is NOT a meeting", ev.json?.isMeeting, false);
  await new Promise((r) => setTimeout(r, 1000));
  const plain = await bellFor([L.id, V.id, W.id], "event.created");
  rec("plain event notifies lead L (broad scope)", plain.has(L.id), true);
  rec("plain event notifies assigned Wade (broad, not attendee-based)", plain.has(W.id), true);
  rec("plain event does NOT notify member-only V (resolver unchanged)", plain.has(V.id), false);

  await teardown();
  rec("teardown: no p22- residue", await prisma.user.count({ where: { email: { startsWith: PREFIX } } }), 0);
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
