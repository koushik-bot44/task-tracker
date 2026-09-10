import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";
import { releaseFiles } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * Your own notes — and the CEO can delete anyone's (owner, 2026-09-08). A task
 * note is an activity row. Its files go with it (2026-09-10), unless something
 * else still shows them; a file that can't be let go now is swept the next day.
 */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  const note = await prisma.comment.findUnique({ where: { id: params.id }, select: { id: true, authorId: true, attachmentUrl: true, attachments: { select: { url: true } } } });
  if (note) {
    if (note.authorId !== user.id && user.role !== "FOUNDER") throw new HttpError(403, "You can only delete your own notes.");
    await prisma.comment.delete({ where: { id: params.id } });
    await releaseFiles([note.attachmentUrl, ...note.attachments.map((a) => a.url)]).catch((error) => console.error("[notes] files not let go:", error));
    return NextResponse.json({ ok: true });
  }
  const activity = await prisma.taskActivity.findUnique({ where: { id: params.id }, select: { id: true, authorId: true, type: true, attachmentUrl: true, attachments: { select: { url: true } } } });
  if (!activity || !["COMMENT", "WORK_NOTE", "ATTACHMENT"].includes(activity.type)) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  if (activity.authorId !== user.id && user.role !== "FOUNDER") throw new HttpError(403, "You can only delete your own notes.");
  await prisma.taskActivity.delete({ where: { id: params.id } });
  await releaseFiles([activity.attachmentUrl, ...activity.attachments.map((a) => a.url)]).catch((error) => console.error("[notes] files not let go:", error));
  return NextResponse.json({ ok: true });
});
