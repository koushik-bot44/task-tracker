import { NextResponse } from "next/server";
import { serializeTask } from "@/lib/serialize";
import { requireUser, route } from "@/lib/session";
import { transitionWork } from "@/lib/work/tasks";
import { parseBody, transitionSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** The generic move: {to, waitingReason?, resolutionCode?, resolutionNotes?, rootCause?, note?}. */
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const parsed = await parseBody(req, transitionSchema);
  if (!parsed.ok) return parsed.response;
  const { to, ...extra } = parsed.data;
  const row = await transitionWork(user, params.id, to, extra);
  return NextResponse.json(serializeTask(row));
});
