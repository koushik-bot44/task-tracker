import { NextResponse } from "next/server";
import { assertManager } from "@/lib/permissions";
import { canSeeProject } from "@/lib/project-visibility";
import { meetingAttendeeCandidates } from "@/lib/meetings";
import { HttpError, requireUser, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * The candidate attendees for a meeting on this project (phase 22): the lead,
 * developer members, and anyone assigned a live task — with ids + role. Used to
 * populate the schedule modal's checkboxes. Manager-only (owner or collaborator);
 * a manager who can't see the project 404s, a lead/dev/admin 403s.
 */
export const GET = route(async (_req: Request, { params }: Params) => {
  const actor = await requireUser();
  assertManager(actor, "Only a manager can schedule meetings");
  if (!(await canSeeProject(actor, params.id))) {
    throw new HttpError(404, "Project not found");
  }
  return NextResponse.json(await meetingAttendeeCandidates(params.id));
});
