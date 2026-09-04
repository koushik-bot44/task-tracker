import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePerson, route } from "@/lib/session";
import { parseBody, routineTaskDoneSchema } from "@/lib/validation";
import { serializeTask } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** The ONE thing a person writes: checking their own task done/undone. Scoped to
    the person's own tasks — another person's task is a 404. */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const user = await requirePerson();
  const person = await prisma.person.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const task = await prisma.routineTask.findFirst({ where: { id: params.id, personId: person.id }, select: { id: true } });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const parsed = await parseBody(req, routineTaskDoneSchema);
  if (!parsed.ok) return parsed.response;
  const { done } = parsed.data;

  const updated = await prisma.routineTask.update({
    where: { id: params.id },
    data: { done, doneAt: done ? new Date() : null },
    select: { id: true, title: true, dueDate: true, done: true, doneAt: true },
  });
  return NextResponse.json(serializeTask(updated));
});
