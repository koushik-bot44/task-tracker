import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * Author-only, mirroring TaskNote exactly — including for managers. A manager
 * can overrule work; editing the record of what somebody said is a different
 * power and this tool still does not grant it.
 */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();

  const note = await prisma.projectNote.findUnique({
    where: { id: params.id },
    select: { id: true, authorId: true },
  });
  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  if (note.authorId !== user.id) {
    throw new HttpError(403, "You can only delete your own notes.");
  }

  await prisma.projectNote.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
