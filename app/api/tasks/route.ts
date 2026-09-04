import { NextResponse } from "next/server";
import { generateKeyBetween } from "fractional-indexing";
import { prisma } from "@/lib/prisma";
import { freshGatesFromTemplate } from "@/lib/gates";
import { COMPLETED_BY_SELECT, serializeTask } from "@/lib/serialize";
import { isLeadOrAbove } from "@/lib/permissions";
import { HttpError, requireUser, route } from "@/lib/session";
import { visibleProjectIds } from "@/lib/project-visibility";
import { badRequest, createTaskSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Flat list for one project; the client assembles the tree. `?view=all` widens
 * that to every project, which is what Focus and the Changelog need — both
 * span tools, and both have to walk ancestors to build a path.
 */
export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;

  // Personal private space (phase 15): the caller's own private tasks and
  // nothing else. Checked before visibleProjectIds — which throws for an admin —
  // because every role, admin included, has their own isolated private space.
  if (params.get("scope") === "private") {
    const rows = await prisma.task.findMany({
      where: { ownerId: user.id, isPrivate: true, deletedAt: null },
      orderBy: { orderKey: "asc" },
      include: COMPLETED_BY_SELECT,
    });
    return NextResponse.json(rows.map(serializeTask));
  }

  const visible = await visibleProjectIds(user);

  if (params.get("view") === "all") {
    const all = await prisma.task.findMany({
      // A developer's cross-project view is limited to projects they can see.
      // isPrivate:false keeps personal private tasks (phase 15) out of this
      // all-projects list — for a lead the projectId clause is empty, so this
      // guard is what excludes them from Focus and the Changelog.
      where: { deletedAt: null, isPrivate: false, ...(visible ? { projectId: { in: [...visible] } } : {}) },
      orderBy: { orderKey: "asc" },
      include: COMPLETED_BY_SELECT,
    });
    return NextResponse.json(all.map(serializeTask));
  }

  const projectId = params.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }
  // Don't disclose a project a developer isn't a member of.
  if (visible && !visible.has(projectId)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const tasks = await prisma.task.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { orderKey: "asc" },
    include: COMPLETED_BY_SELECT,
  });

  return NextResponse.json(tasks.map(serializeTask));
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();

  const parsed = await parseBody(req, createTaskSchema);
  if (!parsed.ok) return parsed.response;

  // PRIVATE personal task (phase 15): owned by the caller, filed under no
  // project, never assigned. Its own pipeline so none of the project rules
  // (visibility, gate template, assignment, required date) apply.
  if (parsed.data.isPrivate) {
    return createPrivateTask(user.id, parsed.data);
  }

  const {
    id,
    projectId,
    parentId,
    title,
    orderKey,
    status,
    priority,
    dueDate,
    tags,
    assigneeId,
    dueProvisional,
  } = parsed.data;

  if (!projectId) {
    return badRequest([{ path: ["projectId"], message: "A projectId is required" }]);
  }

  // Only root tasks carry an assignee (phase 11); a subtask never does.
  if (parentId && assigneeId) {
    return NextResponse.json({ error: "Subtasks can't be assigned" }, { status: 400 });
  }

  let due: Date | null = null;
  if (dueDate) {
    due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) {
      return NextResponse.json({ error: "dueDate is not a date" }, { status: 400 });
    }
  }

  /* Provisional means "the server picked this, nobody confirmed it". The
     client says so when Enter or the board's + supplies a default; inheritance
     carries the parent's own answer. It is never inferred from the value. */
  let guessed = dueProvisional === true;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { gateTemplate: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (parentId) {
    const parent = await prisma.task.findFirst({
      where: { id: parentId, projectId, deletedAt: null },
      select: { id: true, dueDate: true, dueProvisional: true },
    });
    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 400 });
    }
    // A subtask inherits its parent's date when none is given. Sub-work lands
    // by the time the parent is due unless someone says otherwise — and an
    // inherited date is only as confirmed as the one it came from.
    if (!due) {
      due = parent.dueDate;
      if (due) guessed = parent.dueProvisional;
    }
  } else if (!due) {
    // Root tasks must be scheduled. "When do you think this lands?" is the one
    // question that makes the rest of the tracker mean anything, and a root
    // task with no answer quietly becomes work nobody is counting.
    return badRequest([
      { path: ["dueDate"], message: "An estimated completion date is required" },
    ]);
  }

  /* Assignment on creation. Only root tasks carry one (phase 11): a subtask is
     a step of the work its parent owns, so it is never assigned — not even the
     auto-assign-to-creator below, which is why this whole block is skipped when
     there is a parent. For a root task, a developer's own task is theirs by
     default — they are the one making it — and they cannot hand it to anybody
     else. Leads and managers may name anyone active. */
  let assignTo: string | null = null;
  if (!parentId) {
    if (isLeadOrAbove(user)) {
      assignTo = assigneeId ?? null;
    } else {
      assignTo = assigneeId === undefined ? user.id : assigneeId;
      if (assignTo !== null && assignTo !== user.id) {
        throw new HttpError(403, "Only a team lead can assign work to someone else");
      }
    }
  }
  if (assignTo) {
    const target = await prisma.user.findUnique({
      where: { id: assignTo },
      select: { disabledAt: true, role: true },
    });
    // Phase 35: a PERSON is not a work account and can never be assigned work.
    if (!target || target.disabledAt || target.role === "PERSON") {
      return badRequest([{ path: ["assigneeId"], message: "Must be an active user" }]);
    }
  }

  // The client normally supplies orderKey so its optimistic ordering matches
  // ours exactly; falling back to "append last" keeps the endpoint usable alone.
  let key = orderKey;
  if (!key) {
    const last = await prisma.task.findFirst({
      where: { projectId, parentId: parentId ?? null, deletedAt: null },
      orderBy: { orderKey: "desc" },
      select: { orderKey: true },
    });
    key = generateKeyBetween(last?.orderKey ?? null, null);
  }

  const task = await prisma.task.create({
    data: {
      ...(id ? { id } : {}),
      projectId,
      parentId: parentId ?? null,
      title: title ?? "",
      orderKey: key,
      status: status ?? "BACKLOG",
      priority: priority ?? "P2",
      dueDate: due,
      dueProvisional: due ? guessed : false,
      tags: tags ?? [],
      assigneeId: assignTo,
      gates: freshGatesFromTemplate(project.gateTemplate),
      ...(status === "DONE"
        ? { completedAt: new Date(), completedById: user.id }
        : {}),
    },
    include: COMPLETED_BY_SELECT,
  });

  return NextResponse.json(serializeTask(task), { status: 201 });
});

/**
 * Create a PRIVATE personal task (phase 33 — was phase 15). It belongs to the
 * caller and to no real project (projectId null, isPrivate true, ownerId the
 * caller); it is never assigned, carries no gate template, and needs no estimated
 * date. Every private task — root AND subtask — lives in one of the caller's own
 * PersonalProjects (personalProjectId), mirroring how a project task carries
 * projectId; a subtask inherits its parent's PersonalProject. Ordering and
 * identity mirror the project path.
 */
async function createPrivateTask(
  ownerId: string,
  data: {
    id?: string;
    personalProjectId?: string | null;
    parentId?: string | null;
    title?: string;
    descriptionMd?: string;
    orderKey?: string;
    status?: "BACKLOG" | "PLANNED" | "IN_PROGRESS" | "ON_HOLD" | "BLOCKED" | "DONE" | "CANCELLED";
    priority?: "P0" | "P1" | "P2" | "P3";
    dueDate?: string | null;
    tags?: string[];
  },
) {
  const { id, personalProjectId, parentId, title, descriptionMd, orderKey, status, priority, dueDate, tags } = data;

  let due: Date | null = null;
  if (dueDate) {
    due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) {
      return NextResponse.json({ error: "dueDate is not a date" }, { status: 400 });
    }
  }

  // The PersonalProject the task lands in: a subtask inherits its parent's; a root
  // must name one of the caller's own personal projects.
  let effectivePpid: string;
  if (parentId) {
    const parent = await prisma.task.findFirst({
      where: { id: parentId, ownerId, isPrivate: true, deletedAt: null },
      select: { id: true, personalProjectId: true },
    });
    if (!parent || !parent.personalProjectId) {
      return NextResponse.json({ error: "Parent not found" }, { status: 400 });
    }
    effectivePpid = parent.personalProjectId;
  } else {
    if (!personalProjectId) {
      return badRequest([{ path: ["personalProjectId"], message: "A personalProjectId is required" }]);
    }
    const pp = await prisma.personalProject.findFirst({
      where: { id: personalProjectId, ownerId },
      select: { id: true },
    });
    if (!pp) {
      return badRequest([{ path: ["personalProjectId"], message: "Unknown personal project" }]);
    }
    effectivePpid = personalProjectId;
  }

  let key = orderKey;
  if (!key) {
    const last = await prisma.task.findFirst({
      where: {
        ownerId,
        isPrivate: true,
        personalProjectId: effectivePpid,
        parentId: parentId ?? null,
        deletedAt: null,
      },
      orderBy: { orderKey: "desc" },
      select: { orderKey: true },
    });
    key = generateKeyBetween(last?.orderKey ?? null, null);
  }

  const task = await prisma.task.create({
    data: {
      ...(id ? { id } : {}),
      projectId: null,
      isPrivate: true,
      ownerId,
      personalProjectId: effectivePpid,
      parentId: parentId ?? null,
      title: title ?? "",
      descriptionMd: descriptionMd ?? "",
      orderKey: key,
      status: status ?? "BACKLOG",
      priority: priority ?? "P2",
      dueDate: due,
      dueProvisional: false,
      tags: tags ?? [],
      assigneeId: null,
      ...(status === "DONE" ? { completedAt: new Date(), completedById: ownerId } : {}),
    },
    include: COMPLETED_BY_SELECT,
  });

  return NextResponse.json(serializeTask(task), { status: 201 });
}


