import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertManager } from "@/lib/permissions";
import { HttpError, requireUser, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { projectId: string } };

async function pendingInvite(userId: string, projectId: string) {
  const row = await prisma.projectManager.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!row || row.status !== "PENDING") {
    throw new HttpError(404, "No pending invite here.");
  }
  return row;
}

/** ACCEPT: the invited manager gains collaborator access to the project. */
export const POST = route(async (_req: Request, { params }: Params) => {
  const actor = await requireUser();
  assertManager(actor, "Only a manager can accept this");
  await pendingInvite(actor.id, params.projectId);

  await prisma.projectManager.update({
    where: { projectId_userId: { projectId: params.projectId, userId: actor.id } },
    data: { status: "ACCEPTED" },
  });
  return NextResponse.json({ ok: true });
});

/** DECLINE: the invite is removed; no access is granted. */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const actor = await requireUser();
  assertManager(actor, "Only a manager can decline this");
  await pendingInvite(actor.id, params.projectId);

  await prisma.projectManager.delete({
    where: { projectId_userId: { projectId: params.projectId, userId: actor.id } },
  });
  return NextResponse.json({ ok: true });
});
