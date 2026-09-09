import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/session";
import { loadScope } from "@/lib/work/access";
import { listWork, parseFilter } from "@/lib/work/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The work queue (work model): every task the caller may see, filtered.
 *   ?mine=assigned|requested|team|department  ?state=  ?priority=  ?type=
 *   ?departmentId= ?assignmentGroupId= ?assigneeId= ?requesterId= ?projectId=
 *   ?milestoneId= ?unassigned=1 ?overdue=1 ?dueFrom= ?dueTo= ?createdFrom=
 *   ?createdTo= ?q= ?open=true|false|finished ?sort=updated|due|priority|created|number
 *   ?cursor= ?limit=
 */
export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const scope = await loadScope(user);
  const filter = parseFilter(new URL(req.url).searchParams);
  return NextResponse.json(await listWork(user, scope, filter));
});
