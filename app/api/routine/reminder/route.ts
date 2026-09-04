import { NextResponse } from "next/server";
import { requireManager, route } from "@/lib/session";
import { personParam, remindPerson, requireRoutineAccess } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Send the person a reminder about their undone tasks (owner or EDITABLE collaborator;
 * READ_ONLY -> 403, since it is a write). Sends a durable in-app notification + a
 * best-effort push, only when there ARE pending tasks, rate-limited. Returns the
 * outcome so the UI can show a sent / no-pending / too-soon state.
 */
export const POST = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });
  const result = await remindPerson(person);
  return NextResponse.json(result);
});
