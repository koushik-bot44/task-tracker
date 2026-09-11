import type { Role } from "@prisma/client";
import { syncDepartmentHead } from "@/lib/department-heads";
import { issueInvite } from "@/lib/invite";
import { assertCanCreateUserWithRole, assertCanPlaceInDepartment } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import { addOtherEmails, dedupeEmails, isEmailShaped, takenEmails } from "@/lib/user-emails";

export type NewPersonRow = { name?: string | null; emails: string[]; role?: Role | null; departmentId?: string | null };
export type InvitedPerson = { id: string; name: string; email: string; role: Role; departmentId: string | null; url: string; emailSent: boolean };

/**
 * Invite several people at once (owner, 2026-09-11) — each with a position or
 * without one (then a Team member), each placed in a department or not yet.
 * Every row is checked first — the addresses, clashes with each other and with
 * everyone on Orbit, the right to give that position, the right to place them
 * there — so one mistake never leaves half a batch behind. Then each account is
 * made, a head of department heads the department they are placed in, and each
 * gets a set-password link (emailed too when email is set up).
 */
export async function invitePeople(actor: { id: string; name: string; role: Role; departmentId?: string | null }, rows: NewPersonRow[]): Promise<InvitedPerson[]> {
  if (!rows.length) throw new HttpError(400, "Add at least one person.");

  const written = new Set<string>();
  const planned = rows.map((row, i) => {
    const addresses = dedupeEmails(row.emails);
    if (!addresses.length) throw new HttpError(400, `${row.name?.trim() || `Person ${i + 1}`} needs an email.`);
    const bad = addresses.find((e) => !isEmailShaped(e));
    if (bad) throw new HttpError(400, `“${bad}” doesn't look like an email.`);
    for (const e of addresses) {
      if (written.has(e)) throw new HttpError(400, `${e} is written for two people.`);
      written.add(e);
    }
    return {
      name: row.name?.trim() || addresses[0].split("@")[0].replace(/[._-]+/g, " "),
      addresses,
      role: row.role ?? ("RESOURCE" as Role),
      departmentId: row.departmentId ?? null,
    };
  });

  for (const p of planned) {
    assertCanCreateUserWithRole(actor, p.role);
    await assertCanPlaceInDepartment(actor, p.departmentId);
  }
  const departmentIds = [...new Set(planned.map((p) => p.departmentId).filter((d): d is string => Boolean(d)))];
  if (departmentIds.length && (await prisma.department.count({ where: { id: { in: departmentIds } } })) !== departmentIds.length) {
    throw new HttpError(400, "One of those departments does not exist.");
  }
  const clash = await takenEmails(planned.flatMap((p) => p.addresses));
  if (clash.length) throw new HttpError(409, `Someone already has ${clash.join(", ")}.`);

  const out: InvitedPerson[] = [];
  for (const p of planned) {
    const [email, ...others] = p.addresses;
    const user = await prisma.user.create({
      data: { email, name: p.name, role: p.role, status: "PENDING", passwordHash: null, departmentId: p.departmentId },
    });
    await addOtherEmails(user.id, others);
    await syncDepartmentHead(user.id);
    const { sent, url } = await issueInvite({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, inviterName: actor.name, createdById: actor.id });
    out.push({ id: user.id, name: user.name, email: user.email, role: user.role, departmentId: user.departmentId, url, emailSent: sent });
  }
  return out;
}
