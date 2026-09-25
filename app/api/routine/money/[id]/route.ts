import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { personParam, requireRoutineAccess } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** The parent side removes any ledger line of this person — theirs or the
    person's own (a write; read-only co-parents cannot). Not this person's -> 404. */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });

  const entry = await prisma.moneyEntry.findFirst({ where: { id: params.id, personId: person.id }, select: { id: true } });
  if (!entry) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await prisma.moneyEntry.delete({ where: { id: entry.id } });
  return NextResponse.json({ ok: true });
});
