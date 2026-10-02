import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError, requirePerson, route } from "@/lib/session";
import { dateToKey, dayKeyToDate, todayKey } from "@/lib/routine";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ weightKg: z.number().positive().max(500) });

/**
 * The child adds this week's weight from their own Today (owner, 2026-10-02: a
 * reminder card until it is in). Recorded for today, in the same log the parent's
 * weight chart reads; their own person only.
 */
export const POST = route(async (req: Request) => {
  const user = await requirePerson();
  const person = await prisma.person.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!person) throw new HttpError(404, "Not found");
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const entry = await prisma.weightEntry.create({
    data: { personId: person.id, date: dayKeyToDate(todayKey()), weightKg: parsed.data.weightKg },
    select: { date: true, weightKg: true },
  });
  return NextResponse.json({ date: dateToKey(entry.date), weightKg: entry.weightKg }, { status: 201 });
});
