import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { serializeUser } from "@/lib/serialize";
import { HttpError, requireUser, route } from "@/lib/session";
import type { MeDTO } from "@/lib/types";
import { parseBody, phoneInput } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who the caller is, for the chrome and role-aware UI. `hasFamily` shows the
    Well Being tab: the CEO alone (owner, 2026-09-04), whether or not a Person is
    set up yet — the tab is where they set one up. */
export const GET = route(async () => {
  const user = await requireUser();
  const full = await prisma.user.findUnique({ where: { id: user.id }, include: { department: { select: { name: true } } } });
  const me: MeDTO = { ...serializeUser(full ?? user), hasFamily: user.role === "FOUNDER" };
  return NextResponse.json(me);
});

const patchSchema = z.object({
  /** Your own name, as often as you like (owner, 2026-09-10). */
  name: z.string().trim().min(1, "Write a name").max(80).optional(),
  emailOptIn: z.boolean().optional(),
  whatsappOptIn: z.boolean().optional(),
  phone: phoneInput.optional(),
});

/** The caller's own preferences. Only self-serviceable fields live here. */
export const PATCH = route(async (req: Request) => {
  const user = await requireUser();
  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;

  const { name, emailOptIn, whatsappOptIn, phone } = parsed.data;
  // A Well Being person's name is the CEO's to change, from Well Being.
  if (name !== undefined && user.role === "PERSON") throw new HttpError(403, "Your name is changed from Well Being.");
  const data: { name?: string; emailOptIn?: boolean; whatsappOptIn?: boolean; phone?: string | null } = {};
  if (name !== undefined) data.name = name;
  if (emailOptIn !== undefined) data.emailOptIn = emailOptIn;
  if (whatsappOptIn !== undefined) data.whatsappOptIn = whatsappOptIn;
  if (phone !== undefined) data.phone = phone;

  const updated = await prisma.user.update({ where: { id: user.id }, data, include: { department: { select: { name: true } } } });
  return NextResponse.json(serializeUser(updated));
});
