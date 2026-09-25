import { NextResponse } from "next/server";
import { z } from "zod";
import { issueInvite } from "@/lib/invite";
import { requireManager, route } from "@/lib/session";
import { parseBody } from "@/lib/validation";
import { personParam, requireCircleMember, requireRoutineAccess } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** false = only make a fresh link, for the CEO to send on himself. */
const bodySchema = z.object({ sendEmail: z.boolean().optional() });

/** A fresh set-password link for a circle member who has not joined yet (a new
    token, a fresh 72 hours, the old link dead). Once they have set a password
    there is nothing to resend. Owner only. */
export const POST = route(async (req: Request, { params }: Params) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { ownerOnly: true });
  const row = await requireCircleMember(person.id, params.id);
  if (row.manager.status !== "PENDING") {
    return NextResponse.json({ error: "They have already set a password." }, { status: 400 });
  }

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  const invite = await issueInvite({
    user: { id: row.managerId, name: row.manager.name, email: row.manager.email, role: "PERSON" },
    inviterName: actor.name,
    createdById: actor.id,
    send: parsed.data.sendEmail !== false,
    roleLabel: row.kind === "FAMILY" ? "Co-parent" : "Tutor or coach",
  });
  return NextResponse.json({ inviteUrl: invite.url, emailSent: invite.sent });
});
