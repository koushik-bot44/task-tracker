import { prisma } from "@/lib/prisma";

/**
 * One person, several email addresses (2026-09-09).
 *
 * The MAIN address stays on `User.email` — it is what the People page shows and
 * where every invite and notification is sent. Any extra address for the same
 * human is a `UserEmail` row. Both tables are searched together, so somebody
 * invited by their second address is recognised as themselves instead of
 * becoming a second account, and signs in with whichever address they remember.
 */

/** Addresses are stored lower-case and trimmed, everywhere, always. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** The same shape check the invite and sign-up paths have always used. */
export function isEmailShaped(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

/**
 * Split a pasted or typed list into addresses. Accepts one per line, or
 * separated by comma, semicolon or space — however the person happened to
 * paste them — and drops duplicates, keeping the first as the main one.
 */
function splitEmails(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const email = normalizeEmail(part);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/** Lower-case, de-duplicate and keep order — the first address is the main one. */
export function dedupeEmails(list: readonly string[]): string[] {
  return splitEmails(list.join("\n"));
}

/**
 * Who owns this address, main or extra? The one lookup every door uses —
 * sign-in, forgot-password, invite — so all three agree on who a person is.
 */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const value = normalizeEmail(email);
  const primary = await prisma.user.findUnique({ where: { email: value }, select: { id: true } });
  if (primary) return primary.id;
  const other = await prisma.userEmail.findUnique({ where: { email: value }, select: { userId: true } });
  return other?.userId ?? null;
}

/** The same lookup, returning the whole row, for the paths that need the person. */
export async function findUserByEmail(email: string) {
  const id = await findUserIdByEmail(email);
  return id ? prisma.user.findUnique({ where: { id } }) : null;
}

/**
 * The addresses in `emails` that already belong to somebody OTHER than
 * `exceptUserId`. A caller shows these back rather than half-inviting a person.
 */
export async function takenEmails(emails: readonly string[], exceptUserId?: string): Promise<string[]> {
  const list = dedupeEmails(emails);
  if (list.length === 0) return [];
  const [primary, extra] = await Promise.all([
    prisma.user.findMany({ where: { email: { in: list } }, select: { id: true, email: true } }),
    prisma.userEmail.findMany({ where: { email: { in: list } }, select: { userId: true, email: true } }),
  ]);
  const taken = [
    ...primary.filter((u) => u.id !== exceptUserId).map((u) => u.email),
    ...extra.filter((e) => e.userId !== exceptUserId).map((e) => e.email),
  ];
  return [...new Set(taken)];
}

/**
 * Give a person their extra addresses. Anything already theirs is left alone,
 * and anything belonging to someone else is skipped rather than throwing — the
 * caller has already reported the clash. Returns how many were added.
 */
export async function addOtherEmails(userId: string, emails: readonly string[]): Promise<number> {
  const list = dedupeEmails(emails);
  if (list.length === 0) return 0;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return 0;
  const taken = new Set(await takenEmails(list, userId));
  const rows = list.filter((email) => email !== user.email && !taken.has(email));
  if (rows.length === 0) return 0;
  const { count } = await prisma.userEmail.createMany({
    data: rows.map((email) => ({ email, userId })),
    skipDuplicates: true,
  });
  return count;
}
