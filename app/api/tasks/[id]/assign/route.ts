import { NextResponse } from "next/server";
import { serializeTask } from "@/lib/serialize";
import { requireUser, route } from "@/lib/session";
import { updateWork } from "@/lib/work/tasks";
import { assignSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Department → team → person. A person must be on the team when one is set. */
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const parsed = await parseBody(req, assignSchema);
  if (!parsed.ok) return parsed.response;
  const row = await updateWork(user, params.id, parsed.data);
  return NextResponse.json(serializeTask(row));
});
