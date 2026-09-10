import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";
import { isStaffOnTask } from "@/lib/work/access";
import { serializeActivity } from "@/lib/work/activity";
import { requireSee } from "@/lib/work/tasks";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string; activityId: string } };

const patchSchema = z
  .object({
    /** Pin the file to the top of the record, or take it back down. */
    pinned: z.boolean().optional(),
    /** The words that describe the file — what it is, what it asks for. */
    description: z.string().trim().max(4000).optional(),
  })
  .refine((v) => v.pinned !== undefined || v.description !== undefined, { message: "Nothing to change" });

/**
 * Pin a file to the top of a task, or write what it is.
 *
 * A file lives in the activity stream like everything else; pinning only says
 * it belongs at the top, and the note's own words are its description. Anyone
 * working the task may curate them — the same people who may add one.
 */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const { scope, root } = await requireSee(user, params.id);
  if (!(await isStaffOnTask(user, root, scope))) {
    throw new HttpError(403, "Only the people working this task can pin its files.");
  }

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;

  const row = await prisma.taskActivity.findUnique({ where: { id: params.activityId }, select: { id: true, taskId: true, attachmentUrl: true } });
  if (!row || row.taskId !== params.id) throw new HttpError(404, "That file is not on this task.");
  if (!row.attachmentUrl) throw new HttpError(400, "That entry has no file on it.");

  const updated = await prisma.taskActivity.update({
    where: { id: row.id },
    data: {
      ...(parsed.data.pinned === undefined ? {} : { pinnedAt: parsed.data.pinned ? new Date() : null }),
      ...(parsed.data.description === undefined ? {} : { body: parsed.data.description }),
    },
    include: { author: { select: { id: true, name: true, role: true } }, attachments: { orderBy: { orderKey: "asc" } } },
  });
  return NextResponse.json(serializeActivity(updated));
});
