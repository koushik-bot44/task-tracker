import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeTask } from "@/lib/serialize";
import { requireUser, route } from "@/lib/session";
import { loadWork } from "@/lib/work/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { number: string } };

/** A task by its number ("T-1024" or "1024"), with what the caller may do to it. */
export const GET = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  const n = Number(params.number.replace(/^[A-Za-z]-/, ""));
  if (!Number.isInteger(n) || n <= 0) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  const t = await prisma.task.findUnique({ where: { number: n }, select: { id: true, deletedAt: true, isPrivate: true } });
  if (!t || t.deletedAt || t.isPrivate) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  const { row, access } = await loadWork(user, t.id);
  return NextResponse.json({ ...serializeTask(row), access });
});
