import { z } from "zod";
import { NextResponse } from "next/server";
import { HEALTHS, PRIORITIES, PROJECT_PRIORITIES, ROLES, STATUSES } from "@/lib/types";

export const gateSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  done: z.boolean(),
  at: z.string().nullable().optional(),
});

export const linkSchema = z.object({
  label: z.string(),
  url: z.string().min(1),
});

/**
 * A phone number in E.164 international format (phase 32): a leading "+", then a
 * non-zero country digit and 6–14 more digits (e.g. "+916302608825"). Used for
 * the WhatsApp channel. Accepts "" or null as "clear it" — both normalize to
 * null so a blank field means "no WhatsApp number".
 */
export const E164_RE = /^\+[1-9]\d{6,14}$/;
export const phoneInput = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.union([
      z.literal(""),
      z.null(),
      z.string().regex(E164_RE, "Enter a valid international number, e.g. +916302608825"),
    ]),
  )
  .transform((v) => (v ? (v as string) : null));

/* Derived, never re-typed. These used to be four more hand-written copies of
   sets that already exist in lib/types.ts — the same shape as the bug that
   left TEAM_LEAD unable to sign in. Adding a status or a role now reaches the
   type, the UI list and the request validator in one edit. */
export const statusSchema = z.enum(STATUSES);
export const roleSchema = z.enum(ROLES);
export const prioritySchema = z.enum(PRIORITIES);
export const healthSchema = z.enum(HEALTHS);
/** Phase 48: PROJECT priority (Critical/High/Medium/Low) — coarser than task P0-P3. */
export const projectPrioritySchema = z.enum(PROJECT_PRIORITIES);

/** Phase 48: a project deadline — an ISO date(-time) string, "" or null to clear. */
export const deadlineInput = z
  .union([z.literal(""), z.null(), z.string().min(4).max(40)])
  .transform((v) => (v ? v : null));

/* Phase 5: a tool without a description and an owning lead is the kind of
   half-created thing nobody can act on later, so both are required at the
   door. Existing tools keep description "" and leadId null — the requirement
   is on creation, never retroactive. */
export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(40).nullable().optional(),
  health: healthSchema.optional(),
  gateTemplate: z.array(gateSchema).optional(),
  description: z.string().trim().min(1, "A description is required").max(4000),
  /** Optional (phase 31): a project can start without a lead and get one later. */
  leadId: z.string().min(1).optional(),
  /** Optional initial developer members (phase 11). */
  developerIds: z.array(z.string().min(1)).max(100).optional(),
  /** Phase 29/31: invite brand-new people straight into the project. Each entry
      carries a role — a new DEVELOPER is invited AND added to this project as a
      member; a new TEAM_LEAD account is created + invited (so a manager can make a
      lead here) but not added as a member. An existing email is added only if it's
      a developer. Role defaults to DEVELOPER. */
  inviteNew: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        email: z.string().trim().min(3).max(320),
        role: z.enum(["RESOURCE", "TEAM_LEAD"]).optional(),
      }),
    )
    .max(50)
    .optional(),
  /** REQUIRED since phase 16: every project lives in exactly one department. */
  departmentId: z.string().min(1, "A department is required"),
  /** Phase 48: priority + deadline, settable at creation. */
  priority: projectPrioritySchema.optional(),
  deadline: deadlineInput.optional(),
});

/** Department create/edit (phase 12; company-wide since phase 48 — creation is
    executive-only at the route, and an HOD may edit their own description). */
export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().max(40).nullable().optional(),
  orderKey: z.string().min(1).optional(),
  description: z.string().trim().max(2000).optional(),
  /** The Head of Department; null = unassigned. Executive-only at the route. */
  hodId: z.string().min(1).nullable().optional(),
});

export const updateDepartmentSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    icon: z.string().max(40).nullable(),
    orderKey: z.string().min(1),
    description: z.string().trim().max(2000),
    hodId: z.string().min(1).nullable(),
  })
  .partial();

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    icon: z.string().max(40).nullable(),
    health: healthSchema,
    gateTemplate: z.array(gateSchema),
    orderKey: z.string().min(1),
    description: z.string().trim().max(4000),
    leadId: z.string().min(1).nullable(),
    /** Move the tool into a department, or null to unfile it (phase 12). */
    departmentId: z.string().min(1).nullable(),
    /** Phase 48: priority + deadline. */
    priority: projectPrioritySchema,
    deadline: deadlineInput,
  })
  .partial();

export const createProjectNoteSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export const createTaskSchema = z.object({
  // Client-generated so an optimistic row keeps its identity — and its keyboard
  // focus — across the round trip. Constrained to a UUID so the id space stays
  // predictable and callers cannot smuggle in arbitrary primary keys.
  id: z.string().uuid().optional(),
  // Optional since phase 15: a PRIVATE task carries no projectId. The route
  // requires exactly one of a projectId (project task) or isPrivate (personal).
  projectId: z.string().min(1).optional(),
  /** Phase 15: create a personal private task (belongs to the caller, no project). */
  isPrivate: z.boolean().optional(),
  /** Phase 33: the caller's PersonalProject a private root task lives in (a subtask
      inherits its parent's). Replaces the phase-15 labelId. */
  personalProjectId: z.string().min(1).nullable().optional(),
  parentId: z.string().min(1).nullable().optional(),
  title: z.string().max(500).optional(),
  /** Phase 24: a free-form description supplied at creation (My Space "Prompt"
      composer). Only the private-task path applies it; the project path ignores it. */
  descriptionMd: z.string().max(20000).optional(),
  orderKey: z.string().min(1).optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  // Quick-add resolves these at parse time, so creation takes one round trip.
  dueDate: z.string().nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  /** Clients say "this date is a guess"; the server decides on inheritance. */
  dueProvisional: z.boolean().optional(),
});

/** Personal (private) department/project create/edit (phase 33). Caller-scoped at
    the route — a user only ever touches their own. Name only; no color/icon (the
    private space is deliberately simple). */
export const createPersonalDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  orderKey: z.string().min(1).optional(),
});
export const updatePersonalDepartmentSchema = z
  .object({ name: z.string().trim().min(1).max(80), orderKey: z.string().min(1) })
  .partial();

export const createPersonalProjectSchema = z.object({
  departmentId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  orderKey: z.string().min(1).optional(),
});
export const updatePersonalProjectSchema = z
  .object({ name: z.string().trim().min(1).max(80), orderKey: z.string().min(1) })
  .partial();

/** Phase 33: the My Space "Prompt" quick-capture (DEVELOPER-only at the route). */
export const promptSchema = z.object({
  personalProjectId: z.string().min(1),
  text: z.string().trim().min(1).max(20000),
});

/* Phase 35 — the family Routine feature v2. A manager sets up ONE person (name +
   login email/password), tracks a SEGMENTED WEEKLY HABIT GRID (each habit has a
   weekly target and a three-state daily mark), NON-NEGOTIABLES (crossed/kept per
   day), a WEIGHT MONITOR, and assigns tasks the person checks off. Days are
   "YYYY-MM-DD" (IST). */
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const dayKey = z.string().regex(DAY_KEY);

export const routinePersonCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(320),
  password: z.string().min(6).max(200),
});
export const routinePersonUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(320),
    password: z.string().min(6).max(200),
  })
  .partial();

export const segmentCreateSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const segmentUpdateSchema = z.object({ name: z.string().trim().min(1).max(80) });

export const habitCreateSchema = z.object({
  segmentId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  targetPerWeek: z.number().int().min(0).max(7).optional(),
});
export const habitUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    targetPerWeek: z.number().int().min(0).max(7),
    active: z.boolean(),
  })
  .partial();

/** The tap-to-cycle cell. value null clears the mark (back to empty). */
export const habitMarkSchema = z.object({
  habitId: z.string().min(1),
  date: dayKey,
  value: z.enum(["MET", "MISSED", "NA"]).nullable(),
});

export const nonNegotiableCreateSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const nonNegotiableUpdateSchema = z
  .object({ name: z.string().trim().min(1).max(80), active: z.boolean() })
  .partial();
// Phase 42: the MANAGER schedules whether a rule is required on a day…
export const nonNegotiableRequireSchema = z.object({
  nonNegotiableId: z.string().min(1),
  date: dayKey,
  required: z.boolean(),
});
// …and the PERSON marks whether they did it on a scheduled day.
export const nonNegotiableDoneSchema = z.object({
  nonNegotiableId: z.string().min(1),
  date: dayKey,
  done: z.boolean(),
});

export const routineTaskCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  dueDate: z.union([dayKey, z.literal(""), z.null()]).transform((v) => (v ? (v as string) : null)).optional(),
});
export const routineTaskDoneSchema = z.object({ done: z.boolean() });

export const weightCreateSchema = z.object({
  date: dayKey,
  weightKg: z.number().positive().max(500),
});
export const weightUpdateSchema = z
  .object({ date: dayKey, weightKg: z.number().positive().max(500) })
  .partial();

/* Phase 39 — routine collaboration + reminders. */
const routinePermission = z.enum(["READ_ONLY", "EDITABLE"]);
export const routineInviteSchema = z.object({
  managerId: z.string().min(1),
  permission: routinePermission,
});
export const routineCollaboratorUpdateSchema = z.object({ permission: routinePermission });

export const updateTaskSchema = z
  .object({
    title: z.string().max(500),
    descriptionMd: z.string().max(20000),
    status: statusSchema,
    priority: prioritySchema,
    dueDate: z.string().nullable(),
    gates: z.array(gateSchema),
    tags: z.array(z.string().min(1).max(40)).max(20),
    links: z.array(linkSchema).max(50),
    parentId: z.string().min(1).nullable(),
    orderKey: z.string().min(1),
    assigneeId: z.string().min(1).nullable(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
    /** Phase 15: a GROUP_TINTS key (validated at the route), or null to remove. */
    groupColor: z.string().max(40).nullable(),
    deletedAt: z.null(),
    pinnedAt: z.string().nullable(),
    // Links only, never uploads — http(s) enforced so a javascript: URL cannot
    // be stored and later rendered as an anchor.
    deliverableUrl: z
      .string()
      .trim()
      .max(2000)
      .regex(/^https?:\/\/\S+$/i, "Must be an http or https URL")
      .nullable(),
  })
  .partial();

export function badRequest(issues: unknown) {
  return NextResponse.json({ error: "Invalid request", issues }, { status: 400 });
}

export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: badRequest([{ message: "Body must be JSON" }]) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, response: badRequest(result.error.issues) };
  }
  return { ok: true, data: result.data };
}
