import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readCollabToken } from "@/lib/collab-invite";
import { route } from "@/lib/session";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().min(1),
  action: z.enum(["accept", "decline"]),
});

/**
 * Accept or decline a collaboration invite from the EMAIL link (phase 18).
 *
 * PUBLIC and token-authorized — the recipient isn't logged in. The signed token
 * names one ProjectManager row; the action is applied to THAT row and only while
 * it is still PENDING. This does exactly what the in-app accept/decline does
 * (accept -> ACCEPTED, decline -> delete the row), so the two paths are the same
 * write against the same row: if the invite was already handled from the app (or
 * a second click), the row is no longer PENDING and this reports "already
 * handled" instead of acting twice. A bad/expired token reports "invalid". Never
 * 4xx — the landing page renders these states.
 */
export const POST = route(async (req: Request) => {
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  const projectManagerId = await readCollabToken(parsed.data.token);
  if (!projectManagerId) {
    return NextResponse.json({ status: "invalid" });
  }

  const row = await prisma.projectManager.findUnique({
    where: { id: projectManagerId },
    select: { id: true, status: true, project: { select: { name: true } } },
  });
  if (!row || row.status !== "PENDING") {
    return NextResponse.json({ status: "already-handled" });
  }

  if (parsed.data.action === "accept") {
    await prisma.projectManager.update({ where: { id: row.id }, data: { status: "ACCEPTED" } });
    return NextResponse.json({ status: "accepted", projectName: row.project.name });
  }
  await prisma.projectManager.delete({ where: { id: row.id } });
  return NextResponse.json({ status: "declined", projectName: row.project.name });
});
