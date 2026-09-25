import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueInvite } from "@/lib/invite";
import { requireManager, route } from "@/lib/session";
import { circleInviteSchema, parseBody } from "@/lib/validation";
import { personParam, requireRoutineAccess, serializeCircleMember } from "@/lib/routine";
import { findUserIdByEmail } from "@/lib/user-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 2026-09-25 (the circle): the owner invites someone around the person — a
 * co-parent (FAMILY), who opens the same Well Being from their own walled login
 * at the permission granted (EDITABLE unless said otherwise), or a tutor/coach
 * (MENTOR), who sees one screen: the day report. One transaction makes the
 * PENDING login (PERSON role, no password yet) and its accepted circle row; then
 * a set-password link goes out — by email unless sendEmail is false, and always
 * handed back here so the CEO can pass it on by hand. The row is answered even
 * when the mail fails: the link can be resent. Owner only.
 */
export const POST = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { ownerOnly: true });

  const parsed = await parseBody(req, circleInviteSchema);
  if (!parsed.ok) return parsed.response;
  const { name, kind, sendEmail } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();
  const subject = kind === "MENTOR" && parsed.data.subject ? parsed.data.subject : null;
  const permission = kind === "FAMILY" ? parsed.data.permission ?? "EDITABLE" : "READ_ONLY";

  // Checked before the transaction: a taken address is the one expected failure.
  // The same lookup sign-in uses, so a colleague's extra address counts as taken.
  if (await findUserIdByEmail(email)) {
    return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
  }

  const row = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, name, role: "PERSON", status: "PENDING", passwordHash: null }, select: { id: true } });
    return tx.routineCollaborator.create({
      data: { personId: person.id, managerId: user.id, kind, subject, permission, status: "ACCEPTED", invitedById: actor.id },
      select: { id: true, managerId: true, kind: true, subject: true, permission: true, manager: { select: { name: true, email: true, status: true } } },
    });
  });

  let inviteUrl = "";
  let emailSent = false;
  try {
    const invite = await issueInvite({
      user: { id: row.managerId, name, email, role: "PERSON" },
      inviterName: actor.name,
      createdById: actor.id,
      send: sendEmail !== false,
      roleLabel: kind === "FAMILY" ? "Co-parent" : "Tutor or coach",
    });
    inviteUrl = invite.url;
    emailSent = invite.sent;
  } catch (err) {
    console.error("[routine/circle] invite link failed:", (err as Error).message);
  }

  return NextResponse.json({ member: serializeCircleMember(row), inviteUrl, emailSent }, { status: 201 });
});
