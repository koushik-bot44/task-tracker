/**
 * Phase 37 — the person marks their OWN weekly habits on /kid.
 *
 * Verifies: the person's /kid view carries their habit grid (segments + marks +
 * week) but NO score/targets, NO non-negotiables, NO weight; a PERSON marks their
 * OWN habit (200) but another person's habit -> 404, a future day -> 400; a PERSON
 * still 403s on every structure edit + the manager habit-mark + the manager routine
 * view; a non-PERSON hitting the kid mark endpoint -> 403; the mark is the SAME
 * shared HabitMark row (LAST WRITE WINS, no duplicate); the manager sees the
 * person's marks; manager marks still 200.
 *
 * Against the running app + prod DB with throwaway p37- actors; hard teardown.
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";
import { istDayKey } from "../lib/timezone";

const BASE = "http://localhost:3000";
const PREFIX = "p37-";
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
const addDays = (k: string, n: number) => { const d = new Date(`${k}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
async function teardown() { await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } }); }

async function main() {
  await teardown();
  const mk = async (label: string, role: "MANAGER" | "TEAM_LEAD") => {
    const email = `${PREFIX}${label.toLowerCase()}@orbit.local`;
    const password = generateTempPassword(16);
    const u = await prisma.user.create({ data: { email, name: `P37 ${label}`, role, status: "ACTIVE", passwordHash: await hashPassword(password) } });
    return { id: u.id, cookie: await signIn(email, password), email };
  };
  const M = await mk("mgr", "MANAGER");
  const M2 = await mk("mgr2", "MANAGER");
  const L = await mk("lead", "TEAM_LEAD");
  const today = istDayKey(new Date());

  const personEmail = `${PREFIX}person@orbit.local`, personPw = "personpass123";
  await call(M.cookie, "POST", "/api/routine", { name: "Aarav", email: personEmail, password: personPw });
  await call(M2.cookie, "POST", "/api/routine", { name: "Bo", email: `${PREFIX}p2@orbit.local`, password: "personpass456" });
  const ovM = await call(M.cookie, "GET", "/api/routine");
  const ovM2 = await call(M2.cookie, "GET", "/api/routine");
  const habit0 = ovM.json.segments[0].habits[0].id;
  const segment0 = ovM.json.segments[0].id;
  const habitOther = ovM2.json.segments[0].habits[0].id;
  // A house rule for each person — Aarav's (the person marks it), Bo's (scoping).
  const nnM = await call(M.cookie, "POST", "/api/routine/non-negotiables", { name: "No screens past bedtime" });
  const nnOther = await call(M2.cookie, "POST", "/api/routine/non-negotiables", { name: "Bo — no phone at dinner" });
  // The manager SCHEDULES Aarav's rule as required today, so the person can mark it done.
  await call(M.cookie, "PATCH", "/api/routine/non-negotiable-mark", { nonNegotiableId: nnM.json.id, date: today, required: true });
  const pc = await signIn(personEmail, personPw);

  console.log("\n-- The person's /kid view: grid + scheduled rules to mark, NO score/weight/missed --");
  const kid = await call(pc, "GET", "/api/routine/kid");
  rec("kid GET -> 200 with segments + week + tasks", [kid.status, Array.isArray(kid.json?.segments), !!kid.json?.week, Array.isArray(kid.json?.tasks)], [200, true, true, true]);
  rec("  segments carry habits with marks", [Array.isArray(kid.json.segments[0].habits), "marks" in kid.json.segments[0].habits[0]], [true, true]);
  rec("  NO score/targets in the person payload", [JSON.stringify(kid.json).includes("targetPerWeek"), JSON.stringify(kid.json).includes("metThisWeek"), JSON.stringify(kid.json).includes("targetThisWeek")], [false, false, false]);
  rec("  NO weight in the person payload", [JSON.stringify(kid.json).includes("weightKg"), "weights" in kid.json, "monthlyWeights" in kid.json], [false, false, false]);
  // Phase 42: the person sees ONLY the rules the manager scheduled, each day required
  // -> done. The required day appears (done=false); NO score / missed count leaks here.
  const kidNn = kid.json.nonNegotiables.find((n: any) => n.id === nnM.json.id);
  rec("  scheduled rule present with its required day (not done), NO missed count", [Array.isArray(kid.json.nonNegotiables), "days" in (kidNn ?? {}), kidNn?.days?.[today], JSON.stringify(kid.json).includes("missedThisWeek")], [true, true, false, false]);

  console.log("\n-- Person marks their OWN habit (tap-to-cycle) --");
  rec("person marks own habit MET -> 200", (await call(pc, "POST", "/api/routine/kid/habit-mark", { habitId: habit0, date: today, value: "MET" })).status, 200);
  rec("  manager sees the person's MET mark", (await call(M.cookie, "GET", "/api/routine")).json.segments[0].habits[0].marks[today], "MET");
  rec("person cycles to MISSED -> 200", (await call(pc, "POST", "/api/routine/kid/habit-mark", { habitId: habit0, date: today, value: "MISSED" })).status, 200);
  rec("person cycles to NA -> 200", (await call(pc, "POST", "/api/routine/kid/habit-mark", { habitId: habit0, date: today, value: "NA" })).status, 200);
  rec("person clears (null) -> 200", (await call(pc, "POST", "/api/routine/kid/habit-mark", { habitId: habit0, date: today, value: null })).status, 200);
  rec("  ...cleared: manager sees no mark today", (await call(M.cookie, "GET", "/api/routine")).json.segments[0].habits[0].marks[today] ?? "none", "none");

  console.log("\n-- Person mark: scoping + rules --");
  rec("person marks ANOTHER person's habit -> 404", (await call(pc, "POST", "/api/routine/kid/habit-mark", { habitId: habitOther, date: today, value: "MET" })).status, 404);
  rec("person marks a FUTURE day -> 400", (await call(pc, "POST", "/api/routine/kid/habit-mark", { habitId: habit0, date: addDays(today, 1), value: "MET" })).status, 400);
  rec("person marks a non-existent habit -> 404", (await call(pc, "POST", "/api/routine/kid/habit-mark", { habitId: "nope", date: today, value: "MET" })).status, 404);
  rec("a MANAGER hitting the kid mark endpoint -> 403", (await call(M.cookie, "POST", "/api/routine/kid/habit-mark", { habitId: habit0, date: today, value: "MET" })).status, 403);

  console.log("\n-- Person marks their OWN SCHEDULED non-negotiable done (phase 42) --");
  const nnId = nnM.json.id;
  rec("person marks the scheduled day done -> 200", (await call(pc, "POST", "/api/routine/kid/non-negotiable-mark", { nonNegotiableId: nnId, date: today, done: true })).status, 200);
  const nnMgr = (await call(M.cookie, "GET", "/api/routine")).json.nonNegotiables.find((n: any) => n.id === nnId);
  rec("  manager sees the day done + doneThisWeek", [nnMgr?.days?.[today], nnMgr?.doneThisWeek], [true, 1]);
  rec("  the person's OWN view shows it done", (await call(pc, "GET", "/api/routine/kid")).json.nonNegotiables.find((n: any) => n.id === nnId)?.days?.[today], true);
  rec("person un-marks (done:false) -> 200", (await call(pc, "POST", "/api/routine/kid/non-negotiable-mark", { nonNegotiableId: nnId, date: today, done: false })).status, 200);
  rec("  ...manager sees it not-done again (day still required)", (await call(M.cookie, "GET", "/api/routine")).json.nonNegotiables.find((n: any) => n.id === nnId)?.days?.[today], false);
  rec("person marks a NON-scheduled day -> 404 (can't add a day)", (await call(pc, "POST", "/api/routine/kid/non-negotiable-mark", { nonNegotiableId: nnId, date: addDays(today, -1), done: true })).status, 404);
  rec("person marks ANOTHER person's rule -> 404", (await call(pc, "POST", "/api/routine/kid/non-negotiable-mark", { nonNegotiableId: nnOther.json.id, date: today, done: true })).status, 404);
  rec("person marks a FUTURE day -> 400", (await call(pc, "POST", "/api/routine/kid/non-negotiable-mark", { nonNegotiableId: nnId, date: addDays(today, 1), done: true })).status, 400);
  rec("a MANAGER hitting the kid rule-mark endpoint -> 403", (await call(M.cookie, "POST", "/api/routine/kid/non-negotiable-mark", { nonNegotiableId: nnId, date: today, done: true })).status, 403);

  console.log("\n-- Manager un-schedules the day (only the manager sets days) --");
  rec("manager un-schedules the day -> 200", (await call(M.cookie, "PATCH", "/api/routine/non-negotiable-mark", { nonNegotiableId: nnId, date: today, required: false })).status, 200);
  rec("  ...the day is gone from the overview", (await call(M.cookie, "GET", "/api/routine")).json.nonNegotiables.find((n: any) => n.id === nnId)?.requiredThisWeek, 0);
  rec("  ...and the person no longer sees the rule (nothing scheduled)", (await call(pc, "GET", "/api/routine/kid")).json.nonNegotiables.length, 0);

  console.log("\n-- Person is STILL walled off everything but mark + tasks --");
  const walls: [string, string, string][] = [
    ["POST", "/api/routine/segments", "add segment"],
    ["POST", "/api/routine/habits", "add habit"],
    ["PATCH", `/api/routine/habits/${habit0}`, "edit habit/target"],
    ["DELETE", `/api/routine/habits/${habit0}`, "delete habit"],
    ["PATCH", `/api/routine/segments/${segment0}`, "rename segment"],
    ["DELETE", `/api/routine/segments/${segment0}`, "delete segment"],
    ["POST", "/api/routine/non-negotiables", "add non-negotiable"],
    ["PATCH", "/api/routine/non-negotiable-mark", "mark non-negotiable"],
    ["POST", "/api/routine/weight", "log weight"],
    ["GET", "/api/routine", "manager routine view"],
    ["PATCH", "/api/routine/habit-mark", "manager habit-mark endpoint"],
    ["GET", "/api/tasks?view=all", "work tasks"],
    ["GET", "/api/projects", "projects"],
    ["GET", "/api/users", "people"],
    ["GET", "/api/overview", "dashboard"],
  ];
  let walled = true;
  for (const [m, p, label] of walls) {
    const s = (await call(pc, m, p, m === "GET" ? undefined : {})).status;
    if (s !== 403) { walled = false; console.log(`    LEAK: ${label} ${m} ${p} -> ${s}`); }
  }
  rec(`person 403 on ALL ${walls.length} non-(kid-mark/kid-task) surfaces`, walled, true);

  console.log("\n-- Last-write-wins on ONE shared HabitMark row --");
  await call(pc, "POST", "/api/routine/kid/habit-mark", { habitId: habit0, date: today, value: "MET" });
  await call(M.cookie, "PATCH", "/api/routine/habit-mark", { habitId: habit0, date: today, value: "MISSED" });
  rec("person MET then manager MISSED -> manager value wins", (await call(M.cookie, "GET", "/api/routine")).json.segments[0].habits[0].marks[today], "MISSED");
  await call(M.cookie, "PATCH", "/api/routine/habit-mark", { habitId: habit0, date: today, value: "MET" });
  await call(pc, "POST", "/api/routine/kid/habit-mark", { habitId: habit0, date: today, value: "NA" });
  rec("manager MET then person NA -> person value wins", (await call(M.cookie, "GET", "/api/routine")).json.segments[0].habits[0].marks[today], "NA");
  const dayDate = new Date(`${today}T00:00:00.000Z`);
  rec("exactly ONE HabitMark row for (habit, day) — no duplicate", await prisma.habitMark.count({ where: { habitId: habit0, date: dayDate } }), 1);
  rec("manager habit-mark still works -> 200", (await call(M.cookie, "PATCH", "/api/routine/habit-mark", { habitId: habit0, date: today, value: "MET" })).status, 200);

  await teardown();
  rec("teardown: no p37- residue", await prisma.user.count({ where: { email: { startsWith: PREFIX } } }), 0);
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
