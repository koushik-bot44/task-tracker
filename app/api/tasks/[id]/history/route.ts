import { NextResponse } from "next/server";
import { requireUser, route } from "@/lib/session";
import { listActivity, serializeActivity } from "@/lib/work/activity";
import { requireSee } from "@/lib/work/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Who changed what, old → new, when: the field changes alone. */
export const GET = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  await requireSee(user, params.id);
  const order = new URL(req.url).searchParams.get("order") === "desc" ? "desc" : "asc";
  const rows = await listActivity(params.id, { staff: true, historyOnly: true, order });
  return NextResponse.json(rows.map(serializeActivity));
});
