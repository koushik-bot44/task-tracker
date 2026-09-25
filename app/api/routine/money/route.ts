import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { moneyEntryCreateSchema, parseBody } from "@/lib/validation";
import { buildMoneyMonth, dayKeyToDate, monthKeyOf, parseMonthKey, personParam, requireRoutineAccess, serializeMoney, todayKey } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 2026-09-25 (the circle): the parent side of the pocket-money ledger. GET one
    month (?month=YYYY-MM, default this month; anyone who can see the Well Being);
    POST a line — usually what was GIVEN — tagged side "PARENT" with the writer's
    name, so the CEO and a co-parent can tell their lines apart (a write). */
export const GET = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req));

  const raw = new URL(req.url).searchParams.get("month");
  const month = raw ? parseMonthKey(raw) : monthKeyOf(todayKey());
  if (!month) return NextResponse.json({ error: "That is not a month." }, { status: 400 });

  return NextResponse.json(await buildMoneyMonth(person.id, month));
});

export const POST = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });

  const parsed = await parseBody(req, moneyEntryCreateSchema);
  if (!parsed.ok) return parsed.response;
  const { date, amount, kind, note } = parsed.data;
  // A ledger records what happened, not what will — nothing dated ahead of today.
  if (date > todayKey()) return NextResponse.json({ error: "That day has not come yet." }, { status: 400 });

  const entry = await prisma.moneyEntry.create({
    data: { personId: person.id, date: dayKeyToDate(date), amount, kind, note, side: "PARENT", addedByName: actor.name },
  });
  return NextResponse.json(serializeMoney(entry), { status: 201 });
});
