import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePerson, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** The person removes a rule they set themself. A parent's rule is not theirs to remove. */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const user = await requirePerson();
  const person = await prisma.person.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rule = await prisma.nonNegotiable.findFirst({ where: { id: params.id, personId: person.id }, select: { id: true, addedBy: true } });
  if (!rule) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (rule.addedBy !== "PERSON") return NextResponse.json({ error: "Only the person who set this can remove it." }, { status: 403 });
  await prisma.nonNegotiable.delete({ where: { id: rule.id } });
  return NextResponse.json({ ok: true });
});
