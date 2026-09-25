import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePerson, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** The person removes a ledger line they wrote themself. A line the parent side
    wrote stays (403); a line that is not theirs at all is a 404. */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requirePerson();
  const person = await prisma.person.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entry = await prisma.moneyEntry.findFirst({ where: { id: params.id, personId: person.id }, select: { id: true, side: true } });
  if (!entry) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (entry.side !== "PERSON") {
    return NextResponse.json({ error: "Only the person who wrote this can remove it." }, { status: 403 });
  }

  await prisma.moneyEntry.delete({ where: { id: entry.id } });
  return NextResponse.json({ ok: true });
});
