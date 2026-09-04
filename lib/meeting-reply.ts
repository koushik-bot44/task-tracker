import { SignJWT, jwtVerify } from "jose";
import { getBaseUrl } from "@/lib/base-url";
import type { MeetingResponse } from "@/lib/types";

/**
 * Signed reply links for the "tomorrow" message (restructure). The same
 * pattern the old collaboration invite used: the SUBJECT is the EventAttendee
 * row id, a `purpose` claim keeps it from being mistaken for a session token,
 * and the reply itself rides in the token so [I'll be there] and [Can't] are
 * two different links. No stored state: the attendee row's `response` IS the
 * state, so acting from the link or from Today writes the same column.
 */
export const REPLY_TOKEN_TTL = "7d";

function key(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short (need >= 16 chars)");
  }
  return new TextEncoder().encode(secret);
}

export async function signReplyToken(attendeeId: string, response: MeetingResponse): Promise<string> {
  return new SignJWT({ purpose: "meeting-reply", response })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(attendeeId)
    .setIssuedAt()
    .setExpirationTime(REPLY_TOKEN_TTL)
    .sign(key());
}

/** The attendee row + reply a valid token names, or null. */
export async function readReplyToken(token: string): Promise<{ attendeeId: string; response: MeetingResponse } | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (payload.purpose !== "meeting-reply") return null;
    const response = payload.response;
    if (response !== "YES" && response !== "NO") return null;
    return typeof payload.sub === "string" && payload.sub.length > 0 ? { attendeeId: payload.sub, response } : null;
  } catch {
    return null;
  }
}

/** Both links for one attendee row. */
export async function replyLinks(attendeeId: string): Promise<{ yes: string; no: string }> {
  const base = getBaseUrl();
  const [yes, no] = await Promise.all([signReplyToken(attendeeId, "YES"), signReplyToken(attendeeId, "NO")]);
  return { yes: `${base}/r/${yes}`, no: `${base}/r/${no}` };
}
