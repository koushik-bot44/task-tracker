import { NextResponse } from "next/server";
import { invitePeopleToProject } from "@/lib/project-invites";
import { generateKeyBetween } from "fractional-indexing";
import { prisma } from "@/lib/prisma";
import { ensureMember } from "@/lib/project-people";
import { assertCanCreateUserWithRole } from "@/lib/permissions";
import { PROJECT_LEAD_SELECT, serializeProject } from "@/lib/serialize";
import { assertManager } from "@/lib/permissions";
import { requireUser, route } from "@/lib/session";
import { dedupeEmails, isEmailShaped } from "@/lib/user-emails";
import { visibleProjectIds } from "@/lib/project-visibility";
import { enrichProjects } from "@/lib/projects";
import { badRequest, createProjectSchema, parseBody } from "@/lib/validation";
import { PROJECT_COLORS } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base.length > 0 ? base : "project";
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  const existing = await prisma.project.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } });
  const taken = new Set(existing.map((p) => p.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export const GET = route(async () => {
  const user = await requireUser();
  const visible = await visibleProjectIds(user);

  const projects = await prisma.project.findMany({
    where: visible ? { id: { in: [...visible] } } : undefined,
    orderBy: { orderKey: "asc" },
    include: {
      ...PROJECT_LEAD_SELECT,
      _count: { select: { tasks: { where: { deletedAt: null, archived: false } } } },
    },
  });
  const rich = await enrichProjects(projects);
  return NextResponse.json(rich.map((p, i) => serializeProject(p, projects[i]._count.tasks)));
});

/**
 * "+ New project": Name · Lead · Start · Deadline, inside a department.
 *   The CEO → any department. HOD → only the department they head.
 *   MANAGER → any department (the project becomes theirs).
 */
export const POST = route(async (req: Request) => {
  const actor = await requireUser();
  assertManager(actor, "Only a manager can start a project");

  const parsed = await parseBody(req, createProjectSchema);
  if (!parsed.ok) return parsed.response;
  const { name, color, icon, description, leadId, departmentId, startDate, deadline, status, priority, memberIds, invites } = parsed.data;

  const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true, hodId: true } });
  if (!department) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }
  if (actor.role === "HOD" && department.hodId !== actor.id) {
    return NextResponse.json({ error: "A department head can only start projects in their own department." }, { status: 403 });
  }

  if (leadId) {
    const lead = await prisma.user.findUnique({ where: { id: leadId }, select: { id: true, role: true, disabledAt: true, status: true } });
    if (!lead || lead.disabledAt || lead.status !== "ACTIVE" || lead.role === "PERSON" || lead.role === "ADMIN") {
      return badRequest([{ path: ["leadId"], message: "Pick an active person" }]);
    }
  }

  // Every invite row is checked before the project is made (2026-09-11): a
  // mistyped address, or a position this person may not give, used to be
  // skipped without a word while the project went ahead.
  const inviteRows = (invites ?? []).map((inv) => ({
    name: inv.name ?? null,
    emails: dedupeEmails([...(inv.email ? [inv.email] : []), ...(inv.emails ?? [])]),
    role: inv.role ?? null,
  }));
  const invitedAddresses = inviteRows.flatMap((r) => r.emails);
  for (const row of inviteRows) {
    const bad = row.emails.find((e) => !isEmailShaped(e));
    if (!row.emails.length || bad) return badRequest([{ path: ["invites"], message: bad ? `“${bad}” doesn't look like an email.` : "An invite needs at least one email" }]);
    assertCanCreateUserWithRole(actor, row.role ?? "RESOURCE");
  }
  if (new Set(invitedAddresses).size !== invitedAddresses.length) return badRequest([{ path: ["invites"], message: "An address is written for two people." }]);

  const last = await prisma.project.findFirst({ orderBy: { orderKey: "desc" }, select: { orderKey: true } });
  const count = await prisma.project.count();

  /* One hand-written key stored by an old fixture used to stop every new
     project: generateKeyBetween validates its lower bound and threw "invalid
     order key: zzz-wfx", which surfaced as a bare 500 (2026-09-16). A key we
     cannot build on is no reason to refuse the project. */
  let orderKey: string;
  try {
    orderKey = generateKeyBetween(last?.orderKey ?? null, null);
  } catch {
    orderKey = generateKeyBetween(null, null);
  }

  const project = await prisma.project.create({
    data: {
      name,
      slug: await uniqueSlug(name),
      color: color ?? PROJECT_COLORS[count % PROJECT_COLORS.length],
      icon: icon ?? null,
      status: status ?? "ACTIVE",
      orderKey,
      description: description ?? "",
      leadId: leadId ?? null,
      departmentId,
      startDate: startDate ? new Date(startDate) : new Date(),
      deadline: deadline ? new Date(deadline) : null,
      priority: priority ?? "MEDIUM",
      ownerId: actor.id,
    },
    include: PROJECT_LEAD_SELECT,
  });

  // Work model: the people named at creation join now; the emails get invites.
  let added = 0;
  let invited = 0;
  const skipped: string[] = [];
  /** Each new person's set-password link, to send on WhatsApp when an email lands in spam (2026-09-10). */
  const links: { name: string; email: string; url: string }[] = [];
  for (const userId of new Set(memberIds ?? [])) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, disabledAt: true } });
    if (!u || u.disabledAt || u.role === "PERSON" || u.role === "ADMIN") { skipped.push(userId); continue; }
    await ensureMember(project.id, userId);
    added++;
  }
  let emailFailed: string[] = [];
  if (inviteRows.length) {
    // The same service as Add people: someone already on Orbit is added, everyone
    // else gets an account in this department, their position and a link.
    const outcome = await invitePeopleToProject(actor, { id: project.id, name: project.name, departmentId }, inviteRows);
    added += outcome.added;
    invited += outcome.invited;
    links.push(...outcome.links);
    emailFailed = outcome.emailFailed;
    skipped.push(...outcome.skipped.map((s) => s.email));
  }

  const [rich] = await enrichProjects([project]);
  return NextResponse.json({ ...serializeProject(rich, 0), added, invited, skipped, links, emailFailed }, { status: 201 });
});
