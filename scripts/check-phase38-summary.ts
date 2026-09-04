/**
 * Phase 38 — the Weekly Summary sub-tab.
 *
 * Verifies: the overview's `summary` (per-segment daysMet/target + overall +
 * violations) is CONSISTENT with the grid tally (summary.daysMet === segment
 * .metThisWeek — the same aggregation, no parallel calc); matches a known seeded
 * set of marks; recalculates PER WEEK (a past week yields its own summary); the
 * summary endpoint (GET /api/routine) is MANAGER-only + own-person-scoped (PERSON
 * 403, lead/dev/admin 403, another manager sees only their own); and the person
 * /kid carries NO summary.
 *
 * Against the running app + prod DB with throwaway p38- actors; hard teardown.
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";
import { istDayKey } from "../lib/timezone";

const BASE = "http://localhost:3000";
const PREFIX = "p38-";
const prisma = new PrismaClient();
let pass = 0, fail = 0;
function rec(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(62)} got ${JSON.stringify(got)}`);
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
const D = (k: string) => new Date(`${k}T00:00:00.000Z`);
const addDays = (k: string, n: number) => { const d = D(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekStart = (k: string) => { const d = D(k); const dow = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1)); return d.toISOString().slice(0, 10); };
async function teardown() { await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } }); }

async function main() {
  await teardown();
  const mk = async (label: string, role: "MANAGER" | "TEAM_LEAD" | "RESOURCE" | "ADMIN") => {
    const email = `${PREFIX}${label.toLowerCase()}@orbit.local`;
    const password = generateTempPassword(16);
    const u = await prisma.user.create({ data: { email, name: `P38 ${label}`, role, status: "ACTIVE", passwordHash: await hashPassword(password) } });
    return { id: u.id, cookie: await signIn(email, password), email };
  };
  const M = await mk("mgr", "MANAGER");
  const M2 = await mk("mgr2", "MANAGER");
  const L = await mk("lead", "TEAM_LEAD");
  const Dv = await mk("dev", "RESOURCE");
  const AD = await mk("admin", "ADMIN");
  const today = istDayKey(new Date());
  const mon = weekStart(today);
  const prevMon = addDays(mon, -7);

  const personEmail = `${PREFIX}person@orbit.local`, personPw = "personpass123";
  await call(M.cookie, "POST", "/api/routine", { name: "Aarav", email: personEmail, password: personPw });
  const ov0 = await call(M.cookie, "GET", "/api/routine");
  const seg0 = ov0.json.segments[0]; // Sleep & Wake — 2 habits, targets 7 + 7 = 14
  const h0 = seg0.habits[0].id, h1 = seg0.habits[1].id;
  const personId = (await prisma.person.findFirst({ where: { managerId: M.id }, select: { id: true } }))!.id;

  console.log("\n-- Seed a KNOWN set of marks in THIS week + a scheduled non-negotiable --");
  // segment0: h0 MET Mon/Tue/Wed (3), MISSED Thu, NA Fri; h1 MET Mon/Tue (2) -> daysMet 5, target 14
  for (const [h, day, v] of [
    [h0, 0, "MET"], [h0, 1, "MET"], [h0, 2, "MET"], [h0, 3, "MISSED"], [h0, 4, "NA"],
    [h1, 0, "MET"], [h1, 1, "MET"],
  ] as [string, number, string][]) {
    await prisma.habitMark.create({ data: { habitId: h, date: D(addDays(mon, day)), value: v } });
  }
  const nn = await call(M.cookie, "POST", "/api/routine/non-negotiables", { name: "No screens past bedtime" });
  // Phase 42: schedule the rule required on EVERY day this week (a row = required,
  // done=false). "missed" = scheduled days strictly before today, left undone.
  const weekDayKeys: string[] = ov0.json.week.days;
  const todayK: string = ov0.json.today;
  for (const d of weekDayKeys) await prisma.nonNegotiableMark.create({ data: { nonNegotiableId: nn.json.id, date: D(d), done: false } });
  const expectedMissed = weekDayKeys.filter((d) => d < todayK).length;

  console.log("\n-- Summary matches the seeded marks + is CONSISTENT with the grid tally --");
  const ov = await call(M.cookie, "GET", "/api/routine");
  const sum = ov.json.summary;
  rec("summary present with per-segment rows", [Array.isArray(sum?.segments), sum.segments.length], [true, 4]);
  rec("segment0 daysMet/target = seeded 5 / 14", [sum.segments[0].daysMet, sum.segments[0].target], [5, 14]);
  rec("  ...and MATCHES the grid tally (segment.metThisWeek/targetThisWeek)", [sum.segments[0].daysMet === ov.json.segments[0].metThisWeek, sum.segments[0].target === ov.json.segments[0].targetThisWeek], [true, true]);
  const gridMet = ov.json.segments.reduce((a: number, s: any) => a + s.metThisWeek, 0);
  const gridTarget = ov.json.segments.reduce((a: number, s: any) => a + s.targetThisWeek, 0);
  rec("overall daysMet/target = sum of segment tallies", [sum.overallDaysMet, sum.overallTarget], [gridMet, gridTarget]);
  rec("overall daysMet = seeded 5", sum.overallDaysMet, 5);
  rec(`missed = ${expectedMissed} (scheduled past days left undone)`, sum.missed, expectedMissed);

  console.log("\n-- PER-WEEK recalculation: a PAST week has its OWN summary --");
  // Seed a DIFFERENT amount in the previous week: h0 MET on all 7 days -> daysMet 7 that segment.
  for (let i = 0; i < 7; i++) await prisma.habitMark.create({ data: { habitId: h0, date: D(addDays(prevMon, i)), value: "MET" } });
  const cur = await call(M.cookie, "GET", "/api/routine");
  const prev = await call(M.cookie, "GET", `/api/routine?week=${prevMon}`);
  rec("this-week overall vs prev-week overall differ", cur.json.summary.overallDaysMet !== prev.json.summary.overallDaysMet, true);
  rec("this week overall = 5 (unchanged)", cur.json.summary.overallDaysMet, 5);
  rec("prev week segment0 daysMet = 7 (that week's marks)", prev.json.summary.segments[0].daysMet, 7);
  rec("prev week missed = 0 (nothing scheduled then)", prev.json.summary.missed, 0);

  console.log("\n-- Summary endpoint is MANAGER-only + own-person-scoped --");
  const pc = await signIn(personEmail, personPw);
  rec("PERSON GET /api/routine (summary) -> 403", (await call(pc, "GET", "/api/routine")).status, 403);
  rec("lead GET /api/routine -> 403", (await call(L.cookie, "GET", "/api/routine")).status, 403);
  rec("developer GET /api/routine -> 403", (await call(Dv.cookie, "GET", "/api/routine")).status, 403);
  rec("admin GET /api/routine -> 403", (await call(AD.cookie, "GET", "/api/routine")).status, 403);
  const m2 = await call(M2.cookie, "GET", "/api/routine");
  rec("another manager sees ONLY their own (person:null, empty summary)", [m2.status, m2.json.person, m2.json.summary.overallDaysMet, m2.json.summary.segments.length], [200, null, 0, 0]);
  void personId;

  console.log("\n-- The person /kid carries NO summary --");
  const kid = await call(pc, "GET", "/api/routine/kid");
  rec("kid view has no summary / score", ["summary" in kid.json, JSON.stringify(kid.json).includes("targetPerWeek"), JSON.stringify(kid.json).includes("overallDaysMet")], [false, false, false]);

  await teardown();
  rec("teardown: no p38- residue", await prisma.user.count({ where: { email: { startsWith: PREFIX } } }), 0);
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
