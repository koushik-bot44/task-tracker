import { NextResponse } from "next/server";
import { generateKeyBetween } from "fractional-indexing";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import { createPersonalDepartmentSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A user's PRIVATE departments (phase 33). Every route here is caller-scoped:
 * `ownerId: user.id` on read, `ownerId: user.id` on create — a user only ever
 * sees or makes their own. There is no role override; another user's personal
 * space is a 404 (see [id]/route.ts). Every role, admin included, has one.
 */
export const GET = route(async () => {
  const user = await requireUser();
  const rows = await prisma.personalDepartment.findMany({
    where: { ownerId: user.id },
    orderBy: { orderKey: "asc" },
    select: { id: true, name: true, orderKey: true, _count: { select: { projects: true } } },
  });
  return NextResponse.json(
    rows.map((d) => ({ id: d.id, name: d.name, orderKey: d.orderKey, projectCount: d._count.projects })),
  );
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const parsed = await parseBody(req, createPersonalDepartmentSchema);
  if (!parsed.ok) return parsed.response;

  let key = parsed.data.orderKey;
  if (!key) {
    const last = await prisma.personalDepartment.findFirst({
      where: { ownerId: user.id },
      orderBy: { orderKey: "desc" },
      select: { orderKey: true },
    });
    key = generateKeyBetween(last?.orderKey ?? null, null);
  }
  const dept = await prisma.personalDepartment.create({
    data: { ownerId: user.id, name: parsed.data.name, orderKey: key },
  });
  return NextResponse.json({ id: dept.id, name: dept.name, orderKey: dept.orderKey, projectCount: 0 }, { status: 201 });
});
