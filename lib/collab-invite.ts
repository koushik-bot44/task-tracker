import { SignJWT, jwtVerify } from "jose";
import { getBaseUrl } from "@/lib/base-url";
import { sendEmail } from "@/lib/email";
import { collabInviteEmail } from "@/lib/email-templates";

/**
 * Email accept/decline for project collaboration invites (phase 18).
 *
 * The link carries a signed token, not a database secret: its SUBJECT is the
 * ProjectManager row id, so a link only ever acts on ONE specific invite — if an
 * invite is declined (row deleted) and the same manager is re-invited, the new
 * row has a fresh id and the old link can never touch it. A `purpose` claim keeps
 * it from being mistaken for a session token (and vice versa). There is no
 * separate stored state: the ProjectManager row's status IS the state, which is
 * exactly what keeps the email and in-app paths in sync — acting from either one
 * moves the same row, so the other immediately reads as already handled.
 */

const APP_URL = getBaseUrl();

/** 14 days — long enough for a slow inbox, short enough to not linger forever. */
export const COLLAB_TOKEN_TTL = "14d";

function key(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short (need >= 16 chars)");
  }
  return new TextEncoder().encode(secret);
}

export async function signCollabToken(projectManagerId: string): Promise<string> {
  return new SignJWT({ purpose: "collab-invite" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(projectManagerId)
    .setIssuedAt()
    .setExpirationTime(COLLAB_TOKEN_TTL)
    .sign(key());
}

/** The ProjectManager id a valid token points at, or null (bad/expired/wrong purpose). */
export async function readCollabToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (payload.purpose !== "collab-invite") return null;
    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * Email the invited manager a link to accept or decline. Fire-and-forget — a
 * dead SMTP never breaks the invite (the in-app path still works). Deduped per
 * invite instance so one invite emails at most once.
 */
export async function sendCollabInviteEmail(opts: {
  invitee: { id: string; name: string; email: string };
  inviterName: string;
  projectName: string;
  projectManagerId: string;
}): Promise<{ sent: boolean }> {
  const token = await signCollabToken(opts.projectManagerId);
  const body = collabInviteEmail({
    inviteeName: opts.invitee.name,
    inviterName: opts.inviterName,
    projectName: opts.projectName,
    url: `${APP_URL}/collab-invite/${token}`,
  });
  const res = await sendEmail({
    to: opts.invitee.email,
    subject: body.subject,
    html: body.html,
    text: body.text,
    dedupeKey: `collab-invite:${opts.projectManagerId}`,
    userId: opts.invitee.id,
    kind: "collab_invite",
    refId: opts.projectManagerId,
  });
  return { sent: res.sent };
}
