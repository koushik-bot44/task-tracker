import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";
import { serializeRule } from "@/lib/work/org";
import { createRuleSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Routing rules are the CEO's (a head reads them). */
export const GET = route(async () => {
  const user = await requireUser();
  if (user.role !== "FOUNDER" && user.role !== "HOD") throw new HttpError(403, "Not allowed");
  const rows = await prisma.assignmentRule.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json(rows.map(serializeRule));
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  if (user.role !== "FOUNDER") throw new HttpError(403, "Only the CEO sets routing rules.");
  const parsed = await parseBody(req, createRuleSchema);
  if (!parsed.ok) return parsed.response;
  const created = await prisma.assignmentRule.create({ data: { ...parsed.data, match: parsed.data.match, set: parsed.data.set } });
  return NextResponse.json(serializeRule(created), { status: 201 });
});
