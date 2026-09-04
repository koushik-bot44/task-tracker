import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertManager } from "@/lib/permissions";
import { canActAsProjectOwner, canSeeProject } from "@/lib/project-visibility";
import { HttpError, requireUser, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string; userId: string } };

/**
 * Owner revokes a collaborating manager (phase 14) — pending or accepted. Their
 * access to this project ends; every other project they own or collaborate on
 * is untouched.
 */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const actor = await requireUser();
  assertManager(actor, "Only a manager can manage collaborators");

  if (!(await canActAsProjectOwner(actor, params.id))) {
    if (!(await canSeeProject(actor, params.id))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    throw new HttpError(403, "Only the project's owner can revoke collaborators");
  }

  await prisma.projectManager.deleteMany({
    where: { projectId: params.id, userId: params.userId },
  });
  return NextResponse.json({ ok: true });
});
