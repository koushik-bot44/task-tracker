import { NextResponse } from "next/server";
import { generateKeyBetween } from "fractional-indexing";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { requireManager, route } from "@/lib/session";
import { parseBody, routinePersonCreateSchema } from "@/lib/validation";
import { DEFAULT_SEGMENTS, buildOverview, getAccessibleRoutines, getManagerPerson, listRoutineCollaborators, personParam, todayKey, weekStartKey } from "@/lib/routine";
import type { RoutineOverviewDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Routine feature v2 (phase 35) — MANAGER only, scoped to the manager's OWN
 * person. GET returns the calm weekly view: the person, the segmented habit grid
 * (with each habit's three-state marks + weekly tally) for the requested week,
 * the non-negotiables, tasks, and the full weight history for the trend — or
 * { person: null } when no person has been added yet. POST creates the one person
 * and its walled-off PERSON login, seeding a sensible default grid, in one tx.
 */
export const GET = route(async (req: Request) => {
  const actor = await requireManager();
  const today = todayKey();

  // Phase 39: a manager sees their OWN person + any routines they collaborate on.
  const routines = await getAccessibleRoutines(actor.id);
  const switcher = routines.map((r) => ({ personId: r.person.id, name: r.person.name, role: r.role }));
  const wanted = personParam(req);
  const match = wanted ? routines.find((r) => r.person.id === wanted) : routines[0];

  // Asking for a SPECIFIC routine you can't reach is a 404 (isolation). The empty
  // state below is only for a manager with NO routine at all (no ?person selector).
  if (wanted && !match) {
    return NextResponse.json({ error: "No Well Being here." }, { status: 404 });
  }
  if (!match) {
    const empty: RoutineOverviewDTO = {
      person: null,
      today,
      week: { weekStart: weekStartKey(today), days: [] },
      segments: [],
      nonNegotiables: [],
      tasks: [],
      weights: [],
      monthlyWeights: [],
      summary: { segments: [], overallDaysMet: 0, overallTarget: 0, missed: 0 },
      role: null,
      routines: switcher,
      collaborators: [],
    };
    return NextResponse.json(empty);
  }

  // ?week=YYYY-MM-DD selects any week (history browsing); default = this week.
  const weekParam = new URL(req.url).searchParams.get("week");
  const mondayKey = weekStartKey(weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : today);

  const overview = await buildOverview(match.person, mondayKey);
  // The "Monitoring managers" panel is owner-only.
  const collaborators = match.role === "OWNER" ? await listRoutineCollaborators(match.person.id) : [];
  return NextResponse.json({ ...overview, today, role: match.role, routines: switcher, collaborators } satisfies RoutineOverviewDTO);
});

export const POST = route(async (req: Request) => {
  const actor = await requireManager();

  const existing = await getManagerPerson(actor.id);
  if (existing) {
    return NextResponse.json({ error: "You already have a person. Only one is allowed." }, { status: 409 });
  }

  const parsed = await parseBody(req, routinePersonCreateSchema);
  if (!parsed.ok) return parsed.response;
  const { name, password } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
  }

  // The person's login is set directly by the manager (no email onboarding).
  const passwordHash = await hashPassword(password);
  // The seed does ~18 sequential writes (user + person + 4 segments + 12 habits);
  // over a slow Neon pooler that can exceed Prisma's default 5s interactive-tx
  // timeout ("Transaction not found"), so give it comfortable headroom. Still one
  // atomic unit — a person is never created with a half-seeded grid.
  const person = await prisma.$transaction(
    async (tx) => {
      const user = await tx.user.create({ data: { email, name, role: "PERSON", status: "ACTIVE", passwordHash } });
      const created = await tx.person.create({ data: { managerId: actor.id, userId: user.id, name } });
      // Seed the default segmented grid so the manager starts from a full sheet.
      let segKey = generateKeyBetween(null, null);
      for (const seg of DEFAULT_SEGMENTS) {
        const segment = await tx.habitSegment.create({ data: { personId: created.id, name: seg.name, orderKey: segKey } });
        let habitKey = generateKeyBetween(null, null);
        for (const h of seg.habits) {
          await tx.habit.create({ data: { segmentId: segment.id, name: h.name, targetPerWeek: h.targetPerWeek, orderKey: habitKey } });
          habitKey = generateKeyBetween(habitKey, null);
        }
        segKey = generateKeyBetween(segKey, null);
      }
      return created;
    },
    { timeout: 20000, maxWait: 8000 },
  );

  return NextResponse.json({ id: person.id, name: person.name, loginEmail: email }, { status: 201 });
});
