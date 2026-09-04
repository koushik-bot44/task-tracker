import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { serializeUser } from "@/lib/serialize";
import { requireUser, route } from "@/lib/session";
import { parseBody, phoneInput } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who the caller is, for the header chip and role-aware UI. */
export const GET = route(async () => {
  const user = await requireUser();
  return NextResponse.json(serializeUser(user));
});

// All optional — a partial update of the caller's own preferences. `phone`
// normalizes "" / null to null (clears it); an invalid non-empty value is a 400.
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

  const updated = await prisma.user.update({ where: { id: user.id }, data });
  return NextResponse.json(serializeUser(updated));
});
