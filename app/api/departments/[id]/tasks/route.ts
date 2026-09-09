import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/session";
import { loadScope } from "@/lib/work/access";
import { listWork, parseFilter } from "@/lib/work/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** A department's queue — the work list with the department preset. */
export const GET = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const scope = await loadScope(user);
  const filter = { ...parseFilter(new URL(req.url).searchParams), departmentId: params.id };
  return NextResponse.json(await listWork(user, scope, filter));
});
