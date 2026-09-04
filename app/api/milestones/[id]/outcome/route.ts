import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isExecutiveRole } from "@/lib/roles";
import { projectPeople } from "@/lib/project-people";
import { milestoneRows } from "@/lib/milestones";
import { serializeMilestone } from "@/lib/serialize";
import { sendMessage } from "@/lib/notify";
import { reviewResultMessage } from "@/lib/messages";
import { MILESTONE_OUTCOME_LABEL } from "@/lib/types";
import { HttpError, requireUser, route } from "@/lib/session";
import { milestoneOutcomeInput, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * "Needs your OK" (restructure): the founder/director says On track or Needs
 * work (+ a line). The outcome lands on the milestone, the line becomes a
 * note beside the box, and message (c) goes to everyone on the project with
 * how far along it is — tasks done over tasks in the project, never a number
 * anyone typed (owner, 2026-09-04).
 */
export const POST = route(async (req: Request, { params }: Params) => {
  const actor = await requireUser();
  if (!isExecutiveRole(actor.role)) throw new HttpError(403, "Only the CEO or a director records a review.");

  const parsed = await parseBody(req, milestoneOutcomeInput);
  if (!parsed.ok) return parsed.response;
  const { outcome, note } = parsed.data;

  const m = await prisma.milestone.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, projectId: true, project: { select: { name: true, slug: true, status: true, progressManual: true } } },
  });
  if (!m) throw new HttpError(404, "Milestone not found");

  const line = (note ?? "").trim();
  await prisma.$transaction(async (tx) => {
    await tx.milestone.update({ where: { id: m.id }, data: { outcome, outcomeNote: line || null, outcomeAt: new Date() } });
    await tx.comment.create({
      data: {
        targetType: "MILESTONE",
        targetId: m.id,
        authorId: actor.id,
        body: `${MILESTONE_OUTCOME_LABEL[outcome]}${line ? ` — ${line}` : ""}`,
      },
    });
  });

  const [people, total, done] = await Promise.all([
    projectPeople(m.projectId),
    prisma.task.count({ where: { projectId: m.projectId, deletedAt: null, archived: false, parentId: null } }),
    prisma.task.count({ where: { projectId: m.projectId, deletedAt: null, archived: false, parentId: null, status: "DONE" } }),
  ]);
  const counted = m.project.status === "DONE" ? 100 : total === 0 ? 0 : Math.round((done / total) * 100);
  const progress = m.project.progressManual ?? counted;
  try {
    await sendMessage(
      people.map((p) => p.id).filter((id) => id !== actor.id),
      reviewResultMessage({
        milestoneId: m.id,
        milestoneName: m.name,
        projectName: m.project.name,
        projectSlug: m.project.slug,
        outcomeLabel: MILESTONE_OUTCOME_LABEL[outcome],
        note: line || null,
        progress,
        byName: actor.name,
      }),
    );
  } catch (err) {
    console.error("[review] review_result failed:", (err as Error).message);
  }

  const row = (await milestoneRows(m.projectId)).find((r) => r.id === m.id);
  return NextResponse.json(serializeMilestone(row!));
});
