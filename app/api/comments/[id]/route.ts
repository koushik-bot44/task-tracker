import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Author-only, deliberately including the founder: editing the record of what someone said is not a power this tool grants. */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  const note = await prisma.comment.findUnique({ where: { id: params.id }, select: { id: true, authorId: true } });
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  if (note.authorId !== user.id) throw new HttpError(403, "You can only delete your own notes.");
  await prisma.comment.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
