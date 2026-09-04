import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertCanSeeTarget } from "@/lib/comments";
import { COMMENT_INCLUDE, serializeComment } from "@/lib/serialize";
import { requireUser, route } from "@/lib/session";
import { commentTargetSchema, createCommentSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Oldest first — a thread reads top to bottom. */
export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;
  const type = commentTargetSchema.safeParse(params.get("targetType"));
  const targetId = params.get("targetId");
  if (!type.success || !targetId) return NextResponse.json({ error: "targetType and targetId are required" }, { status: 400 });
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
