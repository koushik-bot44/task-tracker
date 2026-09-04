import { NextResponse } from "next/server";
import { generateKeyBetween } from "fractional-indexing";
import { prisma } from "@/lib/prisma";
import { canSeeProject } from "@/lib/project-visibility";
import { canManageProject } from "@/lib/project-people";
import { syncReviewMeeting } from "@/lib/meetings";
import { milestoneRows } from "@/lib/milestones";
import { serializeMilestone } from "@/lib/serialize";
import { HttpError, requireUser, route } from "@/lib/session";
import { createMilestoneSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The milestone boxes of one project, in review-date order. */
export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  if (!(await canSeeProject(user, projectId))) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const rows = await milestoneRows(projectId);
  return NextResponse.json(rows.map(serializeMilestone));
});

/**
 * "+ Add milestone": Name · Review date. Creating it creates its review
 * meeting (11:00 IST, founder + lead + task holders). FOUNDER/DIRECTOR,
 * the HOD of the department, or whoever runs the project.
 */
export const POST = route(async (req: Request) => {
  const actor = await requireUser();
  const parsed = await parseBody(req, createMilestoneSchema);
  if (!parsed.ok) return parsed.response;
  const { projectId, name, reviewDate } = parsed.data;

  if (!(await canSeeProject(actor, projectId))) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!(await canManageProject(actor, projectId))) throw new HttpError(403, "Only the people running this project can add a milestone.");

  const date = new Date(reviewDate);
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Pick a review date" }, { status: 400 });

  const last = await prisma.milestone.findFirst({ where: { projectId }, orderBy: { orderKey: "desc" }, select: { orderKey: true } });
  const m = await prisma.milestone.create({
    data: { projectId, name, reviewDate: date, orderKey: generateKeyBetween(last?.orderKey ?? null, null) },
  });
  await syncReviewMeeting(m.id, actor.id);
  const row = (await milestoneRows(projectId)).find((r) => r.id === m.id);
  return NextResponse.json(serializeMilestone(row!), { status: 201 });
});
