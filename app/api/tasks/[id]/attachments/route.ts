import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";
import { addNote, serializeActivity } from "@/lib/work/activity";
import { emit } from "@/lib/work/events";
import { requireSee } from "@/lib/work/tasks";
import { noteSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** A file on the task (upload it to /api/uploads first). Optional words go with it. */
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const parsed = await parseBody(req, noteSchema);
  if (!parsed.ok) return parsed.response;
  if (!parsed.data.attachmentUrl) throw new HttpError(400, "Attach a file.");
  await requireSee(user, params.id);
  const row = await addNote(params.id, user.id, { ...parsed.data, internal: false, mentions: [] });
  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (task) await emit({ type: "COMMENT_ADDED", task, actor: { id: user.id, name: user.name }, activityId: row.id, payload: { body: parsed.data.body || parsed.data.attachmentName || "a file" } });
  return NextResponse.json(serializeActivity(row), { status: 201 });
});
