import { NextResponse } from "next/server";
import { noteFilesFrom, noteSaid } from "@/lib/note-files";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import { addNote, serializeActivity } from "@/lib/work/activity";
import { emit } from "@/lib/work/events";
import { requireSee } from "@/lib/work/tasks";
import { noteSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** A note everyone on the task reads, the one who asked included — with any number of files (2026-09-10). */
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const parsed = await parseBody(req, noteSchema);
  if (!parsed.ok) return parsed.response;
  await requireSee(user, params.id);
  const mentions = parsed.data.mentions?.length
    ? (await prisma.user.findMany({ where: { id: { in: parsed.data.mentions }, disabledAt: null, status: "ACTIVE", role: { notIn: ["PERSON", "ADMIN"] } }, select: { id: true } })).map((u) => u.id)
    : [];
  const files = noteFilesFrom(parsed.data);
  const row = await addNote(params.id, user.id, { ...parsed.data, internal: false, mentions, attachments: files });
  const task = await prisma.task.findUnique({ where: { id: params.id } });
  // A note that is only files still says what arrived, rather than an empty message.
  if (task) await emit({ type: "COMMENT_ADDED", task, actor: { id: user.id, name: user.name }, activityId: row.id, payload: { body: noteSaid(parsed.data.body, files), mentions } });
  return NextResponse.json(serializeActivity(row), { status: 201 });
});
