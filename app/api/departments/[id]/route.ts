import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEPARTMENT_HOD_SELECT, serializeDepartment } from "@/lib/serialize";
import { HttpError, requireUser, route } from "@/lib/session";
import { isExecutiveRole } from "@/lib/roles";
import { parseBody, updateDepartmentSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * Departments are COMPANY-WIDE (phase 48). Write rules:
 *   FOUNDER/DIRECTOR → edit anything on any department; assign/replace the HOD.
 *   HOD              → edit the DESCRIPTION of the department(s) they head,
 *                      nothing else, nowhere else.
 *   everyone else    → read-only (404-shaped 403s are not needed; the list is
 *                      public structure, so a refused write is a plain 403).
 *   DELETE           → FOUNDER only, and only when the department is empty.
 */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const actor = await requireUser();

  const parsed = await parseBody(req, updateDepartmentSchema);
  if (!parsed.ok) return parsed.response;
  const patch = parsed.data;

  const existing = await prisma.department.findUnique({
    where: { id: params.id },
    select: { id: true, hodId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  const executive = isExecutiveRole(actor.role);
  const headsIt = actor.role === "HOD" && existing.hodId === actor.id;
  if (!executive && !headsIt) {
    throw new HttpError(403, "Only the founder or a director can edit a department.");
  }

  const data: Prisma.DepartmentUpdateInput = {};
  if (executive) {
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.color !== undefined) data.color = patch.color;
    if (patch.icon !== undefined) data.icon = patch.icon;
    if (patch.orderKey !== undefined) data.orderKey = patch.orderKey;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.hodId !== undefined) {
      if (patch.hodId) {
        const hod = await prisma.user.findUnique({
          where: { id: patch.hodId },
          select: { role: true, disabledAt: true },
        });
        if (!hod || hod.disabledAt || hod.role !== "HOD") {
          return NextResponse.json(
            { error: "The department head must be an active HOD account." },
            { status: 400 },
          );
        }
      }
      data.hod = patch.hodId ? { connect: { id: patch.hodId } } : { disconnect: true };
    }
  } else {
    // The department's own HOD: description only.
    const touched = Object.keys(patch).filter((k) => patch[k as keyof typeof patch] !== undefined);
    if (touched.some((k) => k !== "description")) {
      throw new HttpError(403, "A department head can only edit their department's description.");
    }
    if (patch.description !== undefined) data.description = patch.description;
  }

  const department = await prisma.department.update({
    where: { id: params.id },
    data,
    include: { ...DEPARTMENT_HOD_SELECT, projects: { select: { id: true } } },
  });
  return NextResponse.json(serializeDepartment(department, department.projects.length));
});

/**
 * Delete a department. FOUNDER only (a director cannot), and only when EMPTY —
 * every project lives in exactly one department, so a department with tools in
 * it can't be removed (409); move the tools out first.
 */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const actor = await requireUser();
  // The owner folded FOUNDER away — DIRECTOR is the top of the chain now, so
  // deleting a department is an executive power like creating one.
  if (!isExecutiveRole(actor.role)) {
    throw new HttpError(403, "Only a director can delete a department.");
  }

  const existing = await prisma.department.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  const projectCount = await prisma.project.count({ where: { departmentId: params.id } });
  if (projectCount > 0) {
    return NextResponse.json(
      { error: `This department still holds ${projectCount} project${projectCount === 1 ? "" : "s"}. Move them out first.` },
      { status: 409 },
    );
  }

  await prisma.department.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
