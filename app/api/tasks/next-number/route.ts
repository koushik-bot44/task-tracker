import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The number a new record will carry, drawn before anything is written (owner,
 * 2026-09-15: "assign the number initially"). It comes from the very sequence
 * the table's own default draws from, so the number on screen is the number
 * saved, and two people opening the form at once are never handed the same one.
 *
 * A form that is opened and abandoned leaves its number unused — a gap in the
 * numbering is the price of showing the number before the record exists.
 */
export const GET = route(async () => {
  await requireUser();
  const [row] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT nextval('"Task_number_seq"') AS n`;
  return NextResponse.json({ number: Number(row.n) });
});
