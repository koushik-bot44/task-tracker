import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";
import { serializeRule } from "@/lib/work/org";
import { parseBody, updateRuleSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export const PATCH = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  if (user.role !== "FOUNDER") throw new HttpError(403, "Only the CEO sets routing rules.");
  const parsed = await parseBody(req, updateRuleSchema);
  if (!parsed.ok) return parsed.response;
  const updated = await prisma.assignmentRule.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(serializeRule(updated));
});

export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  if (user.role !== "FOUNDER") throw new HttpError(403, "Only the CEO sets routing rules.");
  await prisma.assignmentRule.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
