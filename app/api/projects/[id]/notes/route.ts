import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeProjectNote } from "@/lib/serialize";
import { requireUser, route } from "@/lib/session";
import { createProjectNoteSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const AUTHOR_SELECT = {
  author: { select: { id: true, name: true, role: true } },
} as const;

/**
 * The tool-level thread behind "About & requirements".
 *
 * Same rules as TaskNote deliberately: anyone signed in may post, only the
 * author may delete. Requirements get argued about by whoever is doing the
 * work, and a thread only a manager can contribute to is a memo.
 */
export const GET = route(async (_req: Request, { params }: Params) => {
  await requireUser();

  const notes = await prisma.projectNote.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: "asc" },
    include: AUTHOR_SELECT,
  });

  return NextResponse.json(notes.map(serializeProjectNote));
});

export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();

  const parsed = await parseBody(req, createProjectNoteSchema);
  if (!parsed.ok) return parsed.response;

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const note = await prisma.projectNote.create({
    data: { projectId: params.id, authorId: user.id, body: parsed.data.body },
    include: AUTHOR_SELECT,
  });

  return NextResponse.json(serializeProjectNote(note), { status: 201 });
});
