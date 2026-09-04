import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "orbit_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * One list, and the type is derived from it.
 *
 * These used to be a hand-written union here and a hand-written `role !==`
 * chain below. Adding TEAM_LEAD updated the union and not the chain, so every
 * team lead's token verified, failed the allowlist, and came back 401 — the
 * role was unable to sign in at all. Deriving the type from the array means
 * the next role cannot land in one place and not the other.
 */
export const ROLES = ["FOUNDER", "DIRECTOR", "HOD", "MANAGER", "TEAM_LEAD", "RESOURCE", "ADMIN", "PERSON"] as const;
export type Role = (typeof ROLES)[number];

export type SessionClaims = {
  userId: string;
  role: Role;
  name: string;
};

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short (need >= 16 chars)");
  }
  return new TextEncoder().encode(secret);
}

/** Mint a 30-day session token carrying who the holder is. */
export async function createSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role, name: claims.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

/**
 * Returns the claims, or null. A token is only usable if it names a subject
 * *and* carries a role we recognise.
 *
 * That second condition is what retires the passcode era: those cookies are
 * still signed with the same secret and still carry a subject — the literal
 * string "orbit" — so checking for a subject alone would happily accept them.
 * Requiring `role` rejects every one of them without a secret rotation.
 */
export async function readSessionToken(
  token: string | undefined,
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const userId = payload.sub;
    const role = payload.role;
    const name = payload.name;

    if (typeof userId !== "string" || userId.length === 0) return null;
    if (typeof role !== "string") return null;
    if (!(ROLES as readonly string[]).includes(role)) return null;

    return { userId, role: role as Role, name: typeof name === "string" ? name : "" };
  } catch {
    return null;
  }
}

/** The one place cookie flags are decided, so sign-in and bootstrap agree. */
export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

/**
 * Length-independent-ish comparison so a wrong passcode does not leak its length
 * through response timing. Only guards bootstrap now.
 */
export function passcodeMatches(input: string): boolean {
  const expected = process.env.APP_PASSCODE ?? "";
  if (!expected) return false;
  const a = new TextEncoder().encode(input);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
