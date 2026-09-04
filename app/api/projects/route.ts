import { NextResponse } from "next/server";
import { generateKeyBetween } from "fractional-indexing";
import { prisma } from "@/lib/prisma";
import { PROJECT_LEAD_SELECT, serializeProject } from "@/lib/serialize";
import { assertManager } from "@/lib/permissions";
import { requireUser, route } from "@/lib/session";
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
 *   FOUNDER/DIRECTOR → any department. HOD → only the department they head.
 *   MANAGER → any department (the project becomes theirs).
 */
export const POST = route(async (req: Request) => {
  const actor = await requireUser();
  assertManager(actor, "Only a manager can start a project");

  const parsed = await parseBody(req, createProjectSchema);
  if (!parsed.ok) return parsed.response;
  const { name, color, icon, description, leadId, departmentId, startDate, deadline, status, priority } = parsed.data;

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

  const last = await prisma.project.findFirst({ orderBy: { orderKey: "desc" }, select: { orderKey: true } });
  const count = await prisma.project.count();

  const project = await prisma.project.create({
    data: {
      name,
      slug: await uniqueSlug(name),
      color: color ?? PROJECT_COLORS[count % PROJECT_COLORS.length],
      icon: icon ?? null,
      status: status ?? "ACTIVE",
      orderKey: generateKeyBetween(last?.orderKey ?? null, null),
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

  const [rich] = await enrichProjects([project]);
  return NextResponse.json(serializeProject(rich, 0), { status: 201 });
});
