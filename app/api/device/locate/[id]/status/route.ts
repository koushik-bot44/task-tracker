import { NextResponse } from "next/server";
import { route } from "@/lib/session";
import { deviceLocateStatusSchema, parseBody } from "@/lib/validation";
import { requireDevice } from "@/lib/device-auth";
import { recordLocateStatus } from "@/lib/device-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** D4 — the phone acknowledges a Locate Now (DELIVERED) or says why it cannot
    answer (FAILED + reason). Only its own requests; a settled one stays settled. */
export const POST = route(async (req: Request, { params }: Params) => {
  const device = await requireDevice(req);
  const parsed = await parseBody(req, deviceLocateStatusSchema);
  if (!parsed.ok) return parsed.response;
  await recordLocateStatus(device, params.id, parsed.data);
  return NextResponse.json({ ok: true });
});
