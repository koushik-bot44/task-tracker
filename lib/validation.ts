import { z } from "zod";
import { NextResponse } from "next/server";
import { COMMENT_TARGETS, MILESTONE_OUTCOMES, PROJECT_PRIORITIES, PROJECT_STATUSES, ROLES, TASK_STATUSES } from "@/lib/types";

/**
 * A phone number in E.164 international format (phase 32). Accepts "" or null
 * as "clear it" — both normalize to null.
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

/* Derived, never re-typed — one array per set lives in lib/types.ts. */
export const statusSchema = z.enum(TASK_STATUSES);
export const roleSchema = z.enum(ROLES);
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const projectPrioritySchema = z.enum(PROJECT_PRIORITIES);
export const milestoneOutcomeSchema = z.enum(MILESTONE_OUTCOMES);
export const commentTargetSchema = z.enum(COMMENT_TARGETS);

/** A date input — an ISO date(-time) string; "" or null clears it. */
export const dateInput = z
  .union([z.literal(""), z.null(), z.string().min(4).max(40)])
  .transform((v) => (v ? v : null));

/** Restructure: "+ New project" asks Name · Lead · Start · Deadline. People
    are added afterwards from "Add people". */
export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(40).nullable().optional(),
  description: z.string().trim().max(4000).optional(),
  leadId: z.string().min(1).nullable().optional(),
  /** REQUIRED: every project lives in exactly one department. */
  departmentId: z.string().min(1, "A department is required"),
  startDate: dateInput.optional(),
  deadline: dateInput.optional(),
  status: projectStatusSchema.optional(),
  priority: projectPrioritySchema.optional(),
});

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    icon: z.string().max(40).nullable(),
    status: projectStatusSchema,
    orderKey: z.string().min(1),
    description: z.string().trim().max(4000),
    leadId: z.string().min(1).nullable(),
    departmentId: z.string().min(1).nullable(),
    startDate: dateInput,
    deadline: dateInput,
    /** FOUNDER/DIRECTOR only (checked at the route). */
    progress: z.number().int().min(0).max(100),
    priority: projectPrioritySchema,
  })
  .partial();

/** Department create/edit (company-wide since phase 48). */
export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().max(40).nullable().optional(),
  orderKey: z.string().min(1).optional(),
  description: z.string().trim().max(2000).optional(),
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

/** Restructure: a milestone is a name + review date. */
export const createMilestoneSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  reviewDate: z.string().min(4).max(40),
});
export const updateMilestoneSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    reviewDate: z.string().min(4).max(40),
    orderKey: z.string().min(1),
  })
  .partial();
export const milestoneOutcomeInput = z.object({
  outcome: milestoneOutcomeSchema,
  note: z.string().trim().max(2000).optional(),
  /** The founder/director may set the project's % in the same breath. */
  progress: z.number().int().min(0).max(100).optional(),
});

/** Restructure: one note shape for projects, milestones and tasks. */
export const createCommentSchema = z
  .object({
    targetType: commentTargetSchema,
    targetId: z.string().min(1),
    body: z.string().trim().max(4000),
    attachmentUrl: z.string().url().max(2000).nullable().optional(),
    attachmentName: z.string().trim().max(200).nullable().optional(),
    attachmentType: z.string().trim().max(120).nullable().optional(),
  })
  .refine((v) => v.body.length > 0 || Boolean(v.attachmentUrl), { message: "Write something or attach a file" });

export const createTaskSchema = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().min(1).optional(),
  isPrivate: z.boolean().optional(),
  personalProjectId: z.string().min(1).nullable().optional(),
  parentId: z.string().min(1).nullable().optional(),
  milestoneId: z.string().min(1).nullable().optional(),
  title: z.string().max(500).optional(),
  /** My notes only; the project path ignores it. */
  descriptionMd: z.string().max(20000).optional(),
  orderKey: z.string().min(1).optional(),
  status: statusSchema.optional(),
  dueDate: z.string().nullable().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  important: z.boolean().optional(),
  dueProvisional: z.boolean().optional(),
});

/** Personal (private) department/project create/edit (phase 33). */
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

/** Phase 33: the My notes "Prompt" quick-capture (RESOURCE-only at the route). */
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
    dueDate: z.string().nullable(),
    parentId: z.string().min(1).nullable(),
    milestoneId: z.string().min(1).nullable(),
    orderKey: z.string().min(1),
    assigneeId: z.string().min(1).nullable(),
    important: z.boolean(),
    archived: z.boolean(),
    deletedAt: z.null(),
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
