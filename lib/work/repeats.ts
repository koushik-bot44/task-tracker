import { generateKeyBetween } from "fractional-indexing";
import type { Repeats, Task } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordSystem } from "@/lib/work/activity";
import { istDayRange, istDayKey } from "@/lib/timezone";

/**
 * Tasks that come round again (owner, 2026-09-15: "recursion option task for
 * every month ...like stuff may occur").
 *
 * The next one is raised ON THE DAY IT FALLS DUE, by the daily job — not when
 * the last one is ticked off. A monthly task should appear in September whether
 * or not August's was ever finished; raising it on completion would silently
 * skip any month somebody fell behind on.
 */

/** What each choice is called on screen. */
export const REPEATS_LABEL: Record<Repeats, string> = {
  DAY: "Every day",
  WEEK: "Every week",
  MONTH: "Every month",
};

/**
 * The day it comes round next.
 *
 * THE END OF THE MONTH MEANS THE END OF THE MONTH (owner, 2026-09-15: "how it
 * could repeat if i take a date of month end"). A task due on the last day of
 * its month falls due on the last day of the next one — 31 Jan, 28 Feb, 31 Mar,
 * 30 Apr — rather than sticking on the 28th for ever after one short month,
 * which is what simply clamping the number would do.
 *
 * Any other day keeps its number, and a month too short to hold it lands on its
 * last day: there is no 31st of September, so the 31st becomes the 30th.
 */
export function nextDue(due: Date, every: Repeats): Date {
  const d = new Date(due);
  if (every === "DAY") {
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (every === "WEEK") {
    d.setDate(d.getDate() + 7);
    return d;
  }
  const lastOfThisMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const atMonthEnd = d.getDate() === lastOfThisMonth;
  const target = new Date(d.getFullYear(), d.getMonth() + 1, 1, d.getHours(), d.getMinutes(), 0, 0);
  const lastOfThatMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(atMonthEnd ? lastOfThatMonth : Math.min(d.getDate(), lastOfThatMonth));
  return target;
}

/** The fields a repeat carries over: the same work, on a new day. */
function copyOf(t: Task, due: Date, orderKey: string) {
  return {
    title: t.title,
    descriptionMd: t.descriptionMd,
    type: t.type,
    priority: t.priority,
    important: t.important,
    categoryId: t.categoryId,
    requesterId: t.requesterId,
    givenById: t.givenById,
    departmentId: t.departmentId,
    assignmentGroupId: t.assignmentGroupId,
    projectId: t.projectId,
    milestoneId: t.milestoneId,
    assigneeId: t.assigneeId,
    assignedAt: t.assigneeId ? new Date() : null,
    dueDate: due,
    dueProvisional: false,
    orderKey,
    // It repeats too, so the chain keeps going.
    repeats: t.repeats,
    repeatedFromId: t.id,
    state: t.assigneeId ? ("ASSIGNED" as const) : ("NEW" as const),
    status: t.assigneeId ? ("TODO" as const) : ("TODO" as const),
  };
}

/**
 * Raise every repeat whose day has come.
 *
 * Idempotent: a task is only followed when NOTHING already points back at it,
 * so a second run — or two ticks at once — raises nothing twice. A cancelled
 * task stops repeating, so a routine somebody dropped does not come back every
 * month on its own.
 */
export async function raiseRepeatsDue(now = new Date()): Promise<{ raised: number; skipped: number }> {
  const today = istDayRange(istDayKey(now)).end;
  const candidates = await prisma.task.findMany({
    where: {
      repeats: { not: null },
      dueDate: { not: null, lte: today },
      deletedAt: null,
      parentId: null,
      state: { not: "CANCELLED" },
    },
  });
  if (candidates.length === 0) return { raised: 0, skipped: 0 };

  // Which of them have already been followed? One query, not one each.
  const followed = new Set(
    (
      await prisma.task.findMany({
        where: { repeatedFromId: { in: candidates.map((t) => t.id) } },
        select: { repeatedFromId: true },
      })
    )
      .map((t) => t.repeatedFromId)
      .filter((id): id is string => Boolean(id)),
  );

  let raised = 0;
  let skipped = 0;
  for (const t of candidates) {
    if (followed.has(t.id) || !t.dueDate || !t.repeats) {
      skipped++;
      continue;
    }
    const due = nextDue(t.dueDate, t.repeats);
    const highest = await prisma.task.findFirst({ orderBy: { orderKey: "desc" }, select: { orderKey: true } });
    const orderKey = generateKeyBetween(highest?.orderKey ?? null, null);
    try {
      const next = await prisma.task.create({ data: copyOf(t, due, orderKey) });
      // Whoever it lands on should be able to see WHY it appeared.
      await recordSystem(prisma, next.id, `Opened because ${t.number} repeats ${REPEATS_LABEL[t.repeats].toLowerCase()}`, { repeatedFrom: t.id });
      if (next.assigneeId) await prisma.taskPerson.create({ data: { taskId: next.id, userId: next.assigneeId, addedById: null } });
      raised++;
    } catch {
      // A key clash or a race: the next run picks it up.
      skipped++;
    }
  }
  return { raised, skipped };
}
