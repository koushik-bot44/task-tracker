import { NextResponse } from "next/server";
import { generateKeyBetween } from "fractional-indexing";
import { prisma } from "@/lib/prisma";
import { DEPARTMENT_HOD_SELECT, serializeDepartment } from "@/lib/serialize";
import { HttpError, requireUser, route } from "@/lib/session";
import { isExecutiveRole } from "@/lib/roles";
import { visibleProjectIds } from "@/lib/project-visibility";
import { createDepartmentSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Departments — the top-level grouping every tool lives in (phase 16), one
 * COMPANY-WIDE set since phase 48.
 *
 * READ, per role (owner, 2026-09-04): the CEO and a director see the whole
 * company; everyone else sees only their own department, a department they
 * head, and any department holding a project they are on. projectCount
 * always counts only the projects the caller can see.
 *
 * WRITE: creation is EXECUTIVE-only (FOUNDER/DIRECTOR). Editing/deleting is
 * gated per-department in [id]/route.ts.
 */
export const GET = route(async () => {
  const user = await requireUser();
  const visible = await visibleProjectIds(user); // throws 403 for admin; null = all; Set = restricted

  const departments = await prisma.department.findMany({
    orderBy: { orderKey: "asc" },
    include: {
      ...DEPARTMENT_HOD_SELECT,
      projects: {
        where: visible ? { id: { in: [...visible] } } : undefined,
        select: { id: true },
      },
    },
  });

  // Owner, 2026-09-04: only the CEO (and a director) sees the whole company.
  // Everyone else sees their own department, a department they head, and a
  // department holding a project they are on — nothing more.
  const executive = isExecutiveRole(user.role);
  const out = departments
    .filter((d) => executive || d.id === user.departmentId || d.hodId === user.id || d.projects.length > 0)
    .map((d) => serializeDepartment(d, d.projects.length));

  return NextResponse.json(out);
});

export const POST = route(async (req: Request) => {
  const actor = await requireUser();
  if (!isExecutiveRole(actor.role)) {
    throw new HttpError(403, "Only the CEO or a director can create a department.");
  }

  const parsed = await parseBody(req, createDepartmentSchema);
  if (!parsed.ok) return parsed.response;
  const { name, color, icon, orderKey, description, hodId } = parsed.data;

  if (hodId) {
    const hod = await prisma.user.findUnique({ where: { id: hodId }, select: { role: true, disabledAt: true } });
    if (!hod || hod.disabledAt || hod.role !== "HOD") {
      return NextResponse.json({ error: "The department head must be an active HOD account." }, { status: 400 });
    }
  }

  // Reuse the tools' fractional order util — one ordering scheme, no parallel copy.
  let key = orderKey;
  if (!key) {
    const last = await prisma.department.findFirst({
      orderBy: { orderKey: "desc" },
      select: { orderKey: true },
    });
    key = generateKeyBetween(last?.orderKey ?? null, null);
  }

  const department = await prisma.department.create({
    data: {
      name,
      color,
      icon: icon ?? null,
      orderKey: key,
      description: description ?? "",
      hodId: hodId ?? null,
      createdById: actor.id,
    },
    include: DEPARTMENT_HOD_SELECT,
  });
  return NextResponse.json(serializeDepartment(department, 0), { status: 201 });
});
