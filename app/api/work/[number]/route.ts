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

  // The same task given to several people is one record each; a record should
  // say who else is on it, so the others are looked up here (and only here —
  // a list of 50 rows does not need 50 extra queries).
  const alsoWith = row.siblingKey
    ? (
        await prisma.task.findMany({
          where: { siblingKey: row.siblingKey, id: { not: row.id }, deletedAt: null, assigneeId: { not: null } },
          select: { assignee: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        })
      )
        .map((s) => s.assignee)
        .filter((a): a is { id: string; name: string } => Boolean(a))
        // One entry per PERSON, and never the holder of this record twice.
        .filter((a, i, list) => a.id !== row.assigneeId && list.findIndex((b) => b.id === a.id) === i)
    : [];

  return NextResponse.json({ ...serializeTask(row), alsoWith, access });
});
