import { NextResponse } from "next/server";
import { HttpError, route } from "@/lib/session";
import { runLocationHousekeeping } from "@/lib/device-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily location housekeeping (2026-09-29): retention purge, expired Locate
    Now requests, old codes and log rows, silent-phone alerts. CRON_SECRET only;
    also run from the existing daily snooze-wake cron. `?now=<ISO>` for the rig. */
export const GET = route(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized");
  const nowParam = new URL(req.url).searchParams.get("now");
  const now = nowParam ? new Date(nowParam) : new Date();
  if (Number.isNaN(now.getTime())) throw new HttpError(400, "now is not a date");
  return NextResponse.json({ ok: true, ...(await runLocationHousekeeping(now)) });
});
