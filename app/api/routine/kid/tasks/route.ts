import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePerson, route } from "@/lib/session";
import { kidTaskCreateSchema, parseBody } from "@/lib/validation";
import { TASK_SELECT, dayKeyToDate, serializeTask, todayKey } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 2026-09-25: the person adds their OWN extra for today — always dated today,
    tagged addedBy "PERSON" so the parent sees whose it is, and only the person
    can remove it (DELETE on ./[id]). A title is all it takes. */
export const POST = route(async (req: Request) => {
  const user = await requirePerson();
  const person = await prisma.person.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = await parseBody(req, kidTaskCreateSchema);
  if (!parsed.ok) return parsed.response;

  const task = await prisma.routineTask.create({
    data: { personId: person.id, title: parsed.data.title, dueDate: dayKeyToDate(todayKey()), addedBy: "PERSON" },
    select: TASK_SELECT,
  });
  return NextResponse.json(serializeTask(task), { status: 201 });
});
