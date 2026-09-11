import { NextResponse } from "next/server";
import { z } from "zod";
import { invitePeople } from "@/lib/invite-people";
import { requireUser, route } from "@/lib/session";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  people: z
    .array(
      z.object({
        name: z.string().trim().max(80).optional(),
        /** The first address gets the invite; any of them signs them in. */
        emails: z.array(z.string().trim().min(3).max(320)).min(1).max(10),
        /** Left out: a Team member. Never the CEO, the admin or a Well Being person. */
        role: z.enum(["CO_FOUNDER", "HOD", "MANAGER", "TEAM_LEAD", "RESOURCE"]).nullable().optional(),
        departmentId: z.string().min(1).nullable().optional(),
      }),
    )
    .min(1)
    .max(50),
});

/** Invite several people at once, each with a position or none, each placed or not (owner, 2026-09-11). */
export const POST = route(async (req: Request) => {
  const actor = await requireUser();
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const people = await invitePeople(actor, parsed.data.people);
  return NextResponse.json({ people }, { status: 201 });
});
