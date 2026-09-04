import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePerson, route } from "@/lib/session";
import { badRequest, nonNegotiableDoneSchema, parseBody } from "@/lib/validation";
import { dayKeyToDate, requireOwnNonNegotiable, todayKey } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The person marks THEIR OWN non-negotiable DONE for a day (phase 42). requirePerson,
 * then the rule must belong to the Person linked to this login (else 404), the date
 * may not be in the future, and the day must be one the MANAGER SCHEDULED (a mark row
 * must already exist) — the person can only set `done`, never add or remove a day.
 *
 * MARK-ONLY: no rule create/rename/remove/schedule, no habit/weight/task-structure
 * write is reachable here. It only flips `done` on an existing scheduled row.
 */
export const POST = route(async (req: Request) => {
  const user = await requirePerson();
  const person = await prisma.person.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = await parseBody(req, nonNegotiableDoneSchema);
  if (!parsed.ok) return parsed.response;
  const { nonNegotiableId, date, done } = parsed.data;

  // Own-rule-only (mark another person's rule -> 404), scoped to THIS caller's person.
  await requireOwnNonNegotiable(person.id, nonNegotiableId);

  // The person can only mark days up to today (no pre-marking the future).
  if (date > todayKey()) {
    return badRequest([{ path: ["date"], message: "Can't mark a future day." }]);
  }

  const day = dayKeyToDate(date);
  // The day must be one the manager scheduled — the person can't create/remove days.
  const existing = await prisma.nonNegotiableMark.findUnique({
    where: { nonNegotiableId_date: { nonNegotiableId, date: day } },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "That day isn't set for this rule." }, { status: 404 });
  }
  await prisma.nonNegotiableMark.update({
    where: { nonNegotiableId_date: { nonNegotiableId, date: day } },
    data: { done },
  });
  return NextResponse.json({ ok: true, done });
});
