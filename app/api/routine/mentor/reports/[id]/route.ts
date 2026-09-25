import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMentor, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** The tutor takes back one of their OWN reports. Anyone else's is a 404. */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requireMentor();
  const report = await prisma.mentorReport.findFirst({ where: { id: params.id, collaborator: { managerId: user.id } }, select: { id: true } });
  if (!report) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await prisma.mentorReport.delete({ where: { id: report.id } });
  return NextResponse.json({ ok: true });
});
