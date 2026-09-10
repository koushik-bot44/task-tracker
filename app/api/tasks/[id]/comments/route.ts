import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import { addNote, serializeActivity } from "@/lib/work/activity";
import { emit } from "@/lib/work/events";
import { requireSee } from "@/lib/work/tasks";
import { noteSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** A note everyone on the task reads, the one who asked included. */
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const parsed = await parseBody(req, noteSchema);
  if (!parsed.ok) return parsed.response;
  await requireSee(user, params.id);
  const mentions = parsed.data.mentions?.length
    ? (await prisma.user.findMany({ where: { id: { in: parsed.data.mentions }, disabledAt: null, status: "ACTIVE", role: { notIn: ["PERSON", "ADMIN"] } }, select: { id: true } })).map((u) => u.id)
    : [];
  const row = await addNote(params.id, user.id, { ...parsed.data, internal: false, mentions });
  const task = await prisma.task.findUnique({ where: { id: params.id } });
  // A note that is only a file still says what arrived, rather than an empty message.
  const said = parsed.data.body.trim() ? parsed.data.body : `Attached ${parsed.data.attachmentName ?? "a file"}`;
  if (task) await emit({ type: "COMMENT_ADDED", task, actor: { id: user.id, name: user.name }, activityId: row.id, payload: { body: said, mentions } });
  return NextResponse.json(serializeActivity(row), { status: 201 });
});
