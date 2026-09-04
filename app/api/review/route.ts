import { NextResponse } from "next/server";
import { VERIFIED_GATE_KEY, asGates } from "@/lib/gates";
import { prisma } from "@/lib/prisma";
import { assertManager } from "@/lib/permissions";
import { visibleProjectIds } from "@/lib/project-visibility";
import { COMPLETED_BY_SELECT, serializeTask } from "@/lib/serialize";
import { requireUser, route } from "@/lib/session";
import type { TaskDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECENT_LIMIT = 20;

/**
 * The manager's queue (phase 14: managers only — admins have no project access —
 * and SCOPED to the projects the manager owns or collaborates on). A DONE task
 * needs review until its Verified gate is ticked; only tasks carrying that gate
 * appear.
 */
export const GET = route(async () => {
  const actor = await requireUser();
  assertManager(actor, "Only a manager can review");
  const visible = await visibleProjectIds(actor); // null = all (leads never reach here)
  // isPrivate:false is defensive: a manager's visible set is never null so the
  // projectId clause already excludes private tasks, but this keeps the guard
  // even if the review gate ever admitted an all-projects role.
  const scope = { isPrivate: false, ...(visible ? { projectId: { in: [...visible] } } : {}) };

  const done = await prisma.task.findMany({
    where: { deletedAt: null, status: "DONE", ...scope },
    orderBy: { completedAt: "desc" },
    include: COMPLETED_BY_SELECT,
  });

  const needsReview: TaskDTO[] = [];
  const recentlyReviewed: TaskDTO[] = [];

  for (const task of done) {
    const gate = asGates(task.gates).find((g) => g.key === VERIFIED_GATE_KEY);
    if (!gate) continue;
    if (gate.done) {
      if (recentlyReviewed.length < RECENT_LIMIT) {
        recentlyReviewed.push(serializeTask(task));
      }
    } else {
      needsReview.push(serializeTask(task));
    }
  }

  // Ancestor titles for the path shown on each row, without a lookup per task —
  // scoped to the same visible projects so no other tool's titles leak.
  const ancestors = await prisma.task.findMany({
    where: { deletedAt: null, ...scope },
    select: { id: true, title: true, parentId: true, projectId: true },
  });

  return NextResponse.json({ needsReview, recentlyReviewed, ancestors });
});
