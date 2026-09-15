import { NextResponse } from "next/server";
import { HttpError, route } from "@/lib/session";
import { raiseRepeatsDue } from "@/lib/work/repeats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Repeating tasks (owner, 2026-09-15). Vercel Cron hits this once a day — see
 * vercel.json — and it raises the next one for every task whose repeat has come
 * round. NOT publicly triggerable: it demands the CRON_SECRET Vercel sends as
 * `Authorization: Bearer <secret>` and 401s anything else, exactly like the
 * snooze-wake job beside it.
 *
 * Safe to run twice: a task is only followed when nothing already points back
 * at it, so a second tick in the same day raises nothing.
 */
export const GET = route(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    throw new HttpError(401, "Unauthorized");
  }
  const { raised, skipped } = await raiseRepeatsDue();
  return NextResponse.json({ ok: true, raised, skipped });
});
