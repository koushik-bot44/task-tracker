import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The admin's queue of pending password-reset requests (phase 14). */
export const GET = route(async () => {
  await requireAdmin();

  const rows = await prisma.passwordResetRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      userId: r.user.id,
      name: r.user.name,
      email: r.user.email,
      requestedAt: r.createdAt.toISOString(),
    })),
  );
});
