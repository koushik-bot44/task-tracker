/**
 * Phase 39 — routine collaborators (invite/accept/read-only-vs-editable/permission-
 * change/revoke) + the manual reminder. Verifies the ONE access resolver: owner +
 * accepted collaborators read; owner + EDITABLE write; owner-only for delete-person
 * + manage-collaborators; a manager with no relationship -> 404 (isolation).
 *
 * Against the running app + prod DB with throwaway p39- actors; hard teardown.
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";
import { istDayKey } from "../lib/timezone";

const BASE = "http://localhost:3000";
const PREFIX = "p39-";
const prisma = new PrismaClient();
let pass = 0, fail = 0;
function rec(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(64)} got ${JSON.stringify(got)}`);
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
  await prisma.routineCollaborator.deleteMany({ where: { OR: [{ manager: { email: { startsWith: PREFIX } } }, { invitedBy: { email: { startsWith: PREFIX } } }, { person: { user: { email: { startsWith: PREFIX } } } }] } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

async function main() {
  await teardown();
  const mk = async (label: string, role: "MANAGER" | "TEAM_LEAD" | "RESOURCE" | "ADMIN") => {
    const email = `${PREFIX}${label.toLowerCase()}@orbit.local`;
    const password = generateTempPassword(16);
    const u = await prisma.user.create({ data: { email, name: `P39 ${label}`, role, status: "ACTIVE", passwordHash: await hashPassword(password) } });
    return { id: u.id, cookie: await signIn(email, password), email };
  };
  const M = await mk("mgr", "MANAGER");     // owner
  const M2 = await mk("mgr2", "MANAGER");   // invited collaborator
  const M3 = await mk("mgr3", "MANAGER");   // unrelated
  const L = await mk("lead", "TEAM_LEAD");
  const Dv = await mk("dev", "RESOURCE");
  const AD = await mk("admin", "ADMIN");
  const today = istDayKey(new Date());

  await call(M.cookie, "POST", "/api/routine", { name: "Aarav", email: `${PREFIX}person@orbit.local`, password: "personpass123" });
  const ov = await call(M.cookie, "GET", "/api/routine");
  const P = ov.json.person.id;
  const habit = ov.json.segments[0].habits[0].id;
  const segment = ov.json.segments[0].id;
  const q = (path: string) => `${path}${path.includes("?") ? "&" : "?"}person=${P}`;

  console.log("\n-- Invite lifecycle --");
  const inv = await call(M.cookie, "POST", q("/api/routine/collaborators"), { managerId: M2.id, permission: "READ_ONLY" });
  rec("owner invites a manager (READ_ONLY) -> 201", inv.status, 201);
  rec("can't invite the same manager twice -> 409", (await call(M.cookie, "POST", q("/api/routine/collaborators"), { managerId: M2.id, permission: "EDITABLE" })).status, 409);
  rec("can't invite yourself -> 400", (await call(M.cookie, "POST", q("/api/routine/collaborators"), { managerId: M.id, permission: "READ_ONLY" })).status, 400);
  rec("a NON-owner (M2) inviting -> 404 (not their routine to manage)", (await call(M2.cookie, "POST", q("/api/routine/collaborators"), { managerId: M3.id, permission: "READ_ONLY" })).status, 404);

  const invites = await call(M2.cookie, "GET", "/api/routine/invites");
  rec("invitee sees the pending invite", [invites.json.length, invites.json[0]?.personName, invites.json[0]?.permission], [1, "Aarav", "READ_ONLY"]);
  rec("BEFORE accepting: M2 GET routine -> 404", (await call(M2.cookie, "GET", q("/api/routine"))).status, 404);
  const inviteId = invites.json[0].id;
  rec("M2 accepts -> 200", (await call(M2.cookie, "POST", `/api/routine/invites/${inviteId}`)).status, 200);

  console.log("\n-- READ_ONLY collaborator: reads yes, ALL writes 403 --");
  const ro = await call(M2.cookie, "GET", q("/api/routine"));
  rec("M2 reads the routine -> 200, role READ_ONLY", [ro.status, ro.json.role], [200, "READ_ONLY"]);
  rec("  ...and does NOT see the collaborators panel (owner-only)", ro.json.collaborators.length, 0);
  const roWrites: [string, string, unknown][] = [
    ["PATCH", "/api/routine/habit-mark", { habitId: habit, date: today, value: "MET" }],
    ["POST", "/api/routine/weight", { date: today, weightKg: 40 }],
    ["POST", "/api/routine/tasks", { title: "x", dueDate: today }],
    ["POST", "/api/routine/non-negotiables", { name: "x" }],
    ["POST", "/api/routine/segments", { name: "x" }],
    ["PATCH", `/api/routine/habits/${habit}`, { targetPerWeek: 3 }],
    ["POST", "/api/routine/reminder", {}],
    ["POST", "/api/routine/collaborators", { managerId: M3.id, permission: "READ_ONLY" }],
    ["DELETE", "/api/routine/person", undefined],
  ];
  let roWalled = true;
  for (const [m, path, b] of roWrites) {
    const s = (await call(M2.cookie, m, q(path), b)).status;
    // A collaborator HAS access, so a write / owner-only action is 403 (not 404).
    if (s !== 403) { roWalled = false; console.log(`    LEAK: ${m} ${path} -> ${s}`); }
  }
  rec("READ_ONLY: every write + owner-only action -> 403", roWalled, true);

  console.log("\n-- Owner changes M2 to EDITABLE --");
  const collab = await call(M.cookie, "GET", q("/api/routine"));
  const collabId = collab.json.collaborators[0].id;
  rec("owner sees the collaborator (PENDING->ACCEPTED)", collab.json.collaborators[0].status, "ACCEPTED");
  rec("owner changes permission -> EDITABLE (200)", (await call(M.cookie, "PATCH", `/api/routine/collaborators/${collabId}`, { permission: "EDITABLE" })).status, 200);

  console.log("\n-- EDITABLE collaborator: routine writes yes, owner-only no --");
  rec("EDITABLE marks a habit -> 200", (await call(M2.cookie, "PATCH", q("/api/routine/habit-mark"), { habitId: habit, date: today, value: "MET" })).status, 200);
  rec("EDITABLE logs weight -> 201", (await call(M2.cookie, "POST", q("/api/routine/weight"), { date: today, weightKg: 41 })).status, 201);
  rec("EDITABLE adds a task -> 201", (await call(M2.cookie, "POST", q("/api/routine/tasks"), { title: "Read a book", dueDate: today })).status, 201);
  rec("EDITABLE adds a segment -> 201", (await call(M2.cookie, "POST", q("/api/routine/segments"), { name: "Extra" })).status, 201);
  rec("EDITABLE can send a reminder -> 200", (await call(M2.cookie, "POST", q("/api/routine/reminder"))).status, 200);
  rec("EDITABLE canNOT delete the person -> 403 (owner-only)", (await call(M2.cookie, "DELETE", q("/api/routine/person"))).status, 403);
  rec("EDITABLE canNOT invite another manager -> 403 (owner-only)", (await call(M2.cookie, "POST", q("/api/routine/collaborators"), { managerId: M3.id, permission: "READ_ONLY" })).status, 403);
  rec("EDITABLE canNOT change collaborators -> 404", (await call(M2.cookie, "PATCH", `/api/routine/collaborators/${collabId}`, { permission: "READ_ONLY" })).status, 404);

  console.log("\n-- Isolation: an unrelated manager sees NOTHING of this routine --");
  rec("M3 GET routine?person=P -> 404", (await call(M3.cookie, "GET", q("/api/routine"))).status, 404);
  rec("M3 marks a habit -> 404", (await call(M3.cookie, "PATCH", q("/api/routine/habit-mark"), { habitId: habit, date: today, value: "MET" })).status, 404);
  rec("M3 GET their OWN default routine -> 200 person:null", [(await call(M3.cookie, "GET", "/api/routine")).status, (await call(M3.cookie, "GET", "/api/routine")).json.person], [200, null]);
  rec("lead GET routine -> 403", (await call(L.cookie, "GET", "/api/routine")).status, 403);
  rec("dev GET routine -> 403", (await call(Dv.cookie, "GET", "/api/routine")).status, 403);
  rec("admin GET routine -> 403", (await call(AD.cookie, "GET", "/api/routine")).status, 403);

  console.log("\n-- Revoke --");
  rec("owner revokes M2 -> 200", (await call(M.cookie, "DELETE", `/api/routine/collaborators/${collabId}`)).status, 200);
  rec("M2 GET routine?person=P after revoke -> 404", (await call(M2.cookie, "GET", q("/api/routine"))).status, 404);

  console.log("\n-- Reminder: undone-tasks push, rate-limit, empty no-send, person sees it --");
  await prisma.notification.deleteMany({ where: { user: { email: `${PREFIX}person@orbit.local` }, type: "routine.reminder" } });
  // there are undone tasks now (added above). First reminder sends.
  const r1 = await call(M.cookie, "POST", q("/api/routine/reminder"));
  rec("owner reminder (undone tasks) -> sent", r1.json.sent, true);
  const r2 = await call(M.cookie, "POST", q("/api/routine/reminder"));
  rec("immediate second reminder -> rate_limited", [r2.json.sent, r2.json.reason], [false, "rate_limited"]);
  const personCookie = await signIn(`${PREFIX}person@orbit.local`, "personpass123");
  const kid1 = await call(personCookie, "GET", "/api/routine/kid");
  rec("person /kid shows the reminder", typeof kid1.json.reminder?.title === "string" && kid1.json.reminder.title.includes("task"), true);
  const kid2 = await call(personCookie, "GET", "/api/routine/kid");
  rec("person /kid: reminder cleared after being shown once", kid2.json.reminder, null);

  // Empty: a fresh person with no undone tasks -> no-send.
  await call(M3.cookie, "POST", "/api/routine", { name: "Bo", email: `${PREFIX}p2@orbit.local`, password: "personpass456" });
  const p2ov = await call(M3.cookie, "GET", "/api/routine");
  // mark the seeded... there are no tasks for a fresh person, so undone = 0.
  rec("reminder with NO pending tasks -> no send (reason none)", (await call(M3.cookie, "POST", `/api/routine/reminder?person=${p2ov.json.person.id}`)).json, { sent: false, reason: "none" });

  await teardown();
  rec("teardown: no p39- residue", await prisma.user.count({ where: { email: { startsWith: PREFIX } } }), 0);
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
