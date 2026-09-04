import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canSeeProject } from "@/lib/project-visibility";
import { requireUser, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * A project's people, names only, for the sidebar members popover (phase 17):
 * the TEAM LEAD first, then the DEVELOPER members. Readable by anyone who can
 * SEE the project — an owner/collaborator manager, a lead, or a developer
 * member; a caller who can't see it 404s, and an admin (no project access) gets
 * the usual 403 from the visibility check. Deliberately distinct from the
 * manager-only /members write endpoint: this returns no ids, counts, or roles
 * beyond the single "lead" marker the popover needs.
 */
export const GET = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, lead: { select: { name: true } } },
  });
  // canSeeProject throws 403 for an admin (no project access); a manager/dev who
  // simply can't see the project gets a non-disclosing 404.
  if (!project || !(await canSeeProject(user, project.id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const members = await prisma.projectMember.findMany({
    where: { projectId: project.id },
    select: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    name: project.name,
    lead: project.lead ? { name: project.lead.name } : null,
    developers: members.map((m) => ({ name: m.user.name })),
  });
});
