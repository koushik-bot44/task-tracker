import { NextResponse } from "next/server";
import { canSeeProject } from "@/lib/project-visibility";
import { meetingAttendeeCandidates } from "@/lib/meetings";
import { HttpError, requireUser, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** The faces a meeting on this project can invite: everyone on it. */
export const GET = route(async (_req: Request, { params }: Params) => {
  const actor = await requireUser();
  if (!(await canSeeProject(actor, params.id))) {
    throw new HttpError(404, "Project not found");
  }
  return NextResponse.json(await meetingAttendeeCandidates(params.id));
});
