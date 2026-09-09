import { NextResponse } from "next/server";
import { serializeTask } from "@/lib/serialize";
import { requireUser, route } from "@/lib/session";
import { transitionWork } from "@/lib/work/tasks";
import { parseBody, transitionSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Sugar over POST /transition with to = ESCALATED. */
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const raw = await req.text();
  const parsed = await parseBody(new Request(req.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(raw ? JSON.parse(raw) : {}), to: "ESCALATED" }) }), transitionSchema);
  if (!parsed.ok) return parsed.response;
  const { to, ...extra } = parsed.data;
  const row = await transitionWork(user, params.id, to, extra);
  return NextResponse.json(serializeTask(row));
});
