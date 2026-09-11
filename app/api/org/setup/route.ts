import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How far a new organisation's set-up has come, for the CEO's Today
 * (2026-09-11). Counts only, and the CEO's alone.
 */
export const GET = route(async () => {
  const user = await requireUser();
  if (user.role !== "FOUNDER") throw new HttpError(403, "Only the CEO sets up the organisation.");
  const [people, departments, headed, teams, projects, tasks] = await Promise.all([
    prisma.user.count({ where: { role: { notIn: ["FOUNDER", "PERSON", "ADMIN"] }, disabledAt: null } }),
    prisma.department.count(),
    prisma.department.count({ where: { hodId: { not: null } } }),
    prisma.assignmentGroup.count(),
    prisma.project.count(),
    prisma.task.count({ where: { isPrivate: false, deletedAt: null } }),
  ]);
  return NextResponse.json({ people, departments, headed, teams, projects, tasks });
});
