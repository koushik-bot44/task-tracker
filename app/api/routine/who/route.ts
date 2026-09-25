import { NextResponse } from "next/server";
import { requireWalled, route } from "@/lib/session";
import type { WhoDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 2026-09-25 (the circle): which walled screen to show. Every login around the
 * tracked person carries the PERSON role; this says WHICH one signed in — the
 * person himself (/person), a co-parent (/family) or a tutor (/mentor) — so the
 * shell can send them to the right place. Anyone else is refused.
 */
export const GET = route(async () => {
  const { user, kind } = await requireWalled();
  return NextResponse.json({ kind, name: user.name } satisfies WhoDTO);
});
