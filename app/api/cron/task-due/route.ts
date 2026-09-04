import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { taskDueEmail } from "@/lib/email-templates";
import { prisma } from "@/lib/prisma";
import { HttpError, route } from "@/lib/session";
import { istDayKey, istDayRange } from "@/lib/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily task-due reminder. Vercel Cron hits this once a day (see vercel.json)
 * around 08:00 IST. It is NOT publicly triggerable: it demands the CRON_SECRET
 * that Vercel sends as `Authorization: Bearer <secret>`, and 401s anything else.
 *
 * For every task due TODAY in IST (open, dated, assigned), it emails the
 * assignee + the tool's lead — each opted-in and active, deduped so a re-run
 * never double-sends. Idempotent and safe to call repeatedly.
 */
export const GET = route(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    throw new HttpError(401, "Unauthorized");
  }

  const todayKey = istDayKey(new Date());
  const { start, end } = istDayRange(todayKey);

  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      // Private personal tasks (phase 15) are never assigned and never emailed;
      // this guard also stops the project.name/slug read below from crashing on
      // their null projectId.
      isPrivate: false,
      assigneeId: { not: null },
      status: { notIn: ["DONE", "CANCELLED"] },
      dueDate: { gte: start, lte: end },
    },
    select: {
      id: true,
      title: true,
      status: true,
      assignee: { select: { id: true, email: true, emailOptIn: true, disabledAt: true } },
      project: {
        select: {
          name: true,
          slug: true,
          lead: { select: { id: true, email: true, emailOptIn: true, disabledAt: true } },
        },
      },
    },
  });

  let emailed = 0;
  let skipped = 0;

  for (const t of tasks) {
    // Non-null: isPrivate:false above excludes null-project (private) tasks.
    const proj = t.project!;
    // assignee + tool lead, distinct, each opted-in + active.
    const candidates = [t.assignee, proj.lead].filter(
      (u): u is NonNullable<typeof u> => Boolean(u),
    );
    const seen = new Set<string>();
    for (const u of candidates) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      if (u.disabledAt || !u.emailOptIn) {
        skipped++;
        continue;
      }
      const body = taskDueEmail(t, proj.name, proj.slug, t.id);
      const res = await sendEmail({
        to: u.email,
        subject: body.subject,
        html: body.html,
        text: body.text,
        dedupeKey: `task_due:${t.id}:${u.id}:${todayKey}`,
        userId: u.id,
        kind: "task_due",
        refId: t.id,
      });
      if (res.sent) emailed++;
      else skipped++;
    }
  }

  return NextResponse.json({ ok: true, day: todayKey, scanned: tasks.length, emailed, skipped });
});
