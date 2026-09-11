import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * A head of department runs the department they are placed in (2026-09-11).
 *
 * A head's reach comes from Department.hodId (loadScope in lib/work/access.ts,
 * lib/project-visibility.ts, the People teams), not from the role, so a person
 * given the role but never picked as the head used to see none of their
 * department. Called whenever a person is invited or their position,
 * department or access changes:
 *  - a Head of department placed in a department with no head becomes its head;
 *  - moving out of a department they headed leaves it without a head;
 *  - no longer a Head of department, or disabled: every department they headed
 *    is left without a head, until one is picked.
 * A department that already has a head keeps it — a second head is the CEO's
 * call, from Departments → Edit.
 */
export async function syncDepartmentHead(
  userId: string,
  opts: { previousDepartmentId?: string | null } = {},
  db: Db = prisma,
): Promise<{ madeHeadOf: string | null; leftWithoutHead: string[] }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, departmentId: true, disabledAt: true } });
  if (!user) return { madeHeadOf: null, leftWithoutHead: [] };

  const leftWithoutHead: string[] = [];
  const clear = async (where: Prisma.DepartmentWhereInput) => {
    const headed = await db.department.findMany({ where: { ...where, hodId: userId }, select: { id: true, name: true } });
    if (!headed.length) return;
    await db.department.updateMany({ where: { id: { in: headed.map((d) => d.id) }, hodId: userId }, data: { hodId: null } });
    leftWithoutHead.push(...headed.map((d) => d.name));
  };

  if (user.role !== "HOD" || user.disabledAt) {
    await clear({});
    return { madeHeadOf: null, leftWithoutHead };
  }
  if (opts.previousDepartmentId && opts.previousDepartmentId !== user.departmentId) await clear({ id: opts.previousDepartmentId });
  if (!user.departmentId) return { madeHeadOf: null, leftWithoutHead };

  const { count } = await db.department.updateMany({ where: { id: user.departmentId, hodId: null }, data: { hodId: userId } });
  if (!count) return { madeHeadOf: null, leftWithoutHead };
  const department = await db.department.findUnique({ where: { id: user.departmentId }, select: { name: true } });
  return { madeHeadOf: department?.name ?? null, leftWithoutHead };
}
