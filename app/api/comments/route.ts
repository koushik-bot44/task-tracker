import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertCanSeeTarget } from "@/lib/comments";
import { COMMENT_INCLUDE, DEPARTED_AUTHOR, serializeComment } from "@/lib/serialize";
import { requireUser, route } from "@/lib/session";
import type { CommentDTO } from "@/lib/types";
import { isStaffOnTask } from "@/lib/work/access";
import { addNote, listActivity, type ActivityRow } from "@/lib/work/activity";
import { emit } from "@/lib/work/events";
import { requireSee } from "@/lib/work/tasks";
import { commentTargetSchema, createCommentSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Work model: a TASK's notes live in its activity stream now. This route keeps
 * the old thread shape for the project and milestone threads, and for the task
 * drawer until it reads /api/tasks/:id/activity directly — a task note here is
 * a public note there.
 */
function activityAsComment(a: ActivityRow): CommentDTO {
  return {
    id: a.id,
    targetType: "TASK",
    targetId: a.taskId,
    body: a.body,
    attachmentUrl: a.attachmentUrl,
    attachmentName: a.attachmentName,
    attachmentType: a.attachmentType,
    createdAt: a.createdAt.toISOString(),
    author: a.author ?? DEPARTED_AUTHOR,
  };
}

/** Oldest first — a thread reads top to bottom. */
export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;
  const type = commentTargetSchema.safeParse(params.get("targetType"));
  const targetId = params.get("targetId");
  if (!type.success || !targetId) return NextResponse.json({ error: "targetType and targetId are required" }, { status: 400 });
  if (type.data === "TASK") {
    const { scope, root } = await requireSee(user, targetId);
    const staff = await isStaffOnTask(user, root, scope);
    const rows = await listActivity(targetId, { staff, types: ["COMMENT", "WORK_NOTE", "ATTACHMENT"], order: "asc" });
    return NextResponse.json(rows.map(activityAsComment));
  }
  await assertCanSeeTarget(user, type.data, targetId);
  const rows = await prisma.comment.findMany({
    where: { targetType: type.data, targetId },
    orderBy: { createdAt: "asc" },
    include: COMMENT_INCLUDE,
  });
  return NextResponse.json(rows.map(serializeComment));
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const parsed = await parseBody(req, createCommentSchema);
  if (!parsed.ok) return parsed.response;
  const { targetType, targetId, body, attachmentUrl, attachmentName, attachmentType } = parsed.data;
  if (targetType === "TASK") {
    await requireSee(user, targetId);
    const row = await addNote(targetId, user.id, { body, internal: false, attachmentUrl, attachmentName, attachmentType });
    const task = await prisma.task.findUnique({ where: { id: targetId } });
    if (task) await emit({ type: "COMMENT_ADDED", task, actor: { id: user.id, name: user.name }, activityId: row.id, payload: { body } });
    return NextResponse.json(activityAsComment(row), { status: 201 });
  }
  await assertCanSeeTarget(user, targetType, targetId);
  const row = await prisma.comment.create({
    data: {
      targetType,
      targetId,
      authorId: user.id,
      body,
      attachmentUrl: attachmentUrl ?? null,
      attachmentName: attachmentName ?? null,
      attachmentType: attachmentType ?? null,
    },
    include: COMMENT_INCLUDE,
  });
  return NextResponse.json(serializeComment(row), { status: 201 });
});
