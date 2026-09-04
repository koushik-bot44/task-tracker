import { NextResponse } from "next/server";
import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canSeeProject } from "@/lib/project-visibility";
import { canManageProject } from "@/lib/project-people";
import { syncReviewMeeting } from "@/lib/meetings";
import { milestoneRows } from "@/lib/milestones";
import { planDates, splitCounts } from "@/lib/plan";
import { serializeMilestone } from "@/lib/serialize";
import { HttpError, requireUser, route } from "@/lib/session";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const planSchema = z.object({ count: z.number().int().min(1).max(12) });

/**
 * "Plan into milestones" (owner, 2026-09-04): every task not yet in a
 * milestone is divided equally, in order, into `count` new boxes appended
 * after the existing ones. Review dates spread evenly from the last box (or
 * the project start, never before today) to the deadline; each task takes its
 * box's review date as a provisional due date; every box gets its review
 * meeting on the calendar (11:00 IST, founder + lead + task holders), so the
 * day-before message and each person's Today follow on their own.
 */
export const POST = route(async (req: Request, { params }: Params) => {
  const actor = await requireUser();
  if (!(await canSeeProject(actor, params.id))) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!(await canManageProject(actor, params.id))) throw new HttpError(403, "Only the people running this project can plan it.");

  const parsed = await parseBody(req, planSchema);
  if (!parsed.ok) return parsed.response;

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: {
      startDate: true,
      deadline: true,
      createdAt: true,
      _count: { select: { milestones: true } },
      milestones: { orderBy: { orderKey: "desc" }, take: 1, select: { reviewDate: true, orderKey: true } },
    },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const loose = await prisma.task.findMany({
    where: { projectId: params.id, milestoneId: null, parentId: null, deletedAt: null, archived: false },
    orderBy: { orderKey: "asc" },
    select: { id: true },
  });
  if (loose.length === 0) throw new HttpError(400, "Add some tasks first — there is nothing to plan yet.");

  const count = Math.min(parsed.data.count, loose.length);
  const last = project.milestones[0] ?? null;
  const dates = planDates({ start: last ? last.reviewDate : project.startDate ?? project.createdAt, end: project.deadline, count });
  const sizes = splitCounts(loose.length, count);
  const existing = project._count.milestones;

  const created: string[] = [];
  await prisma.$transaction(async (tx) => {
    let key = last?.orderKey ?? null;
    let offset = 0;
    for (let i = 0; i < count; i++) {
      key = generateKeyBetween(key, null);
      const m = await tx.milestone.create({
        data: { projectId: params.id, name: `Milestone ${existing + i + 1}`, reviewDate: dates[i], orderKey: key },
      });
      created.push(m.id);
      const ids = loose.slice(offset, offset + sizes[i]).map((t) => t.id);
      offset += sizes[i];
      await tx.task.updateMany({ where: { id: { in: ids } }, data: { milestoneId: m.id, dueDate: dates[i], dueProvisional: true } });
    }
  });
  for (const id of created) await syncReviewMeeting(id, actor.id);

  const rows = await milestoneRows(params.id);
  return NextResponse.json(rows.map(serializeMilestone), { status: 201 });
});
