import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMentor, route } from "@/lib/session";
import { serializeReport, todayKey } from "@/lib/routine";
import type { MentorViewDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 2026-09-25 (the circle): the tutor's or coach's one screen. Each person they
 * were invited around, with what they teach and their own past reports (newest
 * first, the latest 30). Nothing of the Well Being itself reaches this side —
 * no habits, no rules — only what the tutor wrote.
 */
export const GET = route(async () => {
  const user = await requireMentor();
  const rows = await prisma.routineCollaborator.findMany({
    where: { managerId: user.id, status: "ACCEPTED", kind: "MENTOR" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      subject: true,
      person: { select: { name: true } },
      reports: {
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 30,
        select: { id: true, date: true, subject: true, covered: true, homework: true, note: true, createdAt: true },
      },
    },
  });

  const view: MentorViewDTO = {
    name: user.name,
    today: todayKey(),
    students: rows.map((r) => ({
      collaboratorId: r.id,
      personName: r.person.name,
      subject: r.subject,
      // Every report here is the caller's own, so the mentor's name is theirs.
      reports: r.reports.map((rep) => serializeReport({ ...rep, collaborator: { manager: { name: user.name } } })),
    })),
  };
  return NextResponse.json(view);
});
