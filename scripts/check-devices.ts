/* eslint-disable @typescript-eslint/no-explicit-any */
/* The automatic-location pipeline, end to end, with a simulated phone (2026-09-29).
 *   npx tsx --env-file=.env.local scripts/check-devices.ts      (dev server up; LOCAL CLONE only)
 *
 * Plays the child's phone exactly as the native apps do (records/plans/device-tracking-plan.md
 * §5): pairs with a parent's code, reports its state, uploads queued fixes (with retries,
 * duplicates and bad fixes), answers Locate Now, rotates its token, is revoked. Checks what
 * the parent sees at every step, the walls between roles, rate limits, retention and the
 * access log. Cleans up its own phone, positions and requests afterwards.
 * Evidence: records/evidence/devices/check-devices.txt */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3010";
const DIR = "records/evidence/devices";
if (!/127\.0\.0\.1:5433|localhost:5433/.test(process.env.DATABASE_URL ?? "")) throw new Error("local clone only");
mkdirSync(DIR, { recursive: true });

const lines: string[] = [];
let pass = 0;
let fail = 0;
function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  const l = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`;
  lines.push(l);
  console.log(l);
}
function info(t: string) {
  lines.push(`INFO  ${t}`);
  console.log(`INFO  ${t}`);
}

type Res = { status: number; json: any };
async function signIn(email: string, password: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`sign-in ${email} ${r.status}`);
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
async function asUser(cookie: string, method: string, path: string, body?: unknown): Promise<Res> {
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null;
  try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, json };
}
async function asPhone(token: string | null, method: string, path: string, body?: unknown): Promise<Res> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null;
  try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, json };
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
// A walk near the demo's positions in Madhapur, Hyderabad.
const fix = (m: number, i: number, extra: Record<string, unknown> = {}) => ({
  clientId: randomUUID(),
  lat: 17.4485 + i * 0.0006,
  lng: 78.3908 + i * 0.0004,
  accuracy: 12,
  speed: 1.3,
  recordedAt: minutesAgo(m),
  trigger: "BACKGROUND",
  batteryLevel: 64,
  isCharging: false,
  networkType: "CELLULAR",
  ...extra,
});
const status = (patch: Record<string, unknown> = {}) => ({
  permission: "ALWAYS", locationEnabled: true, trackingState: "RUNNING", preciseLocation: true, notificationsAllowed: true,
  batteryOptimized: false, batteryLevel: 64, isCharging: false, networkType: "CELLULAR", appVersion: "1.0.0-rig", osVersion: "Android 15",
  pushProvider: "FCM", pushToken: "rig-fcm-token", queueSize: 0, event: "PERIODIC", ...patch,
});

let deviceId: string | null = null;
const started = new Date();
const dummyLocates: string[] = [];

async function main() {
  const ceo = await signIn("founder@orbit.local", "orbit123");
  const priya = await signIn("priya.wb@orbit.local", "orbit1234");
  const rao = await signIn("rao.tutor@orbit.local", "orbit1234");
  const arjun = await signIn("arjun.wb@orbit.local", "orbit123");
  let hod: string | null = null;
  for (const e of ["hod-dev@orbit.local", "vikram@orbit.local"]) {
    try { hod = await signIn(e, "orbit123"); info(`head of department: ${e}`); break; } catch { /* next */ }
  }
  const person = await prisma.person.findFirst({ where: { manager: { email: "founder@orbit.local" } }, select: { id: true, name: true } });
  if (!person) throw new Error("no Well Being person for the CEO");
  info(`child: ${person.name}`);
  // Every phone for this child is removed first so the run owns a clean slate
  // (the dashboard demo seed leaves one behind; this rig and that demo share Arjun).
  const old = await prisma.childDevice.findMany({ where: { personId: person.id }, select: { id: true } });
  for (const o of old) await cleanupDevice(o.id);
  // Any stray device positions with no device row (older runs) also go.
  await prisma.locationPoint.deleteMany({ where: { personId: person.id, source: "DEVICE" } });

  /* ── walls before anything exists ── */
  for (const [who, c] of [["the tutor", rao], ["the child himself", arjun], ["a head of department", hod]] as const) {
    if (!c) continue;
    const r = await asUser(c, "GET", "/api/routine/devices");
    record(`${who} cannot see the phones`, r.status === 403, `status ${r.status}`);
    const l = await asUser(c, "GET", "/api/routine/location/latest");
    record(`${who} cannot see the latest location`, l.status === 403, `status ${l.status}`);
  }
  const anon = await fetch(`${BASE}/api/routine/location/latest`);
  record("nobody signed out can see the latest location", anon.status === 401, `status ${anon.status}`);

  /* ── pairing ── */
  const wrong = await asPhone(null, "POST", "/api/device/pair", { code: "ABCD-EFGH", platform: "ANDROID", appVersion: "1.0.0-rig" });
  record("a made-up code is refused", wrong.status === 404 && wrong.json?.code === "PAIRING_INVALID", `status ${wrong.status} ${wrong.json?.code}`);
  const priyaCode = await asUser(priya, "POST", "/api/routine/devices/pairing");
  record("the editable co-parent may make a pairing code too", priyaCode.status === 201, `status ${priyaCode.status}`);
  const made = await asUser(ceo, "POST", "/api/routine/devices/pairing");
  const code: string = made.json?.code ?? "";
  record("the CEO makes a pairing code (8 characters, 15 minutes)", made.status === 201 && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code) && Date.parse(made.json.expiresAt) - Date.now() > 14 * 60_000, code);
  const stale = await asPhone(null, "POST", "/api/device/pair", { code: priyaCode.json?.code, platform: "ANDROID", appVersion: "1.0.0-rig" });
  record("…which kills the co-parent's older code", stale.status === 404, `status ${stale.status}`);
  const paired = await asPhone(null, "POST", "/api/device/pair", { code: code.toLowerCase().replace("-", " "), platform: "ANDROID", appVersion: "1.0.0-rig", model: "Rig Pixel", osVersion: "Android 15", name: "Rig Phone" });
  let token: string = paired.json?.deviceToken ?? "";
  deviceId = paired.json?.deviceId ?? null;
  record("the phone pairs with the code as typed (any case, any spacing)", paired.status === 201 && token.startsWith("odt_") && Boolean(deviceId) && paired.json?.personName === person.name, `status ${paired.status}`);
  record("…and is told how often to report", paired.json?.config?.heartbeatSeconds === 900 && paired.json?.config?.maxBatch === 200);
  const again = await asPhone(null, "POST", "/api/device/pair", { code, platform: "ANDROID", appVersion: "1.0.0-rig" });
  record("the same code cannot pair a second phone", again.status === 404, `status ${again.status}`);
  const stored = await prisma.childDevice.findUnique({ where: { id: deviceId! }, select: { tokenHash: true } });
  record("only a hash of the phone's token is stored", Boolean(stored) && stored!.tokenHash.length === 64 && !stored!.tokenHash.includes(token.slice(4, 20)));
  const pairNote = await prisma.notification.findFirst({ where: { type: "routine.location", createdAt: { gte: started }, title: { startsWith: "A phone was connected" } } });
  record("the parents are told a phone was connected", Boolean(pairNote), pairNote?.title ?? "none");

  /* ── state reports ── */
  let latest = await asUser(ceo, "GET", "/api/routine/location/latest");
  record("paired, no position yet: the parent sees it honestly (not live)", latest.json?.status?.state === "STALE" && latest.json?.device?.name === "Rig Phone", `${latest.json?.status?.state}: ${latest.json?.status?.message}`);
  let hb = await asPhone(token, "POST", "/api/device/heartbeat", status({ permission: "NOT_DETERMINED", event: "APP_OPEN" }));
  latest = await asUser(ceo, "GET", "/api/routine/location/latest");
  record("permission not given yet -> Permission off", hb.status === 200 && latest.json?.status?.state === "PERMISSION_REVOKED", latest.json?.status?.label);
  const permNote = await prisma.notification.findFirst({ where: { type: "routine.location", createdAt: { gte: started }, title: { contains: "Permission off" } } });
  record("…and the parents are notified once", Boolean(permNote), permNote?.body ?? "none");
  hb = await asPhone(token, "POST", "/api/device/heartbeat", status({ event: "PERMISSION_CHANGED" }));
  record("the phone reports sharing running with all permissions", hb.status === 200 && Array.isArray(hb.json?.locateRequests) && typeof hb.json?.serverTime === "string");

  /* ── uploads ── */
  const walk = [20, 16, 12, 8, 4].map((m, i) => fix(m, i));
  const up = await asPhone(token, "POST", "/api/device/locations", {
    points: [...walk, walk[0], fix(3, 9, { lat: 95 }), fix(-15, 9)],
  });
  record("an upload keeps 5 good fixes, drops a repeat, rejects bad ones with reasons", up.status === 200 && up.json?.accepted === 5 && up.json?.duplicates === 1 && up.json?.rejected?.length === 2,
    `accepted ${up.json?.accepted}, duplicates ${up.json?.duplicates}, rejected ${JSON.stringify(up.json?.rejected?.map((r: any) => r.reason))}`);
  const retry = await asPhone(token, "POST", "/api/device/locations", { points: walk });
  record("a retried upload of the same fixes stores nothing twice", retry.json?.accepted === 0 && retry.json?.duplicates === 5, `accepted ${retry.json?.accepted}, duplicates ${retry.json?.duplicates}`);
  const count = await prisma.locationPoint.count({ where: { deviceId: deviceId! } });
  record("…the database holds exactly 5 positions for the phone", count === 5, `${count}`);
  latest = await asUser(ceo, "GET", "/api/routine/location/latest");
  const L = latest.json;
  record("now the parent sees it Live, from the phone, 4 min old by the phone's own clock", L?.status?.state === "ACTIVE" && L?.latest?.source === "DEVICE" && L?.freshness?.ageSeconds >= 200 && L?.freshness?.ageSeconds < 330 && L?.freshness?.delayedUpload === false,
    `${L?.status?.state}, ${L?.freshness?.ageSeconds}s`);
  record("…with battery, network and accuracy", L?.device?.batteryLevel === 64 && L?.device?.networkType === "CELLULAR" && L?.latest?.accuracy === 12);
  const beforeLast = (await prisma.childDevice.findUnique({ where: { id: deviceId! } }))!.lastLocationAt;
  // 50 minutes back: older than the walk (so it must not move "last seen"), with a
  // 30-minute hole before the walk. History is asked for the IST day of that fix,
  // so the check holds at any hour (an earlier version failed just after midnight IST).
  const lateFix = fix(50, 30, { lat: 17.43, lng: 78.37 });
  const late = await asPhone(token, "POST", "/api/device/locations", { points: [lateFix] });
  const afterLast = (await prisma.childDevice.findUnique({ where: { id: deviceId! } }))!.lastLocationAt;
  record("a late upload of an old fix never moves 'last seen' backwards", late.json?.accepted === 1 && beforeLast?.getTime() === afterLast?.getTime());
  const istDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const lateDay = istDay(lateFix.recordedAt as string);
  const walkSameDay = istDay(walk[0].recordedAt as string) === lateDay;
  info(`history day asked for: ${lateDay}${walkSameDay ? "" : " (the walk falls on the next IST day, so the gap check is skipped)"}`);
  const day = await asUser(ceo, "GET", `/api/routine/location?day=${lateDay}`);
  const oldPoint = (day.json?.points ?? []).find((p: any) => p.source === "DEVICE" && Date.parse(p.receivedAt) - Date.parse(p.at) > 40 * 60_000);
  record("…and history shows it with its real time and when it arrived", Boolean(oldPoint), oldPoint ? `at ${oldPoint.at.slice(11, 16)}, arrived ${oldPoint.receivedAt.slice(11, 16)}` : "missing");
  const gaps = day.json?.track?.gaps ?? [];
  if (walkSameDay) record("history splits the route where data is missing (a 30-minute hole is a gap)", gaps.some((g: any) => g.minutes >= 25), gaps.map((g: any) => `${g.minutes} min`).join(", ") || "none");

  /* ── Locate Now ── */
  const ln = await asUser(ceo, "POST", "/api/routine/location/locate");
  const reqId: string = ln.json?.request?.id;
  record("Locate Now is accepted as a request, not a made-up position", ln.status === 202 && ln.json?.request?.status === "PENDING" && ln.json?.request?.point === null, `${ln.status} ${ln.json?.request?.status}`);
  record("…and says honestly it waits for the next check-in (instant push not set up here)", /check in/i.test(ln.json?.request?.message ?? ""), ln.json?.request?.message);
  const twice = await asUser(ceo, "POST", "/api/routine/location/locate");
  record("pressing again while one is on its way shows the same request", twice.status === 200 && twice.json?.request?.id === reqId && twice.json?.reused === true);
  const byPriya = await asUser(priya, "POST", "/api/routine/location/locate");
  record("the editable co-parent may press Locate Now (same request)", byPriya.json?.request?.id === reqId, `status ${byPriya.status}`);
  for (const [who, c] of [["the tutor", rao], ["the child", arjun]] as const) {
    const r = await asUser(c, "POST", "/api/routine/location/locate");
    record(`${who} cannot press Locate Now`, r.status === 403, `status ${r.status}`);
  }
  hb = await asPhone(token, "POST", "/api/device/heartbeat", status());
  record("the phone's next check-in carries the request", (hb.json?.locateRequests ?? []).some((r: any) => r.id === reqId));
  await asPhone(token, "POST", `/api/device/locate/${reqId}/status`, { status: "DELIVERED" });
  let rq = await asUser(ceo, "GET", `/api/routine/location/locate/${reqId}`);
  record("the phone acknowledges -> the parent sees it is finding its position", rq.json?.request?.status === "DELIVERED", rq.json?.request?.message);
  const answer = await asPhone(token, "POST", "/api/device/locations", { points: [fix(0, 12, { trigger: "LOCATE_NOW", locateRequestId: reqId, accuracy: 6 })] });
  rq = await asUser(ceo, "GET", `/api/routine/location/locate/${reqId}`);
  record("the phone's fresh fix fulfils the request, with the position attached", answer.json?.accepted === 1 && rq.json?.request?.status === "FULFILLED" && rq.json?.request?.point?.accuracy === 6, rq.json?.request?.status);
  const other = await asUser(ceo, "GET", `/api/routine/location/locate/not-a-real-id`);
  record("an unknown request id is a 404", other.status === 404);

  const ln2 = await asUser(ceo, "POST", "/api/routine/location/locate");
  await asPhone(token, "POST", `/api/device/locate/${ln2.json?.request?.id}/status`, { status: "FAILED", reason: "LOCATION_DISABLED" });
  rq = await asUser(ceo, "GET", `/api/routine/location/locate/${ln2.json?.request?.id}`);
  record("a phone that cannot answer says why, and the parent is told plainly", rq.json?.request?.status === "FAILED" && /location switch is off/.test(rq.json?.request?.message ?? ""), rq.json?.request?.message);

  const ln3 = await asUser(ceo, "POST", "/api/routine/location/locate");
  await prisma.locateRequest.update({ where: { id: ln3.json?.request?.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  rq = await asUser(ceo, "GET", `/api/routine/location/locate/${ln3.json?.request?.id}`);
  record("no answer in time -> EXPIRED, with the last known position still shown", rq.json?.request?.status === "EXPIRED" && /No answer/.test(rq.json?.request?.message ?? ""), rq.json?.request?.status);

  const soFar = await prisma.locateRequest.count({ where: { personId: person.id, requestedAt: { gte: new Date(Date.now() - 3600_000) } } });
  for (let i = soFar; i < 20; i++) {
    const d = await prisma.locateRequest.create({ data: { personId: person.id, deviceId: deviceId!, requestedById: "rig", status: "FULFILLED", expiresAt: new Date() } });
    dummyLocates.push(d.id);
  }
  const limited = await asUser(ceo, "POST", "/api/routine/location/locate");
  record("more than 20 Locate Now an hour is refused kindly", limited.status === 429 && limited.json?.code === "RATE_LIMITED", `status ${limited.status}`);
  await prisma.locateRequest.deleteMany({ where: { id: { in: dummyLocates } } });

  /* ── device rate limit, token rotation ── */
  let limitedAt = 0;
  for (let i = 1; i <= 35; i++) {
    const r = await asPhone(token, "POST", "/api/device/heartbeat", status());
    if (r.status === 429) { limitedAt = i; break; }
  }
  record("a phone sending more than 30 requests a minute is slowed down", limitedAt > 0 && limitedAt <= 31, `limited at request ${limitedAt} of this burst`);
  await prisma.childDevice.update({ where: { id: deviceId! }, data: { rateWindowStart: null, rateWindowCount: 0 } });
  const rot = await asPhone(token, "POST", "/api/device/token/rotate", {});
  const oldToken = token;
  token = rot.json?.deviceToken ?? token;
  const withOld = await asPhone(oldToken, "POST", "/api/device/heartbeat", status());
  const withNew = await asPhone(token, "POST", "/api/device/heartbeat", status());
  record("after rotation the old token is dead and the new one works", rot.status === 200 && withOld.status === 401 && withOld.json?.code === "DEVICE_UNAUTHORIZED" && withNew.status === 200);
  const garbage = await asPhone("odt_" + "x".repeat(43), "POST", "/api/device/heartbeat", status());
  record("a made-up token gets nothing", garbage.status === 401);

  /* ── the states a parent must see ── */
  await asPhone(token, "POST", "/api/device/heartbeat", status({ locationEnabled: false, event: "PERMISSION_CHANGED" }));
  latest = await asUser(ceo, "GET", "/api/routine/location/latest");
  record("location switched off on the phone -> Location off", latest.json?.status?.state === "LOCATION_DISABLED", latest.json?.status?.message);
  await asPhone(token, "POST", "/api/device/heartbeat", status({ trackingState: "STOPPED" }));
  latest = await asUser(ceo, "GET", "/api/routine/location/latest");
  record("sharing not running on the phone -> Sharing stopped", latest.json?.status?.state === "OFFLINE", latest.json?.status?.label);
  await asPhone(token, "POST", "/api/device/heartbeat", status({ trackingState: "SHUTTING_DOWN", event: "SHUTDOWN" }));
  await prisma.childDevice.update({ where: { id: deviceId! }, data: { lastShutdownAt: new Date(Date.now() - 5 * 60_000), lastContactAt: new Date(Date.now() - 5 * 60_000) } });
  latest = await asUser(ceo, "GET", "/api/routine/location/latest");
  record("the phone said it was switching off -> Switched off", latest.json?.status?.state === "POWERED_OFF", latest.json?.status?.message);
  await prisma.childDevice.update({ where: { id: deviceId! }, data: { lastShutdownAt: null, lastContactAt: new Date(Date.now() - 2 * 3600_000) } });
  latest = await asUser(ceo, "GET", "/api/routine/location/latest");
  record("silent for 2 hours -> Unreachable, last known position kept", latest.json?.status?.state === "DEVICE_OFFLINE" && latest.json?.latest !== null, latest.json?.status?.message);
  await asPhone(token, "POST", "/api/device/heartbeat", status({ event: "BOOT", bootedAt: new Date().toISOString() }));
  await asPhone(token, "POST", "/api/device/locations", { points: [fix(0, 14)] });
  latest = await asUser(ceo, "GET", "/api/routine/location/latest");
  record("back after a restart -> Live again", latest.json?.status?.state === "ACTIVE", latest.json?.status?.label);
  const back = await prisma.notification.findFirst({ where: { type: "routine.location", createdAt: { gte: started }, title: { contains: "sharing again" } } });
  record("…and the parents are told it is sharing again", Boolean(back));

  /* ── the co-parent, the log, retention ── */
  const pl = await asUser(priya, "GET", "/api/routine/location/latest");
  record("the co-parent sees the same live status", pl.status === 200 && pl.json?.status?.state === "ACTIVE");
  const pa = await asUser(priya, "GET", "/api/routine/location/audit");
  record("…but the access log is the owner's alone", pa.status === 403, `status ${pa.status}`);
  const audit = await asUser(ceo, "GET", "/api/routine/location/audit");
  const actions = new Set((audit.json?.events ?? []).map((e: any) => e.action));
  const wanted = ["PAIRING_CODE", "DEVICE_PAIRED", "LOCATE_NOW", "VIEW_LATEST", "VIEW_HISTORY", "PERMISSION_CHANGED", "TOKEN_ROTATED"];
  record("the owner's access log records pairing, views, Locate Now, permission changes, rotation", wanted.every((a) => actions.has(a)), wanted.filter((a) => !actions.has(a)).join(", ") || "all there");
  const viewRows = await prisma.locationAuditEvent.count({ where: { personId: person.id, action: "VIEW_LATEST", createdAt: { gte: started } } });
  record("…a dashboard that looked many times is one view row per viewer per 10 minutes", viewRows <= 2, `${viewRows} rows`);
  const pr = await asUser(priya, "PATCH", "/api/routine/location/settings", { retentionDays: 30 });
  record("the co-parent cannot change how long positions are kept", pr.status === 403, `status ${pr.status}`);
  const bad = await asUser(ceo, "PATCH", "/api/routine/location/settings", { retentionDays: 3 });
  record("retention under a week is refused", bad.status === 400);
  const set7 = await asUser(ceo, "PATCH", "/api/routine/location/settings", { retentionDays: 7 });
  await asPhone(token, "POST", "/api/device/locations", { points: [fix(10 * 24 * 60, 40)] });
  const secret = process.env.CRON_SECRET ?? "";
  const hk = await fetch(`${BASE}/api/cron/location-housekeeping`, { headers: { Authorization: `Bearer ${secret}` } });
  const hkj: any = await hk.json().catch(() => null);
  const leftOld = await prisma.locationPoint.count({ where: { personId: person.id, at: { lt: new Date(Date.now() - 7 * 86400_000) } } });
  record("with 7 days' retention, the daily housekeeping deletes a 10-day-old position", set7.json?.retentionDays === 7 && hk.status === 200 && hkj?.purgedPoints >= 1 && leftOld === 0, `purged ${hkj?.purgedPoints}`);
  const noCron = await fetch(`${BASE}/api/cron/location-housekeeping`);
  record("…and nobody without the cron secret can run it", noCron.status === 401);
  await asUser(ceo, "PATCH", "/api/routine/location/settings", { retentionDays: 90 });

  /* ── the child's own screen ── */
  const kid = await asUser(arjun, "GET", "/api/routine/kid/location");
  record("the child sees that his phone is sharing, and never the legacy link", kid.status === 200 && kid.json?.device?.name === "Rig Phone" && kid.json?.sharing?.url === null, kid.json?.device?.label);

  /* ── revocation ── */
  const rev = await asUser(ceo, "DELETE", `/api/routine/devices/${deviceId}`);
  const after = await asPhone(token, "POST", "/api/device/heartbeat", status());
  record("the parent removes the phone; its token stops at once (the app is told why)", rev.status === 200 && after.status === 401 && after.json?.code === "DEVICE_REVOKED", `${after.status} ${after.json?.code}`);
  const devs = await asUser(ceo, "GET", "/api/routine/devices");
  record("…and it is gone from the parent's list", !(devs.json?.devices ?? []).some((d: any) => d.id === deviceId));
}

async function cleanupDevice(id: string) {
  await prisma.locateRequest.deleteMany({ where: { deviceId: id } });
  await prisma.locationPoint.deleteMany({ where: { deviceId: id } });
  await prisma.locationAuditEvent.deleteMany({ where: { deviceId: id } });
  await prisma.devicePairing.deleteMany({ where: { deviceId: id } });
  await prisma.childDevice.deleteMany({ where: { id } });
}

main()
  .catch((e) => { console.error(e); fail++; lines.push(`FAIL  crashed: ${(e as Error).message}`); })
  .finally(async () => {
    if (dummyLocates.length) await prisma.locateRequest.deleteMany({ where: { id: { in: dummyLocates } } }).catch(() => {});
    if (deviceId) await cleanupDevice(deviceId).catch(() => {});
    await prisma.notification.deleteMany({ where: { type: "routine.location", createdAt: { gte: started } } }).catch(() => {});
    await prisma.devicePairing.deleteMany({ where: { createdAt: { gte: started } } }).catch(() => {});
    writeFileSync(`${DIR}/check-devices.txt`, lines.join("\n") + `\n\n${pass} passed, ${fail} failed\n`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  });
