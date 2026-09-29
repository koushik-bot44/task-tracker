import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, requireManager, route } from "@/lib/session";
import { personParam, requireRoutineAccess } from "@/lib/routine";
import { expireLocateRequests, serializeLocate } from "@/lib/device-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** P7 — how a Locate Now is going. Only a request for a child the caller can see. */
export const GET = route(async (req: Request, { params }: Params) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req));
  await expireLocateRequests({ id: params.id, personId: person.id });
  const r = await prisma.locateRequest.findFirst({ where: { id: params.id, personId: person.id } });
  if (!r) throw new HttpError(404, "Not found.");
  return NextResponse.json({ request: await serializeLocate(r) });
});
