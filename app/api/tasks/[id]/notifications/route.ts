import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import { requireSee } from "@/lib/work/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** The caller's own bell rows about this task. */
export const GET = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  await requireSee(user, params.id);
  const rows = await prisma.notification.findMany({ where: { userId: user.id, taskId: params.id }, orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json(
    rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, url: (n.data as { url?: string })?.url ?? `/work`, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() })),
  );
});
