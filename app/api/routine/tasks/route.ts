import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { parseBody, routineTaskCreateSchema } from "@/lib/validation";
import { dayKeyToDate, personParam, requireRoutineAccess, serializeTask } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The manager assigns a task the person will check off (title + optional day). */
export const POST = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });

  const parsed = await parseBody(req, routineTaskCreateSchema);
  if (!parsed.ok) return parsed.response;
  const { title, dueDate } = parsed.data;

  const task = await prisma.routineTask.create({
    data: { personId: person.id, title, dueDate: dueDate ? dayKeyToDate(dueDate) : null },
    select: { id: true, title: true, dueDate: true, done: true, doneAt: true },
  });
  return NextResponse.json(serializeTask(task), { status: 201 });
});
