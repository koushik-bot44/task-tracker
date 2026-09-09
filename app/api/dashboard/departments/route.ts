import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/session";
import { loadScope } from "@/lib/work/access";
import { departmentBreakdown } from "@/lib/work/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Department → team → person with open / in progress / waiting / overdue / unassigned. */
export const GET = route(async () => {
  const user = await requireUser();
  const scope = await loadScope(user);
  return NextResponse.json({ departments: await departmentBreakdown(user, scope) });
});
