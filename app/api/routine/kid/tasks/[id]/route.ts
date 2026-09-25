import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePerson, route } from "@/lib/session";
import { parseBody, routineTaskDoneSchema } from "@/lib/validation";
import { TASK_SELECT, serializeTask } from "@/lib/routine";

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
    select: TASK_SELECT,
  });
  return NextResponse.json(serializeTask(updated));
});

/** 2026-09-25: the person removes one of their OWN extras. A task the parent set
    stays — only the side that set a task can take it away (403); another
    person's task is a 404 as before. */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requirePerson();
  const person = await prisma.person.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const task = await prisma.routineTask.findFirst({ where: { id: params.id, personId: person.id }, select: { id: true, addedBy: true } });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (task.addedBy !== "PERSON") {
    return NextResponse.json({ error: "Only the person who set this can remove it." }, { status: 403 });
  }

  await prisma.routineTask.delete({ where: { id: task.id } });
  return NextResponse.json({ ok: true });
});
