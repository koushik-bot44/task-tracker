import { NextResponse } from "next/server";
import { requireManager, route } from "@/lib/session";
import { personParam, requireRoutineAccess } from "@/lib/routine";
import { buildLatest } from "@/lib/device-service";
import { auditLocationView } from "@/lib/location-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** P4 — where the child's phone was last, how fresh that is by the phone's own
    clock, the phone's state and issues, and any Locate Now under way. */
export const GET = route(async (req: Request) => {
  const actor = await requireManager();
  const { person, role } = await requireRoutineAccess(actor.id, personParam(req));
  await auditLocationView(person.id, actor.id, "VIEW_LATEST");
  return NextResponse.json(await buildLatest(person.id, role !== "READ_ONLY"));
});
