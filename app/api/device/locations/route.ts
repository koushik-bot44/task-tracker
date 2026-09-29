import { NextResponse } from "next/server";
import { route } from "@/lib/session";
import { deviceLocationsSchema, parseBody } from "@/lib/validation";
import { requireDevice } from "@/lib/device-auth";
import { DEVICE_CONFIG, ingestPoints, pendingLocateFor } from "@/lib/device-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * D2 — the phone uploads what it queued (1–200 fixes). Idempotent: a fix whose
 * clientId is already stored for this phone is counted as a duplicate and
 * ignored, so a retried upload never doubles. Each bad fix is rejected with a
 * reason and never altered. The answer carries any Locate Now still waiting.
 */
export const POST = route(async (req: Request) => {
  const device = await requireDevice(req);
  const parsed = await parseBody(req, deviceLocationsSchema);
  if (!parsed.ok) return parsed.response;
  const result = await ingestPoints(device, parsed.data.points);
  return NextResponse.json({ ...result, locateRequests: await pendingLocateFor(device.id), config: DEVICE_CONFIG });
});
