import { NextResponse } from "next/server";
import { noteFilesFrom, noteSaid } from "@/lib/note-files";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";
import { addNote, serializeActivity } from "@/lib/work/activity";
import { emit } from "@/lib/work/events";
import { requireSee } from "@/lib/work/tasks";
import { noteSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Files on the task (upload them to /api/uploads first), one or several. Optional words go with them. */
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const parsed = await parseBody(req, noteSchema);
  if (!parsed.ok) return parsed.response;
  const files = noteFilesFrom(parsed.data);
  if (!files.length) throw new HttpError(400, "Attach a file.");
  await requireSee(user, params.id);
  const row = await addNote(params.id, user.id, { ...parsed.data, internal: false, mentions: [], attachments: files });
  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (task) await emit({ type: "COMMENT_ADDED", task, actor: { id: user.id, name: user.name }, activityId: row.id, payload: { body: noteSaid(parsed.data.body, files) } });
  return NextResponse.json(serializeActivity(row), { status: 201 });
});
