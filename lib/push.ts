import webpush from "web-push";
import { prisma } from "@/lib/prisma";

/**
 * Server-side Web Push. Signs with the app's VAPID keys and delivers to a
 * user's saved browser subscriptions.
 *
 * This is fire-and-forget from a request's point of view: it NEVER throws into
 * a caller. A missing VAPID config, a dead subscription, or a push-service
 * hiccup is logged and swallowed, so a notification failing can never fail the
 * action that triggered it. A subscription the service reports as gone
 * (404/410) is deleted — standard cleanup so a stale endpoint is not retried
 * forever.
 */

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
};

let configured: boolean | null = null;

/** Set VAPID details once. Returns false (and logs once) if env is incomplete. */
function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    console.warn("[push] VAPID env not set (VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT) — push disabled");
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/** True when the server can sign pushes — used by endpoints to fail loudly on a test. */
export function pushConfigured(): boolean {
  return ensureConfigured();
}

export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number; removed: number }> {
  const result = { sent: 0, failed: 0, removed: 0 };
  if (!ensureConfigured() || userIds.length === 0) return result;

  const subs = await prisma.pushSubscription
    .findMany({ where: { userId: { in: userIds } } })
    .catch(() => []);
  const data = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data,
        );
        result.sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
          result.removed++;
        } else {
          result.failed++;
          console.error("[push] send failed:", status ?? "?", (err as Error).message);
        }
      }
    }),
  );

  return result;
}
