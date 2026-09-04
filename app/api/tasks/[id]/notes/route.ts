import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canAccessTask } from "@/lib/project-visibility";
import { requireUser, route } from "@/lib/session";
import { parseBody } from "@/lib/validation";
import type { NoteDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const createSchema = z.object({ body: z.string().trim().min(1).max(4000) });

const AUTHOR_SELECT = {
  author: { select: { id: true, name: true, role: true } },
} as const;

function serializeNote(note: {
  id: string;
  taskId: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string; role: NoteDTO["author"]["role"] };
}): NoteDTO {
  return {
    id: note.id,
    taskId: note.taskId,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
    author: note.author,
  };
}

const ACCESS_SELECT = { isPrivate: true, ownerId: true, projectId: true } as const;

/** Oldest first — a thread reads top to bottom. */
export const GET = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();

  // Same door as the task itself: no reading the thread of a project you can't
  // see, or of anyone else's PRIVATE task. The 404 discloses neither.
  const task = await prisma.task.findFirst({
    where: { id: params.id, deletedAt: null },
    select: ACCESS_SELECT,
  });
  if (!task || !(await canAccessTask(user, task))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const notes = await prisma.taskNote.findMany({
    where: { taskId: params.id },
    orderBy: { createdAt: "asc" },
    include: AUTHOR_SELECT,
  });

  return NextResponse.json(notes.map(serializeNote));
});

export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();

  const parsed = await parseBody(req, createSchema);
  if (!parsed.ok) return parsed.response;

  const task = await prisma.task.findFirst({
    where: { id: params.id, deletedAt: null },
    select: ACCESS_SELECT,
  });
  if (!task || !(await canAccessTask(user, task))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const note = await prisma.taskNote.create({
    data: { taskId: params.id, authorId: user.id, body: parsed.data.body },
    include: AUTHOR_SELECT,
  });

  return NextResponse.json(serializeNote(note), { status: 201 });
});
