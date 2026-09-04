import { prisma } from "@/lib/prisma";
import { readCollabToken } from "@/lib/collab-invite";
import { CollabInviteCard } from "@/components/collab-invite-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public landing page for a collaboration-invite email link (phase 18). Loads the
 * invite named by the token and hands it to the card, which acts only on a click.
 * No session required — the signed token is the authorization.
 */
export default async function CollabInvitePage({ params }: { params: { token: string } }) {
  const projectManagerId = await readCollabToken(params.token);
  const row = projectManagerId
    ? await prisma.projectManager.findUnique({
        where: { id: projectManagerId },
        select: { status: true, project: { select: { name: true, owner: { select: { name: true } } } } },
      })
    : null;

  const invite = row
    ? {
        projectName: row.project.name,
        inviterName: row.project.owner?.name ?? "A manager",
        pending: row.status === "PENDING",
      }
    : null;

  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-center justify-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-on-primary" aria-hidden>
            <span className="h-3 w-3 rounded-full bg-on-primary" />
          </span>
          <span className="font-display text-lg font-semibold text-ink">Orbit</span>
        </div>
        <CollabInviteCard token={params.token} invite={invite} />
      </div>
    </main>
  );
}
