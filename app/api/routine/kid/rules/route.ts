import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePerson, route } from "@/lib/session";
import { kidRuleCreateSchema, parseBody } from "@/lib/validation";
import { appendOrderKey } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 2026-09-25: the person sets a rule of their OWN — a line they hold themself to.
    Tagged addedBy "PERSON" so the parent sees whose it is; only the person removes
    it (DELETE on ./[id]). Crossings are logged by the parent, as for every rule. */
export const POST = route(async (req: Request) => {
  const user = await requirePerson();
  const person = await prisma.person.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = await parseBody(req, kidRuleCreateSchema);
  if (!parsed.ok) return parsed.response;

  const siblings = await prisma.nonNegotiable.findMany({ where: { personId: person.id }, select: { orderKey: true } });
  const rule = await prisma.nonNegotiable.create({
    data: { personId: person.id, name: parsed.data.name, orderKey: appendOrderKey(siblings.map((s) => s.orderKey)), addedBy: "PERSON" },
    select: { id: true, name: true, addedBy: true },
  });
  return NextResponse.json({ id: rule.id, name: rule.name, days: {}, addedBy: "PERSON" }, { status: 201 });
});
