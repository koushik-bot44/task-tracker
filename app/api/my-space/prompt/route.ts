import { NextResponse } from "next/server";
import { generateKeyBetween } from "fractional-indexing";
import { prisma } from "@/lib/prisma";
import { TASK_INCLUDE, serializeTask } from "@/lib/serialize";
import { HttpError, requireUser, route } from "@/lib/session";
import { parseBody, promptSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The My notes "Prompt" quick-capture (phase 33) — team members (RESOURCE) only.
 * Turns a blob of free text into a private task in one of the caller's OWN
 * personal projects (first line = title, the rest = notes/descriptionMd).
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  if (user.role !== "RESOURCE") {
    throw new HttpError(403, "The prompt is available to team members only.");
  }

  const parsed = await parseBody(req, promptSchema);
  if (!parsed.ok) return parsed.response;
  const { personalProjectId, text } = parsed.data;

  const pp = await prisma.personalProject.findFirst({ where: { id: personalProjectId, ownerId: user.id }, select: { id: true } });
  if (!pp) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const trimmed = text.trim();
  const nl = trimmed.indexOf("\n");
  const title = (nl === -1 ? trimmed : trimmed.slice(0, nl)).trim().slice(0, 500);
  const descriptionMd = nl === -1 ? "" : trimmed.slice(nl + 1).trim();

  const last = await prisma.task.findFirst({
    where: { ownerId: user.id, isPrivate: true, personalProjectId: pp.id, parentId: null, deletedAt: null },
    orderBy: { orderKey: "desc" },
    select: { orderKey: true },
  });
  const task = await prisma.task.create({
    data: {
      projectId: null,
      isPrivate: true,
      ownerId: user.id,
      personalProjectId: pp.id,
      parentId: null,
      title,
      descriptionMd,
      orderKey: generateKeyBetween(last?.orderKey ?? null, null),
      status: "TODO",
      assigneeId: null,
    },
    include: TASK_INCLUDE,
  });
  return NextResponse.json(serializeTask(task), { status: 201 });
});
