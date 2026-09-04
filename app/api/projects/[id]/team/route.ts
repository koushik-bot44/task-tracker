import { NextResponse } from "next/server";
import { canSeeProject } from "@/lib/project-visibility";
import { projectPeople } from "@/lib/project-people";
import { HttpError, requireUser, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Names only — the people on a project, lead first. Same source as /members. */
export const GET = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  if (!(await canSeeProject(user, params.id))) {
    throw new HttpError(404, "Project not found");
  }
  const people = await projectPeople(params.id);
  return NextResponse.json({
    lead: people.find((p) => p.isLead) ? { name: people.find((p) => p.isLead)!.name } : null,
    people: people.map((p) => ({ name: p.name })),
  });
});
