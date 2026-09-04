import { NextResponse } from "next/server";
import { generateKeyBetween } from "fractional-indexing";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import { createPersonalProjectSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A user's PRIVATE projects (phase 33), across all their personal departments —
 * the client groups by departmentId. Caller-scoped throughout; another user's is
 * a 404 (see [id]/route.ts).
 */
export const GET = route(async () => {
  const user = await requireUser();
  const rows = await prisma.personalProject.findMany({
    where: { ownerId: user.id },
    orderBy: { orderKey: "asc" },
    select: { id: true, name: true, orderKey: true, departmentId: true },
  });
  return NextResponse.json(rows);
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const parsed = await parseBody(req, createPersonalProjectSchema);
  if (!parsed.ok) return parsed.response;

  // The department must be the caller's own — otherwise it does not exist to them.
  const dept = await prisma.personalDepartment.findFirst({
    where: { id: parsed.data.departmentId, ownerId: user.id },
    select: { id: true },
  });
  if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 });

  let key = parsed.data.orderKey;
  if (!key) {
    const last = await prisma.personalProject.findFirst({
      where: { ownerId: user.id, departmentId: dept.id },
      orderBy: { orderKey: "desc" },
      select: { orderKey: true },
    });
    key = generateKeyBetween(last?.orderKey ?? null, null);
  }
  const project = await prisma.personalProject.create({
    data: { ownerId: user.id, departmentId: dept.id, name: parsed.data.name, orderKey: key },
    select: { id: true, name: true, orderKey: true, departmentId: true },
  });
  return NextResponse.json(project, { status: 201 });
});
