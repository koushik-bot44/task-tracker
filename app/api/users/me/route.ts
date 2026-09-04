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
    Family tab: the CEO alone (owner, 2026-09-04), whether or not a Person is
    set up yet — the tab is where they set one up. */
export const GET = route(async () => {
  const user = await requireUser();
  const full = await prisma.user.findUnique({ where: { id: user.id }, include: { department: { select: { name: true } } } });
  const me: MeDTO = { ...serializeUser(full ?? user), hasFamily: user.role === "FOUNDER" };
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
