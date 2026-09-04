import { NextResponse } from "next/server";
import { HttpError, route } from "@/lib/session";
import { sendTomorrow } from "@/lib/tomorrow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Message (b), the evening before. Vercel Cron hits this at 18:00 IST (see
 * vercel.json: 12:30 UTC). NOT publicly triggerable: it demands the CRON_SECRET
 * Vercel sends as `Authorization: Bearer <secret>` and 401s anything else.
 * Idempotent per person per day (the message dedupes on EmailLog/WhatsAppLog).
 *
 * `?now=<ISO>` lets the rig pretend it is another evening (only with the secret).
 */
export const GET = route(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    throw new HttpError(401, "Unauthorized");
  }
  const nowParam = new URL(req.url).searchParams.get("now");
  const now = nowParam ? new Date(nowParam) : new Date();
  if (Number.isNaN(now.getTime())) throw new HttpError(400, "now is not a date");
  const result = await sendTomorrow(now);
  return NextResponse.json({ ok: true, ...result });
});
