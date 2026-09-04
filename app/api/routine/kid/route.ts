import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePerson, route } from "@/lib/session";
import { buildHabitGrid, buildPersonNonNegotiables, dayKeyToDate, serializeTask, todayKey, toPersonSegments, weekDays, weekStartKey } from "@/lib/routine";
import type { PersonViewDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The PERSON's own screen data (phase 37) — requirePerson, scoped to THEIR own
 * Person. Returns this week's habit grid (segments + habits + Mon–Sun marks, but
 * NO score/targets, NO weight) so the person can mark their own habits, plus today's
 * tasks and their house rules — ONLY the rules the manager SCHEDULED this week, each
 * with its required days -> done, so the person can mark those days done (phase 42;
 * the SAME rows the manager sees; NO score / missed count reaches this side). The
 * person reaches nothing else — every work API 403s them, structure edits and the
 * manager Routine view are never exposed; the person can WRITE only their own habit
 * marks, task checks, and the `done` flag on days the manager already scheduled.
 */
export const GET = route(async () => {
  const user = await requirePerson();
  const person = await prisma.person.findUnique({ where: { userId: user.id }, select: { id: true, name: true } });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const today = todayKey();
  const mondayKey = weekStartKey(today); // the person sees the CURRENT week only
  const [grid, tasks, houseRules, reminderNotif] = await Promise.all([
    buildHabitGrid(person.id, mondayKey),
    prisma.routineTask.findMany({
      where: { personId: person.id, OR: [{ dueDate: null }, { dueDate: dayKeyToDate(today) }] },
      orderBy: [{ done: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, dueDate: true, done: true, doneAt: true },
    }),
    // Only the rules the manager scheduled this week, each day required -> done.
    buildPersonNonNegotiables(person.id, mondayKey),
    prisma.notification.findFirst({
      where: { userId: user.id, type: "routine.reminder", readAt: null },
      orderBy: { createdAt: "desc" },
      select: { title: true, body: true },
    }),
  ]);

  // Show the latest unread reminder once, then mark this person's reminders read.
  let reminder: PersonViewDTO["reminder"] = null;
  if (reminderNotif) {
    reminder = { title: reminderNotif.title, body: reminderNotif.body };
    await prisma.notification.updateMany({ where: { userId: user.id, type: "routine.reminder", readAt: null }, data: { readAt: new Date() } });
  }

  const view: PersonViewDTO = {
    name: person.name,
    today,
    week: { weekStart: mondayKey, days: weekDays(mondayKey) },
    segments: toPersonSegments(grid),
    tasks: tasks.map(serializeTask),
    nonNegotiables: houseRules,
    reminder,
  };
  return NextResponse.json(view);
});
