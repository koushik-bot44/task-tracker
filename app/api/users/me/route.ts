import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { serializeUser } from "@/lib/serialize";
import { requireUser, route } from "@/lib/session";
import type { MeDTO } from "@/lib/types";
import { parseBody, phoneInput } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who the caller is, for the chrome and role-aware UI. `hasFamily` shows the
    Family tab: a literal MANAGER who owns a Person or monitors one. */
export const GET = route(async () => {
  const user = await requireUser();
  const [full, owns, monitors] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, include: { department: { select: { name: true } } } }),
    user.role === "MANAGER" ? prisma.person.count({ where: { managerId: user.id } }) : Promise.resolve(0),
    user.role === "MANAGER" ? prisma.routineCollaborator.count({ where: { managerId: user.id, status: "ACCEPTED" } }) : Promise.resolve(0),
  ]);
  const me: MeDTO = { ...serializeUser(full ?? user), hasFamily: owns + monitors > 0 };
  return NextResponse.json(me);
});

const patchSchema = z.object({
  emailOptIn: z.boolean().optional(),
  whatsappOptIn: z.boolean().optional(),
  phone: phoneInput.optional(),
});

/** The caller's own preferences. Only self-serviceable fields live here. */
export const PATCH = route(async (req: Request) => {
  const user = await requireUser();
  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;

  const { emailOptIn, whatsappOptIn, phone } = parsed.data;
  const data: { emailOptIn?: boolean; whatsappOptIn?: boolean; phone?: string | null } = {};
  if (emailOptIn !== undefined) data.emailOptIn = emailOptIn;
  if (whatsappOptIn !== undefined) data.whatsappOptIn = whatsappOptIn;
  if (phone !== undefined) data.phone = phone;

  const updated = await prisma.user.update({ where: { id: user.id }, data, include: { department: { select: { name: true } } } });
  return NextResponse.json(serializeUser(updated));
});
