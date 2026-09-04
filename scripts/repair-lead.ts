/**
 * Repair for a lead assignment my own rig wiped.
 *
 * scripts/perm-matrix.ts tested "manager assigns a lead to a legacy tool"
 * against `projects[0]` from an UNORDERED findMany, then in cleanup reset that
 * project's leadId to null — not to whatever it had been. On this run
 * projects[0] was `anvi-careers`, a tool the owner had created with a lead, so
 * the cleanup silently removed a real assignment.
 *
 * Evidence was captured before any write:
 *   records/snapshots/evidence-leadwipe-2026-07-22T20-56-44-663Z.json
 *
 * `sudeep@gmail.com` is the only TEAM_LEAD in the system and tool creation
 * REQUIRES an active team lead, so that is necessarily who the lead was.
 *
 *   npx tsx scripts/repair-lead.ts          report only
 *   npx tsx scripts/repair-lead.ts --apply  restore
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SLUG = "anvi-careers";
const LEAD_EMAIL = "sudeep@gmail.com";
const APPLY = process.argv.includes("--apply");

async function main() {
  const lead = await prisma.user.findUnique({
    where: { email: LEAD_EMAIL },
    select: { id: true, role: true, disabledAt: true },
  });
  if (!lead || lead.role !== "TEAM_LEAD" || lead.disabledAt) {
    throw new Error(`${LEAD_EMAIL} is not an active TEAM_LEAD — refusing to guess`);
  }

  const project = await prisma.project.findUnique({
    where: { slug: SLUG },
    select: { slug: true, leadId: true },
  });
  if (!project) {
    console.log(`${SLUG} not found — nothing to repair`);
    return;
  }
  if (project.leadId) {
    console.log(`${SLUG} already has leadId=${project.leadId} — nothing to repair`);
    return;
  }

  console.log(`${SLUG}: leadId is NULL, should be ${lead.id} (${LEAD_EMAIL})`);
  if (!APPLY) {
    console.log("report only — re-run with --apply to restore");
    return;
  }

  const updated = await prisma.project.update({
    where: { slug: SLUG },
    data: { leadId: lead.id },
    select: { slug: true, leadId: true },
  });
  console.log(`restored ${updated.slug}: leadId -> ${updated.leadId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
