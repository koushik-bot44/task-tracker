import { connect } from "node:http2";
import { SignJWT, importPKCS8 } from "jose";

/**
 * Reaching a child's phone for Locate Now (2026-09-29).
 *
 * Android: Firebase Cloud Messaging HTTP v1, a high-priority DATA message
 * `{type: "LOCATE_NOW", requestId}` the app's messaging service acts on.
 * iOS: APNs, a silent background push (`content-available`), which iOS may
 * delay or drop (Low Power Mode, throttling) — Apple's rule, not ours.
 * Neither configured, or the phone has no push token: the request waits and the
 * phone picks it up at its next check-in (every ~15 min on Android).
 *
 * Credentials come from env only and are never logged. Nothing here throws:
 * the answer says what happened, in words a parent can be shown.
 */

export type PushProvider = "FCM" | "APNS" | "NONE";
export type PushResult = { provider: PushProvider; ok: boolean; detail: string; tokenInvalid?: boolean };
type PushDevice = { platform: string; pushProvider: string | null; pushToken: string | null };

export function fcmConfigured(): boolean {
  return Boolean(process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY);
}
export function apnsConfigured(): boolean {
  return Boolean(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY && process.env.APNS_BUNDLE_ID);
}
/** Can the server reach this phone instantly at all? */
export function pushReadyFor(d: PushDevice): boolean {
  if (!d.pushToken) return false;
  if (d.pushProvider === "FCM") return fcmConfigured();
  if (d.pushProvider === "APNS") return apnsConfigured();
  return false;
}

/** Env values pasted into Vercel often carry "\n" as two characters. */
const pem = (v: string) => v.replace(/\\n/g, "\n");

/* ── FCM HTTP v1 ─────────────────────────────────────────────────────────── */

let fcmToken: { value: string; exp: number } | null = null;

async function fcmAccessToken(): Promise<string> {
  if (fcmToken && fcmToken.exp - 60_000 > Date.now()) return fcmToken.value;
  const key = await importPKCS8(pem(process.env.FCM_PRIVATE_KEY!), "RS256");
  const nowSec = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(process.env.FCM_CLIENT_EMAIL!)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + 3600)
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  fcmToken = { value: body.access_token, exp: Date.now() + body.expires_in * 1000 };
  return fcmToken.value;
}

async function sendFcm(token: string, requestId: string): Promise<PushResult> {
  try {
    const access = await fcmAccessToken();
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${process.env.FCM_PROJECT_ID}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { token, data: { type: "LOCATE_NOW", requestId }, android: { priority: "HIGH", ttl: "300s" } } }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { provider: "FCM", ok: true, detail: "Sent to the phone." };
    const text = await res.text();
    const invalid = res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(text);
    return { provider: "FCM", ok: false, detail: invalid ? "The phone's push address is out of date; it will renew at its next check-in." : `Push service answered ${res.status}.`, tokenInvalid: invalid };
  } catch (e) {
    return { provider: "FCM", ok: false, detail: `Could not reach the push service (${(e as Error).message}).` };
  }
}

/* ── APNs (HTTP/2, token auth) ───────────────────────────────────────────── */

let apnsJwt: { value: string; exp: number } | null = null;

async function apnsToken(): Promise<string> {
  if (apnsJwt && apnsJwt.exp > Date.now()) return apnsJwt.value;
  const key = await importPKCS8(pem(process.env.APNS_PRIVATE_KEY!), "ES256");
  const value = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: process.env.APNS_KEY_ID! })
    .setIssuer(process.env.APNS_TEAM_ID!)
    .setIssuedAt()
    .sign(key);
  apnsJwt = { value, exp: Date.now() + 45 * 60_000 }; // Apple wants a fresh one within the hour
  return value;
}

async function sendApns(token: string, requestId: string): Promise<PushResult> {
  try {
    const jwt = await apnsToken();
    const host = process.env.APNS_ENVIRONMENT === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
    const payload = JSON.stringify({ aps: { "content-available": 1 }, type: "LOCATE_NOW", requestId });
    const status = await new Promise<{ code: number; body: string }>((resolve, reject) => {
      const client = connect(host);
      const timer = setTimeout(() => { client.destroy(); reject(new Error("timeout")); }, 8000);
      client.on("error", (err) => { clearTimeout(timer); reject(err); });
      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${token}`,
        authorization: `bearer ${jwt}`,
        "apns-topic": process.env.APNS_BUNDLE_ID!,
        "apns-push-type": "background",
        "apns-priority": "5",
        "apns-expiration": String(Math.floor(Date.now() / 1000) + 300),
        "content-type": "application/json",
      });
      let code = 0;
      let body = "";
      req.on("response", (h) => { code = Number(h[":status"]); });
      req.setEncoding("utf8");
      req.on("data", (c) => { body += c; });
      req.on("end", () => { clearTimeout(timer); client.close(); resolve({ code, body }); });
      req.on("error", (err) => { clearTimeout(timer); client.close(); reject(err); });
      req.end(payload);
    });
    if (status.code === 200) return { provider: "APNS", ok: true, detail: "Sent to the phone (iOS may hold it for a while)." };
    const invalid = status.code === 410 || /BadDeviceToken|Unregistered/.test(status.body);
    return { provider: "APNS", ok: false, detail: invalid ? "The phone's push address is out of date; it will renew at its next check-in." : `Apple's push service answered ${status.code}.`, tokenInvalid: invalid };
  } catch (e) {
    return { provider: "APNS", ok: false, detail: `Could not reach Apple's push service (${(e as Error).message}).` };
  }
}

/** Ask the phone for a fresh position right now, if the server can reach it. */
export async function sendLocateNowPush(device: PushDevice, requestId: string): Promise<PushResult> {
  if (!device.pushToken) return { provider: "NONE", ok: false, detail: "The phone has no push address yet; it will pick this up at its next check-in." };
  if (device.pushProvider === "FCM") {
    if (!fcmConfigured()) return { provider: "NONE", ok: false, detail: "Instant delivery to Android is not set up on the server; the phone will pick this up at its next check-in." };
    return sendFcm(device.pushToken, requestId);
  }
  if (device.pushProvider === "APNS") {
    if (!apnsConfigured()) return { provider: "NONE", ok: false, detail: "Instant delivery to iPhone is not set up on the server; the phone will pick this up at its next wake-up." };
    return sendApns(device.pushToken, requestId);
  }
  return { provider: "NONE", ok: false, detail: "The phone will pick this up at its next check-in." };
}
