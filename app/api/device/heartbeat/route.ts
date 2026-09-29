import { NextResponse } from "next/server";
import { route } from "@/lib/session";
import { deviceHeartbeatSchema, parseBody } from "@/lib/validation";
import { requireDevice } from "@/lib/device-auth";
import { DEVICE_CONFIG, applyHeartbeat, pendingLocateFor } from "@/lib/device-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * D3 — the phone reports its own state: permission, location switch, whether
 * sharing is running, battery, network, push address, queue size, boot and
 * shutdown. A change the parents must know (permission off, location off,
 * switched off) notifies them once. The answer carries pending Locate Now
 * requests, so Locate Now works even where instant push is not set up.
 */
export const POST = route(async (req: Request) => {
  const device = await requireDevice(req);
  const parsed = await parseBody(req, deviceHeartbeatSchema);
  if (!parsed.ok) return parsed.response;
  await applyHeartbeat(device, parsed.data);
  return NextResponse.json({ serverTime: new Date().toISOString(), locateRequests: await pendingLocateFor(device.id), config: DEVICE_CONFIG });
});
