import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { parseBody, sharingSchema } from "@/lib/validation";
import { personParam, requireRoutineAccess } from "@/lib/routine";
import { getBaseUrl } from "@/lib/base-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 2026-09-25 (maps): phone sharing, owner only. on=true mints a FRESH secret
    link every time (an old link stops working the moment a new one is made);
    on=false drops it, so anything still posting to the old link gets 404. */
export const POST = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true, ownerOnly: true });

  const parsed = await parseBody(req, sharingSchema);
  if (!parsed.ok) return parsed.response;

  if (!parsed.data.on) {
    await prisma.person.update({ where: { id: person.id }, data: { feedToken: null } });
    return NextResponse.json({ on: false, url: null });
  }

  const token = randomBytes(24).toString("base64url");
  await prisma.person.update({ where: { id: person.id }, data: { feedToken: token } });
  return NextResponse.json({ on: true, url: `${getBaseUrl()}/api/routine/feed/${token}` });
});
