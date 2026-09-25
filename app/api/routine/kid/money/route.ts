import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePerson, route } from "@/lib/session";
import { moneyEntryCreateSchema, parseBody } from "@/lib/validation";
import { buildMoneyMonth, dayKeyToDate, monthKeyOf, parseMonthKey, serializeMoney, todayKey } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 2026-09-25 (the circle): the person's side of the pocket-money ledger, kept
    by hand. GET one month (?month=YYYY-MM, default this month); POST a line the
    person writes themself — usually what they SPENT, tagged side "PERSON". */
export const GET = route(async (req: Request) => {
  const user = await requirePerson();
  const person = await prisma.person.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const raw = new URL(req.url).searchParams.get("month");
  const month = raw ? parseMonthKey(raw) : monthKeyOf(todayKey());
  if (!month) return NextResponse.json({ error: "That is not a month." }, { status: 400 });

  return NextResponse.json(await buildMoneyMonth(person.id, month));
});

export const POST = route(async (req: Request) => {
  const user = await requirePerson();
  const person = await prisma.person.findUnique({ where: { userId: user.id }, select: { id: true, name: true } });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = await parseBody(req, moneyEntryCreateSchema);
  if (!parsed.ok) return parsed.response;
  const { date, amount, kind, note } = parsed.data;
  // A ledger records what happened, not what will — nothing dated ahead of today.
  if (date > todayKey()) return NextResponse.json({ error: "That day has not come yet." }, { status: 400 });

  const entry = await prisma.moneyEntry.create({
    data: { personId: person.id, date: dayKeyToDate(date), amount, kind, note, side: "PERSON", addedByName: person.name },
  });
  return NextResponse.json(serializeMoney(entry), { status: 201 });
});
