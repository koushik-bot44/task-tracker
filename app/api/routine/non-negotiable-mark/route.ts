import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { nonNegotiableRequireSchema, parseBody } from "@/lib/validation";
import { dayKeyToDate, requireOwnNonNegotiable, personParam, requireRoutineAccess } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Phase 42: the MANAGER schedules whether a rule is required on a day. required=true
    creates the day (the person can then mark it done); required=false removes it
    (deleting any done mark). Scoped to the accessible routine (404 otherwise). The
    manager sets days only — the PERSON marks done via the kid endpoint. */
export const PATCH = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });

  const parsed = await parseBody(req, nonNegotiableRequireSchema);
  if (!parsed.ok) return parsed.response;
  const { nonNegotiableId, date, required } = parsed.data;
  await requireOwnNonNegotiable(person.id, nonNegotiableId);
  const day = dayKeyToDate(date);

  if (!required) {
    await prisma.nonNegotiableMark.deleteMany({ where: { nonNegotiableId, date: day } });
    return NextResponse.json({ ok: true, required: false });
  }
  // Adding a required day never clobbers an existing done mark (update is a no-op).
  await prisma.nonNegotiableMark.upsert({
    where: { nonNegotiableId_date: { nonNegotiableId, date: day } },
    create: { nonNegotiableId, date: day, done: false },
    update: {},
  });
  return NextResponse.json({ ok: true, required: true });
});
