import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";
import { isStaffOnTask } from "@/lib/work/access";
import { addNote, serializeActivity } from "@/lib/work/activity";
import { emit } from "@/lib/work/events";
import { requireSee } from "@/lib/work/tasks";
import { noteSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** A team note: only the people working the task read it. */
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const parsed = await parseBody(req, noteSchema);
  if (!parsed.ok) return parsed.response;
  const { scope, root } = await requireSee(user, params.id);
  if (!(await isStaffOnTask(user, root, scope))) throw new HttpError(403, "Team notes are for the people working this task.");
  const mentions = parsed.data.mentions?.length
    ? (await prisma.user.findMany({ where: { id: { in: parsed.data.mentions }, disabledAt: null, status: "ACTIVE", role: { notIn: ["PERSON", "ADMIN"] } }, select: { id: true } })).map((u) => u.id)
    : [];
  const row = await addNote(params.id, user.id, { ...parsed.data, internal: true, mentions });
  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (task) await emit({ type: "WORK_NOTE_ADDED", task, actor: { id: user.id, name: user.name }, activityId: row.id, payload: { body: parsed.data.body, mentions } });
  return NextResponse.json(serializeActivity(row), { status: 201 });
});
