import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/session";
import { loadScope } from "@/lib/work/access";
import { listWork, listWorkTasks, narrowingLabels, parseFilter } from "@/lib/work/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The work queue (work model): every task the caller may see, filtered.
 *   ?mine=assigned|requested|team|department  ?state=  ?priority=  ?type=
 *   ?departmentId= ?assignmentGroupId= ?assigneeId= ?requesterId=
 *   ?projectId=<id>|none ?milestoneId= ?unassigned=1 ?overdue=1 ?dueFrom= ?dueTo=
 *   ?createdFrom= ?createdTo= ?q= ?open=true|false|finished
 *   ?sort=updated|due|priority|created|number ?limit=
 * Records a cursor at a time (?cursor=), or — with ?rows=tasks&page=N, as the
 * Work screen asks — one row per task, pages numbered, with the names of what
 * the list is narrowed to.
 */
export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const scope = await loadScope(user);
  const filter = parseFilter(new URL(req.url).searchParams);
  if (filter.rows === "tasks") {
    const [list, labels] = await Promise.all([listWorkTasks(user, scope, filter), narrowingLabels(scope, filter)]);
    return NextResponse.json({ ...list, labels });
  }
  return NextResponse.json(await listWork(user, scope, filter));
});
