import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/session";
import { isStaffOnTask } from "@/lib/work/access";
import { listActivity, serializeActivity } from "@/lib/work/activity";
import { requireSee } from "@/lib/work/tasks";
import { activityTypeSchema } from "@/lib/validation";
import type { ActivityType } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * The activity stream. ?type=COMMENT,WORK_NOTE,… ?order=asc|desc ?mentions=me
 * Team notes are stripped for anyone who is not staff on the task.
 */
export const GET = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const { scope, root } = await requireSee(user, params.id);
  const p = new URL(req.url).searchParams;
  const staff = await isStaffOnTask(user, root, scope);
  const types = p.getAll("type").flatMap((v) => v.split(",")).map((v) => v.trim()).filter((v) => activityTypeSchema.safeParse(v).success) as ActivityType[];
  const rows = await listActivity(params.id, {
    staff,
    types: types.length ? types : undefined,
    order: p.get("order") === "desc" ? "desc" : "asc",
    mentioning: p.get("mentions") === "me" ? user.id : undefined,
  });
  return NextResponse.json(rows.map(serializeActivity));
});
