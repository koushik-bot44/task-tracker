/* Unit checks for the automatic-location logic (2026-09-29). No server, no data.
 *   npx tsx --env-file=.env.local scripts/unit-location.ts
 * Covers: every device state, the issues list, history segmentation (gaps,
 * impossible speed, coarse and unplaced fixes), pairing codes, token hashing,
 * and the per-point rejection rules for uploads. */
import assert from "node:assert/strict";
import { CONTACT_MS, FRESH_MS, SILENT_MS, deviceIssues, deviceStatus, type DeviceFacts } from "../lib/device-status";
import { GAP_MS, buildTrack, metres } from "../lib/location-track";
import { PAIRING_ALPHABET, formatPairingCode, hashDeviceToken, hashPairingCode, newDeviceToken, newPairingCode, normalizePairingCode } from "../lib/device-auth";
import { rejectReason } from "../lib/device-service";

let pass = 0;
let fail = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    fail++;
    console.log(`FAIL  ${name}  (${(e as Error).message})`);
  }
}

const now = new Date("2026-09-29T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const base: DeviceFacts = { revokedAt: null, permission: "ALWAYS", locationEnabled: true, trackingState: "RUNNING", lastContactAt: ago(60_000), lastLocationAt: ago(5 * 60_000), lastShutdownAt: null };
const st = (patch: Partial<DeviceFacts>) => deviceStatus({ ...base, ...patch }, now).state;

/* ── states ── */
check("no phone -> UNKNOWN", () => assert.equal(deviceStatus(null, now).state, "UNKNOWN"));
check("revoked phone -> UNKNOWN", () => assert.equal(st({ revokedAt: ago(1000) }), "UNKNOWN"));
check("never in touch -> UNKNOWN", () => assert.equal(st({ lastContactAt: null, lastLocationAt: null }), "UNKNOWN"));
check("fresh position and contact -> ACTIVE", () => assert.equal(st({}), "ACTIVE"));
check("position exactly at the fresh limit is still ACTIVE", () => assert.equal(st({ lastLocationAt: ago(FRESH_MS) }), "ACTIVE"));
// Hourly positions (2026-10-02): 45 min old is current; past 75 min it is not.
check("in touch, position 45 min old -> ACTIVE (it sends about hourly)", () => assert.equal(st({ lastLocationAt: ago(45 * 60_000) }), "ACTIVE"));
check("in touch but position 90 min old -> STALE (last known is not current)", () => assert.equal(st({ lastLocationAt: ago(90 * 60_000) }), "STALE"));
check("in touch, never a position -> STALE", () => assert.equal(st({ lastLocationAt: null }), "STALE"));
check("silent 3 h -> DEVICE_OFFLINE", () => assert.equal(st({ lastContactAt: ago(3 * 3600_000), lastLocationAt: ago(3 * 3600_000) }), "DEVICE_OFFLINE"));
check("one hourly check-in a bit late (70 min) is still in touch", () => assert.notEqual(st({ lastContactAt: ago(70 * 60_000), lastLocationAt: ago(70 * 60_000) }), "DEVICE_OFFLINE"));
check("silent just past the contact window -> DEVICE_OFFLINE", () => assert.equal(st({ lastContactAt: ago(CONTACT_MS + 1000) }), "DEVICE_OFFLINE"));
check("silent over a day -> UNKNOWN", () => assert.equal(st({ lastContactAt: ago(SILENT_MS + 1000) }), "UNKNOWN"));
check("permission denied -> PERMISSION_REVOKED", () => assert.equal(st({ permission: "DENIED" }), "PERMISSION_REVOKED"));
check("only while in use -> PERMISSION_REVOKED", () => assert.equal(st({ permission: "WHILE_IN_USE" }), "PERMISSION_REVOKED"));
check("location switch off -> LOCATION_DISABLED", () => assert.equal(st({ locationEnabled: false }), "LOCATION_DISABLED"));
check("tracking stopped on the phone -> OFFLINE", () => assert.equal(st({ trackingState: "STOPPED" }), "OFFLINE"));
check("shutdown was the last word -> POWERED_OFF", () => assert.equal(st({ lastShutdownAt: ago(10 * 60_000), lastContactAt: ago(10 * 60_000) }), "POWERED_OFF"));
check("shutdown then back in touch -> not POWERED_OFF", () => assert.equal(st({ lastShutdownAt: ago(3 * 3600_000), lastContactAt: ago(60_000) }), "ACTIVE"));
check("shutdown two days ago, silent since -> POWERED_OFF still says so", () => assert.equal(st({ lastShutdownAt: ago(2 * SILENT_MS), lastContactAt: ago(2 * SILENT_MS) }), "POWERED_OFF"));
check("permission off outranks silence under a day", () => assert.equal(st({ permission: "DENIED", lastContactAt: ago(3 * 3600_000) }), "PERMISSION_REVOKED"));
check("every state carries words and a label", () => {
  for (const s of [null, base, { ...base, permission: "DENIED" }]) {
    const r = deviceStatus(s, now);
    assert.ok(r.label.length > 0 && r.message.length > 0);
  }
});

/* ── issues ── */
const issueBase = { ...base, platform: "ANDROID", preciseLocation: true, notificationsAllowed: true, batteryOptimized: false, batteryLevel: 80, isCharging: false, queueSize: 0, pushToken: "t" };
check("a healthy phone with push has no issues", () => assert.deepEqual(deviceIssues(issueBase, true), []));
check("approximate location, battery optimisation, low battery, no push are all named", () => {
  const codes = deviceIssues({ ...issueBase, preciseLocation: false, batteryOptimized: true, batteryLevel: 9, pushToken: null }, false).map((i) => i.code);
  for (const c of ["APPROXIMATE", "BATTERY_OPTIMISED", "BATTERY_LOW", "NO_PUSH"]) assert.ok(codes.includes(c), `missing ${c}`);
});
check("charging at 9% is not a battery warning", () => assert.ok(!deviceIssues({ ...issueBase, batteryLevel: 9, isCharging: true }, true).some((i) => i.code === "BATTERY_LOW")));
check("battery optimisation is an Android-only warning", () => assert.ok(!deviceIssues({ ...issueBase, platform: "IOS", batteryOptimized: true }, true).some((i) => i.code === "BATTERY_OPTIMISED")));

/* ── history ── */
const t0 = new Date("2026-09-29T08:00:00Z").getTime();
const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
check("close points make one segment and no gap", () => {
  const tr = buildTrack([
    { id: "a", at: at(0), lat: 17.44, lng: 78.38, accuracy: 10 },
    { id: "b", at: at(5), lat: 17.441, lng: 78.381, accuracy: 10 },
    { id: "c", at: at(10), lat: 17.442, lng: 78.382, accuracy: 10 },
  ]);
  assert.deepEqual(tr.segments, [["a", "b", "c"]]);
  assert.equal(tr.gaps.length, 0);
});
check("hourly positions join up; a 3-hour hole (missed hours) is a gap, not a line", () => {
  const hourly = buildTrack([
    { id: "a", at: at(0), lat: 17.44, lng: 78.38, accuracy: 10 },
    { id: "b", at: at(60), lat: 17.441, lng: 78.381, accuracy: 10 },
  ]);
  assert.deepEqual(hourly.segments, [["a", "b"]]);
  const tr = buildTrack([
    { id: "a", at: at(0), lat: 17.44, lng: 78.38, accuracy: 10 },
    { id: "b", at: at(180), lat: 17.45, lng: 78.39, accuracy: 10 },
  ]);
  assert.deepEqual(tr.segments, [["a"], ["b"]]);
  assert.equal(tr.gaps[0].minutes, 180);
  assert.ok(GAP_MS > 60 * 60_000 && GAP_MS < 180 * 60_000); // an hourly step joins; a missed hour is a gap
});
check("an impossible jump (300 km in 5 min) is a gap", () => {
  const tr = buildTrack([
    { id: "a", at: at(0), lat: 17.44, lng: 78.38, accuracy: 10 },
    { id: "b", at: at(5), lat: 19.9, lng: 78.38, accuracy: 10 },
  ]);
  assert.equal(tr.gaps.length, 1);
});
check("unplaced (0,0) and very coarse fixes never join a line", () => {
  const tr = buildTrack([
    { id: "a", at: at(0), lat: 17.44, lng: 78.38, accuracy: 10 },
    { id: "z", at: at(2), lat: 0, lng: 0, accuracy: null },
    { id: "c", at: at(3), lat: 17.5, lng: 78.5, accuracy: 5000 },
    { id: "b", at: at(4), lat: 17.441, lng: 78.381, accuracy: 10 },
  ]);
  assert.deepEqual(tr.segments, [["a", "b"]]);
});
check("points given out of order are put in time order", () => {
  const tr = buildTrack([
    { id: "b", at: at(5), lat: 17.441, lng: 78.381, accuracy: 10 },
    { id: "a", at: at(0), lat: 17.44, lng: 78.38, accuracy: 10 },
  ]);
  assert.deepEqual(tr.segments, [["a", "b"]]);
});
check("distance is right to a few metres (1 km north)", () => assert.ok(Math.abs(metres(17.44, 78.38, 17.44 + 1 / 111.2, 78.38) - 1000) < 10));

/* ── pairing and tokens ── */
check("pairing codes are 8 characters from the look-alike-free alphabet", () => {
  for (let i = 0; i < 200; i++) {
    const c = newPairingCode();
    assert.equal(c.length, 8);
    assert.ok([...c].every((ch) => PAIRING_ALPHABET.includes(ch)));
  }
});
check("typed codes are normalised; wrong ones refused", () => {
  assert.equal(normalizePairingCode(" abcd-efgh "), "ABCDEFGH");
  assert.equal(normalizePairingCode("ABCD EFG2"), "ABCDEFG2");
  assert.equal(normalizePairingCode("ABCDEFG0"), null); // 0 is not in the alphabet
  assert.equal(normalizePairingCode("ABC"), null);
  assert.equal(formatPairingCode("ABCDEFGH"), "ABCD-EFGH");
});
check("a code's stored hash is peppered and stable", () => {
  assert.equal(hashPairingCode("ABCDEFGH"), hashPairingCode("ABCDEFGH"));
  assert.notEqual(hashPairingCode("ABCDEFGH"), hashPairingCode("ABCDEFGJ"));
});
check("device tokens are long, prefixed, unique; only a hash is compared", () => {
  const a = newDeviceToken();
  const b = newDeviceToken();
  assert.ok(a.startsWith("odt_") && a.length >= 40 && a !== b);
  assert.equal(hashDeviceToken(a).length, 64);
});

/* ── upload rules ── */
const p = (patch: Record<string, unknown>) => ({ clientId: "abcdefgh", lat: 17.44, lng: 78.38, recordedAt: now.toISOString(), accuracy: 12, ...patch }) as Parameters<typeof rejectReason>[0];
check("a normal fix is accepted", () => assert.equal(rejectReason(p({}), now), null));
check("out-of-range and (0,0) coordinates are rejected", () => {
  assert.equal(rejectReason(p({ lat: 91 }), now), "BAD_COORDINATES");
  assert.equal(rejectReason(p({ lng: -181 }), now), "BAD_COORDINATES");
  assert.equal(rejectReason(p({ lat: 0, lng: 0 }), now), "BAD_COORDINATES");
});
check("a time from the future (beyond 10 min) is rejected, never corrected", () => assert.equal(rejectReason(p({ recordedAt: new Date(now.getTime() + 11 * 60_000).toISOString() }), now), "FUTURE_TIME"));
check("a fix older than 30 days is rejected", () => assert.equal(rejectReason(p({ recordedAt: new Date(now.getTime() - 31 * 86400_000).toISOString() }), now), "TOO_OLD"));
check("garbage time and negative accuracy are rejected", () => {
  assert.equal(rejectReason(p({ recordedAt: "yesterday" }), now), "BAD_TIME");
  assert.equal(rejectReason(p({ accuracy: -1 }), now), "BAD_ACCURACY");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
