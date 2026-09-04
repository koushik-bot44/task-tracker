/**
 * Phase 36 — weight containment + the monthly weight trend.
 *
 * CONTAINMENT: a person's weight is reachable ONLY through the manager's own
 * Routine overview / weight endpoints, scoped to the manager's OWN person. This
 * asserts weight endpoints are manager-only + own-person-scoped (PERSON -> 403,
 * lead/dev/admin -> 403, another manager's weight entry -> 404), that the PERSON
 * login endpoint omits weight entirely, and that no non-routine manager surface
 * (overview / People / me) returns any weight field.
 *
 * MONTHLY: GET /api/routine returns `monthlyWeights` = one representative point
 * per IST calendar month (the LATEST entry that month), ascending, capped to 12.
 *
 * Runs against the running app + prod DB with throwaway p36- actors; hard teardown.
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const BASE = "http://localhost:3000";
const PREFIX = "p36-";
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
async function teardown() {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

async function main() {
  await teardown();
  const mk = async (label: string, role: "MANAGER" | "TEAM_LEAD" | "RESOURCE" | "ADMIN") => {
    const email = `${PREFIX}${label.toLowerCase()}@orbit.local`;
    const password = generateTempPassword(16);
    const u = await prisma.user.create({ data: { email, name: `P36 ${label}`, role, status: "ACTIVE", passwordHash: await hashPassword(password) } });
    return { id: u.id, cookie: await signIn(email, password), email };
  };
  const M = await mk("mgr", "MANAGER");
  const M2 = await mk("mgr2", "MANAGER");
  const L = await mk("lead", "TEAM_LEAD");
  const Dv = await mk("dev", "RESOURCE");
  const AD = await mk("admin", "ADMIN");

  const personEmail = `${PREFIX}person@orbit.local`;
  const personPw = "personpass123";
  const cp = await call(M.cookie, "POST", "/api/routine", { name: "Aarav", email: personEmail, password: personPw });
  rec("manager creates person -> 201", cp.status, 201);
  await call(M2.cookie, "POST", "/api/routine", { name: "Bo", email: `${PREFIX}p2@orbit.local`, password: "personpass456" });
  const person = await prisma.person.findFirst({ where: { managerId: M.id }, select: { id: true } });
  if (!person) { console.log("create-person failed:", JSON.stringify(cp)); throw new Error("no person created"); }
  const personId = person.id;

  console.log("\n-- Monthly aggregation (latest-in-month per IST month) --");
  // Seed weights across three months; latest-in-month is the representative.
  const seed: [string, number][] = [
    ["2026-06-05", 60.0], ["2026-06-20", 60.5],           // June -> 60.5 (latest)
    ["2026-07-15", 61.2],                                  // July -> 61.2
    ["2026-08-02", 61.0], ["2026-08-28", 60.8], ["2026-08-10", 61.5], // Aug -> 60.8 (latest date 08-28)
  ];
  for (const [d, kg] of seed) await prisma.weightEntry.create({ data: { personId, date: D(d), weightKg: kg } });

  const ov = await call(M.cookie, "GET", "/api/routine");
  rec("overview returns monthlyWeights", Array.isArray(ov.json?.monthlyWeights), true);
  rec("  one point per month, ascending", ov.json.monthlyWeights.map((m: any) => m.month), ["2026-06", "2026-07", "2026-08"]);
  rec("  representative = latest-in-month", ov.json.monthlyWeights.map((m: any) => m.weightKg), [60.5, 61.2, 60.8]);
  rec("  recent `weights` still lists every entry", ov.json.weights.length, 6);

  console.log("\n-- Weight endpoints: MANAGER-only + own-person-scoped --");
  const logged = await call(M.cookie, "POST", "/api/routine/weight", { date: "2026-08-29", weightKg: 60.7 });
  rec("own manager logs weight -> 201", logged.status, 201);
  const wId = logged.json.id;
  rec("own manager edits it -> 200", (await call(M.cookie, "PATCH", `/api/routine/weight/${wId}`, { weightKg: 60.6 })).status, 200);

  const personCookie = await signIn(personEmail, personPw);
  rec("PERSON POST /api/routine/weight -> 403", (await call(personCookie, "POST", "/api/routine/weight", { date: "2026-08-29", weightKg: 50 })).status, 403);
  rec("PERSON DELETE /api/routine/weight/:id -> 403", (await call(personCookie, "DELETE", `/api/routine/weight/${wId}`)).status, 403);
  rec("lead POST weight -> 403", (await call(L.cookie, "POST", "/api/routine/weight", { date: "2026-08-29", weightKg: 50 })).status, 403);
  rec("developer POST weight -> 403", (await call(Dv.cookie, "POST", "/api/routine/weight", { date: "2026-08-29", weightKg: 50 })).status, 403);
  rec("admin POST weight -> 403", (await call(AD.cookie, "POST", "/api/routine/weight", { date: "2026-08-29", weightKg: 50 })).status, 403);
  rec("another manager DELETE M's weight entry -> 404", (await call(M2.cookie, "DELETE", `/api/routine/weight/${wId}`)).status, 404);
  rec("another manager PATCH M's weight entry -> 404", (await call(M2.cookie, "PATCH", `/api/routine/weight/${wId}`, { weightKg: 99 })).status, 404);

  console.log("\n-- Weight is ABSENT from the person login + non-routine surfaces --");
  const kid = await call(personCookie, "GET", "/api/routine/kid");
  rec("person login endpoint omits weight (no weightKg / weights key)", [JSON.stringify(kid.json).includes("weightKg"), "weights" in (kid.json ?? {}), "monthlyWeights" in (kid.json ?? {})], [false, false, false]);
  for (const path of ["/api/overview", "/api/users", "/api/users/me", "/api/calendar", "/api/meetings", "/api/review"]) {
    const r = await call(M.cookie, "GET", path);
    rec(`  ${path} returns no weight`, JSON.stringify(r.json ?? {}).includes("weightKg"), false);
  }

  await teardown();
  rec("teardown: no p36- residue", await prisma.user.count({ where: { email: { startsWith: PREFIX } } }), 0);
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
