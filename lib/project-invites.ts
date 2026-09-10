import { Prisma, type Role } from "@prisma/client";
import { issueInvite } from "@/lib/invite";
import { syncProjectReviews } from "@/lib/meetings";
import { assertCanCreateUserWithRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ensureMember } from "@/lib/project-people";
import { HttpError } from "@/lib/session";
import { addOtherEmails, dedupeEmails, findUserIdByEmail, isEmailShaped } from "@/lib/user-emails";

/**
 * Putting several people on a project at once, after it exists (owner,
 * 2026-09-10). Someone already on Orbit — by any of their addresses — is
 * simply added; everyone else gets an account in the project's department and
 * an invite. The whole list is checked before anything is written, so one
 * mistyped address never leaves half a batch behind.
 */

export type InviteRow = { name?: string | null; emails: string[]; role?: "RESOURCE" | "TEAM_LEAD" | null };

export type InviteOutcome = {
  added: number;
  invited: number;
  /** Invited, but the email didn't go — Resend invite on People sends it again. */
  emailFailed: string[];
  skipped: { email: string; reason: string }[];
  /** Each new person's set-password link, for the person inviting to send on WhatsApp (2026-09-10). */
  links: { name: string; email: string; url: string }[];
};

export async function invitePeopleToProject(
  actor: { id: string; name: string; role: Role },
  project: { id: string; name: string; departmentId: string | null },
  rows: InviteRow[],
): Promise<InviteOutcome> {
  // 1. Every address shaped, and no address written for two people.
  const owner = new Map<string, number>();
  const planned = rows.map((row, i) => {
    const addresses = dedupeEmails(row.emails);
    if (!addresses.length) throw new HttpError(400, `Person ${i + 1} needs an email.`);
    const bad = addresses.find((e) => !isEmailShaped(e));
    if (bad) throw new HttpError(400, `“${bad}” doesn't look like an email.`);
    for (const e of addresses) {
      if (owner.has(e)) throw new HttpError(400, `${e} is written for two people.`);
      owner.set(e, i);
    }
    return { name: row.name?.trim() ?? "", addresses, role: row.role === "TEAM_LEAD" ? ("TEAM_LEAD" as const) : ("RESOURCE" as const) };
  });

  // 2. Who is here already — read before anything is written, and the right to
  //    make the others' accounts checked for all of them first.
  const found = await Promise.all(
    planned.map(async (p) => {
      const id = (await Promise.all(p.addresses.map(findUserIdByEmail))).find(Boolean) ?? null;
      return id ? prisma.user.findUnique({ where: { id }, select: { id: true, role: true, disabledAt: true } }) : null;
    }),
  );
  planned.forEach((p, i) => {
    if (!found[i]) assertCanCreateUserWithRole(actor, p.role);
  });

  // 3. Add, or make and invite.
  const out: InviteOutcome = { added: 0, invited: 0, emailFailed: [], skipped: [], links: [] };
  for (const [i, p] of planned.entries()) {
    const [email, ...others] = p.addresses;
    const existing = found[i];
    if (existing) {
      if (existing.disabledAt || existing.role === "PERSON" || existing.role === "ADMIN") {
        out.skipped.push({ email, reason: existing.disabledAt ? "their account is disabled" : "that account can't be put on a project" });
        continue;
      }
      await ensureMember(project.id, existing.id);
      // Addresses named here that they did not have yet are now theirs too.
      await addOtherEmails(existing.id, p.addresses);
      out.added++;
      continue;
    }
    let user;
    try {
      user = await prisma.user.create({
        data: { email, name: p.name || email.split("@")[0].replace(/[._-]+/g, " "), role: p.role, status: "PENDING", passwordHash: null, departmentId: project.departmentId },
      });
    } catch (error) {
      // Someone took the address a moment ago: they are on Orbit now, so add them.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const id = await findUserIdByEmail(email);
        if (id) {
          await ensureMember(project.id, id);
          out.added++;
          continue;
        }
      }
      throw error;
    }
    await addOtherEmails(user.id, others);
    await ensureMember(project.id, user.id);
    const { sent, url } = await issueInvite({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, inviterName: actor.name, createdById: actor.id, projectName: project.name });
    out.invited++;
    out.links.push({ name: user.name, email: user.email, url });
    if (!sent) out.emailFailed.push(email);
  }

  // Awaited: serverless freezes work started after the response (work model).
  await syncProjectReviews(project.id, actor.id).catch(() => undefined);
  return out;
}
