import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/session";
import { loadScope } from "@/lib/work/access";
import { listWork, parseFilter } from "@/lib/work/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** What one person holds (the work list with the holder preset; visibility still applies). */
export const GET = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const scope = await loadScope(user);
  const filter = { ...parseFilter(new URL(req.url).searchParams), assigneeId: params.id };
  return NextResponse.json(await listWork(user, scope, filter));
});
