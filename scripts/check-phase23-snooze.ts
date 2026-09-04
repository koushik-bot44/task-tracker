/**
 * Phase 23 — notification snooze lifecycle + caller-scope, against the running
 * app (localhost) + prod DB with throwaway p23- actors and hard teardown.
 *
 * Lifecycle proven: snooze (future) hides an item from the active bell + unread
 * count and lists it under "snoozed"; unsnooze brings it back; a snoozedUntil in
 * the PAST reads as active again even before the cron; the cron wakes a due item
 * exactly once (clears snoozedUntil, resets readAt to unread) and does NOT wake a
 * future item, and a second cron pass wakes nothing (no double-push). Scope: a
 * user can only snooze/unsnooze THEIR OWN (another user's -> 404); a past time is
 * 400; the cron 401s a missing/wrong CRON_SECRET.
 *
 * Requires the dev server to run with CRON_SECRET matching CRON below.
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const BASE = "http://localhost:3000";
const PREFIX = "p23-";
const CRON = "phase23test"; // must match the dev server's CRON_SECRET for this run
const prisma = new PrismaClient();
let pass = 0, fail = 0;
function rec(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(56)} got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
type Actor = { id: string; cookie: string };
async function signIn(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`sign-in ${email}: ${res.status}`);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}
async function call(a: Actor | null, method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(a ? { cookie: a.cookie } : {}), ...(extraHeaders ?? {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json: any = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const bell = (a: Actor) => call(a, "GET", "/api/notifications");
const inList = (arr: any[], id: string) => arr.some((n) => n.id === id);

async function teardown() {
  const ids = (await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } })).map((u) => u.id);
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

async function main() {
  await teardown();
  const mk = async (label: string): Promise<Actor> => {
    const email = `${PREFIX}${label}@orbit.local`;
    const password = generateTempPassword(16);
    const u = await prisma.user.create({ data: { email, name: `P23 ${label}`, role: "RESOURCE", status: "ACTIVE", passwordHash: await hashPassword(password) } });
    return { id: u.id, cookie: await signIn(email, password) };
  };
  const mkNotif = (userId: string, over: Record<string, unknown> = {}) =>
    prisma.notification.create({ data: { userId, type: "test", title: "Test notif", body: "body", data: { url: "/calendar" }, ...over } });

  const A = await mk("owner");
  const B = await mk("other");

  const past = new Date(Date.now() - 60_000).toISOString();
  const future = new Date(Date.now() + 60 * 60_000).toISOString();

  // -- baseline: an unread notification is in the active list --
  const n1 = await mkNotif(A.id);
  let b = (await bell(A)).json;
  rec("n1 in active items", inList(b.items, n1.id), true);
  rec("n1 counted in unread", b.unread >= 1, true);
  rec("snoozed section empty", b.snoozed.length, 0);

  // -- caller scope: B cannot snooze A's notification --
  rec("B snoozes A's notification -> 404", (await call(B, "PATCH", `/api/notifications/${n1.id}/snooze`, { until: future })).status, 404);

  // -- past time rejected --
  rec("A snoozes to a PAST time -> 400", (await call(A, "PATCH", `/api/notifications/${n1.id}/snooze`, { until: past })).status, 400);

  // -- snooze to future hides it from the active list + unread, shows in snoozed --
  rec("A snoozes n1 to +1h -> 200", (await call(A, "PATCH", `/api/notifications/${n1.id}/snooze`, { until: future })).status, 200);
  b = (await bell(A)).json;
  rec("n1 gone from active items", inList(b.items, n1.id), false);
  rec("n1 no longer counted in unread", b.unread, 0);
  rec("n1 present in snoozed section", inList(b.snoozed, n1.id), true);

  // -- unsnooze brings it back --
  rec("A unsnoozes n1 (until:null) -> 200", (await call(A, "PATCH", `/api/notifications/${n1.id}/snooze`, { until: null })).status, 200);
  b = (await bell(A)).json;
  rec("n1 back in active items", inList(b.items, n1.id), true);
  rec("snoozed empty again", b.snoozed.length, 0);

  // -- a snoozedUntil in the PAST reads as active again (before any cron) --
  await prisma.notification.update({ where: { id: n1.id }, data: { snoozedUntil: new Date(Date.now() - 60_000) } });
  b = (await bell(A)).json;
  rec("past-snoozed n1 is active again in items", inList(b.items, n1.id), true);
  rec("past-snoozed n1 not in the snoozed section", inList(b.snoozed, n1.id), false);
  // Clear it so it is not 'due' during the cron test below.
  await prisma.notification.update({ where: { id: n1.id }, data: { snoozedUntil: null } });

  // -- cron auth: missing / wrong secret -> 401 --
  rec("cron with no auth -> 401", (await call(null, "GET", "/api/cron/snooze-wake")).status, 401);
  rec("cron with wrong secret -> 401", (await call(null, "GET", "/api/cron/snooze-wake", undefined, { authorization: "Bearer nope" })).status, 401);

  // -- cron wake: a due (past), READ item is woken exactly once -> active + unread --
  const n2 = await mkNotif(A.id, { snoozedUntil: new Date(Date.now() - 60_000), readAt: new Date() });
  // a FUTURE-snoozed item must NOT be woken by the cron
  const n3 = await mkNotif(A.id, { snoozedUntil: new Date(Date.now() + 60 * 60_000) });

  const run1 = await call(null, "GET", "/api/cron/snooze-wake", undefined, { authorization: `Bearer ${CRON}` });
  rec("cron with correct secret -> 200", run1.status, 200);
  rec("cron reports at least one woken", run1.json?.woken >= 1, true);
  const n2a = await prisma.notification.findUnique({ where: { id: n2.id }, select: { snoozedUntil: true, readAt: true } });
  rec("woken n2: snoozedUntil cleared", n2a?.snoozedUntil, null);
  rec("woken n2: readAt reset (unread again)", n2a?.readAt, null);
  const n3a = await prisma.notification.findUnique({ where: { id: n3.id }, select: { snoozedUntil: true } });
  rec("future n3: NOT woken (still snoozed)", n3a?.snoozedUntil !== null, true);

  // -- idempotency: a second pass wakes nothing (no double-push) --
  const run2 = await call(null, "GET", "/api/cron/snooze-wake", undefined, { authorization: `Bearer ${CRON}` });
  rec("second cron pass wakes 0 (no repeat)", run2.json?.woken, 0);
  const n2b = await prisma.notification.findUnique({ where: { id: n2.id }, select: { snoozedUntil: true } });
  rec("n2 remains cleared after 2nd pass", n2b?.snoozedUntil, null);

  await teardown();
  rec("teardown: no p23- residue", await prisma.user.count({ where: { email: { startsWith: PREFIX } } }), 0);
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
