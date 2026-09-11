/* Clear the test data before real use (owner, 2026-09-11).
 *
 *   npx tsx --env-file=.env.local scripts/reset-data.ts                       dry run on the clone
 *   npx tsx --env-file=.env.local scripts/reset-data.ts --apply --confirm-host=127.0.0.1
 *   npx tsx --env-file=.env       scripts/reset-data.ts                       dry run on production (read-only)
 *   npx tsx --env-file=.env       scripts/reset-data.ts --apply --confirm-host=<the Neon host>
 *
 * What stays is named in a gitignored file (see readKeep below) — the real
 * accounts, the CEO's account (its address is changed later), the projects
 * that hold real work, every department but the ones named to go. Everything else the demos and rigs made goes: the test accounts with
 * their invites, reset requests, logs, bells and Well Being data; the seeded
 * projects with their tasks, notes and meetings; every soft-deleted task; every
 * note that carries the seed marker or was written by a removed account; and
 * any stored file nothing points at afterwards.
 *
 * The dry run (default) only reads: it works out every row that would go,
 * table by table, and prints it. --apply deletes exactly those rows in ONE
 * transaction, children before parents (no hidden cascades: every table is
 * recounted before the commit and the transaction is rolled back if a count is
 * off), then writes a manifest under records/snapshots/reset-<host>-<stamp>/
 * (gitignored — it names people).
 *
 * Refuses to apply unless --confirm-host names the database host, and, off the
 * laptop, unless a prod-backup-* folder from the last three hours exists.
 */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

/**
 * Who and what stays is read from a file that is NOT in the repo (it names
 * people): records/snapshots/reset-keep.json, or --keep=<path>.
 *   { "emails": [...], "projects": [...], "removeDepartments": [...] }
 * The FOUNDER row always stays, whatever its address; every project not
 * named goes; every department not named under removeDepartments stays (its
 * head is cleared if the head goes).
 */
type Keep = { emails: string[]; projects: string[]; removeDepartments: string[] };
function readKeep(): Keep {
  const path = process.argv.slice(2).find((a) => a.startsWith("--keep="))?.split("=")[1] ?? join(process.cwd(), "records", "snapshots", "reset-keep.json");
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`no KEEP list at ${path} — write it first (emails, projects, removeDepartments); it stays out of git`);
  }
  const k = raw as Partial<Keep>;
  const list = (v: unknown) => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null);
  const emails = list(k.emails), projects = list(k.projects), removeDepartments = list(k.removeDepartments) ?? [];
  if (!emails || !projects) throw new Error(`${path} must hold "emails" and "projects" as lists of strings`);
  return { emails, projects, removeDepartments };
}
const KEEP = ((): Keep => {
  try {
    return readKeep();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
})();
const KEEP_EMAILS = KEEP.emails;
const KEEP_PROJECTS = KEEP.projects;
const REMOVE_DEPARTMENTS = KEEP.removeDepartments;
/** The invisible mark the demo chat script puts on every note it writes. */
const SEED_MARK = "​";
const UPLOADS = "/api/uploads/";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const confirmHost = args.find((a) => a.startsWith("--confirm-host="))?.split("=")[1] ?? null;
const url = process.env.DATABASE_URL ?? "";
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
const LOCAL = host === "127.0.0.1" || host === "localhost";

type Plan = {
  host: string;
  stamp: string;
  keep: { users: string[]; projects: string[]; departments: string[] };
  remove: Record<string, string[]>;
  repoint: Record<string, string[]>;
};

const idOf = (rows: { id: string }[]) => rows.map((r) => r.id);

async function plan(): Promise<{ p: Plan; sets: Record<string, string[]>; expectedLeft: Record<string, number> }> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const users = await prisma.user.findMany({ select: { id: true, email: true, name: true, role: true } });
  const founders = users.filter((u) => u.role === "FOUNDER");
  if (founders.length !== 1) throw new Error(`expected exactly one FOUNDER, found ${founders.length} — stopping`);
  const ceo = founders[0];
  const keepUserIds = new Set(users.filter((u) => KEEP_EMAILS.includes(u.email) || u.role === "FOUNDER").map((u) => u.id));
  const removedUsers = users.filter((u) => !keepUserIds.has(u.id));
  const removedUserIds = new Set(removedUsers.map((u) => u.id));
  const gone = (id: string | null | undefined) => Boolean(id && removedUserIds.has(id));
  const who = (id: string | null | undefined) => users.find((u) => u.id === id)?.email ?? "-";
  for (const e of KEEP_EMAILS) if (!users.some((u) => u.email === e)) console.log(`  note: kept address ${e} is not on this database`);

  const projects = await prisma.project.findMany({ select: { id: true, name: true, slug: true, ownerId: true, leadId: true, logoUrl: true } });
  for (const n of KEEP_PROJECTS) if (!projects.some((p) => p.name === n)) console.log(`  note: kept project "${n}" is not on this database`);
  const keptProjects = projects.filter((p) => KEEP_PROJECTS.includes(p.name));
  const removedProjects = projects.filter((p) => !KEEP_PROJECTS.includes(p.name));
  const removedProjectIds = new Set(removedProjects.map((p) => p.id));

  const milestones = await prisma.milestone.findMany({ select: { id: true, name: true, projectId: true } });
  const removedMilestones = milestones.filter((m) => removedProjectIds.has(m.projectId));
  const removedMilestoneIds = new Set(removedMilestones.map((m) => m.id));

  const personalProjects = await prisma.personalProject.findMany({ select: { id: true, name: true, ownerId: true } });
  const removedPersonalProjects = personalProjects.filter((p) => gone(p.ownerId));
  const personalDepartments = await prisma.personalDepartment.findMany({ select: { id: true, name: true, ownerId: true } });
  const removedPersonalDepartments = personalDepartments.filter((d) => gone(d.ownerId));

  const tasks = await prisma.task.findMany({
    select: { id: true, number: true, type: true, title: true, parentId: true, projectId: true, isPrivate: true, ownerId: true, personalProjectId: true, deletedAt: true, state: true, assigneeId: true, requesterId: true, givenById: true, completedById: true, resolvedById: true, closedById: true, deliverableUrl: true, assignmentGroupId: true },
  });
  const removedTaskIds = new Set<string>();
  for (const t of tasks) {
    const standaloneWithNobody = !t.projectId && !t.isPrivate && ![t.assigneeId, t.requesterId, t.givenById].some((id) => id && keepUserIds.has(id));
    if ((t.projectId && removedProjectIds.has(t.projectId)) || t.deletedAt || (t.isPrivate && (gone(t.ownerId) || t.ownerId === null)) || standaloneWithNobody) removedTaskIds.add(t.id);
  }
  // Steps follow their task, however deep.
  for (let grew = true; grew; ) {
    grew = false;
    for (const t of tasks) if (t.parentId && removedTaskIds.has(t.parentId) && !removedTaskIds.has(t.id)) { removedTaskIds.add(t.id); grew = true; }
  }
  const removedTasks = tasks.filter((t) => removedTaskIds.has(t.id));
  const keptTasks = tasks.filter((t) => !removedTaskIds.has(t.id));
  const removedNumbers = new Set(removedTasks.map((t) => t.number));

  const activities = await prisma.taskActivity.findMany({ select: { id: true, taskId: true, type: true, body: true, authorId: true, attachmentUrl: true } });
  const isNote = (a: { type: string }) => a.type === "COMMENT" || a.type === "WORK_NOTE" || a.type === "ATTACHMENT";
  const removedActivities = activities.filter((a) => removedTaskIds.has(a.taskId) || a.body.includes(SEED_MARK) || (isNote(a) && gone(a.authorId)));
  const removedActivityIds = new Set(removedActivities.map((a) => a.id));

  const comments = await prisma.comment.findMany({ select: { id: true, targetType: true, targetId: true, authorId: true, body: true, attachmentUrl: true } });
  const removedComments = comments.filter(
    (c) => gone(c.authorId) || (c.targetType === "PROJECT" && removedProjectIds.has(c.targetId)) || (c.targetType === "MILESTONE" && removedMilestoneIds.has(c.targetId)) || (c.targetType === "TASK" && removedTaskIds.has(c.targetId)),
  );
  const removedCommentIds = new Set(removedComments.map((c) => c.id));

  const attachments = await prisma.commentAttachment.findMany({ select: { id: true, name: true, url: true, activityId: true, commentId: true } });
  const removedAttachments = attachments.filter((a) => (a.activityId && removedActivityIds.has(a.activityId)) || (a.commentId && removedCommentIds.has(a.commentId)));
  const removedAttachmentIds = new Set(removedAttachments.map((a) => a.id));

  const events = await prisma.calendarEvent.findMany({ select: { id: true, title: true, date: true, createdById: true, taskId: true, projectId: true, milestoneId: true, attendees: { select: { id: true, userId: true } } } });
  const removedEvents = events.filter(
    (e) => gone(e.createdById) || (e.taskId && removedTaskIds.has(e.taskId)) || (e.projectId && removedProjectIds.has(e.projectId)) || (e.milestoneId && removedMilestoneIds.has(e.milestoneId)) || (e.attendees.length > 0 && e.attendees.every((a) => gone(a.userId))),
  );
  const removedEventIds = new Set(removedEvents.map((e) => e.id));
  const removedAttendees = events.flatMap((e) => e.attendees.filter((a) => removedEventIds.has(e.id) || gone(a.userId)));

  const persons = await prisma.person.findMany({ select: { id: true, name: true, userId: true, managerId: true } });
  const removedPersons = persons.filter((p) => gone(p.userId) || gone(p.managerId));
  const removedPersonIds = new Set(removedPersons.map((p) => p.id));
  const collaborators = await prisma.routineCollaborator.findMany({ select: { id: true, personId: true, managerId: true, invitedById: true } });
  const removedCollaborators = collaborators.filter((c) => removedPersonIds.has(c.personId) || gone(c.managerId) || gone(c.invitedById));
  const segments = await prisma.habitSegment.findMany({ where: { personId: { in: [...removedPersonIds] } }, select: { id: true } });
  const habits = await prisma.habit.findMany({ where: { segmentId: { in: idOf(segments) } }, select: { id: true } });
  const habitMarks = await prisma.habitMark.findMany({ where: { habitId: { in: idOf(habits) } }, select: { id: true } });
  const rules = await prisma.nonNegotiable.findMany({ where: { personId: { in: [...removedPersonIds] } }, select: { id: true } });
  const ruleMarks = await prisma.nonNegotiableMark.findMany({ where: { nonNegotiableId: { in: idOf(rules) } }, select: { id: true } });
  const weights = await prisma.weightEntry.findMany({ where: { personId: { in: [...removedPersonIds] } }, select: { id: true } });
  const routineTasks = await prisma.routineTask.findMany({ where: { personId: { in: [...removedPersonIds] } }, select: { id: true } });

  const invites = await prisma.invite.findMany({ select: { id: true, userId: true, createdById: true } });
  const removedInvites = invites.filter((i) => gone(i.userId));
  const repointedInvites = invites.filter((i) => !gone(i.userId) && gone(i.createdById));
  const resets = await prisma.passwordResetRequest.findMany({ select: { id: true, userId: true, resolvedById: true } });
  const removedResets = resets.filter((r) => gone(r.userId));
  const clearedResolvers = resets.filter((r) => !gone(r.userId) && gone(r.resolvedById));
  const removedIn = [...removedUserIds];
  const pushes = await prisma.pushSubscription.findMany({ where: { userId: { in: removedIn } }, select: { id: true } });
  const userEmails = await prisma.userEmail.findMany({ where: { userId: { in: removedIn } }, select: { id: true } });
  const emailLogs = await prisma.emailLog.findMany({ where: { userId: { in: removedIn } }, select: { id: true } });
  const whatsAppLogs = await prisma.whatsAppLog.findMany({ where: { userId: { in: removedIn } }, select: { id: true } });
  const loginAttempts = await prisma.loginAttempt.findMany({ select: { id: true } });

  const removedSlugs = removedProjects.map((p) => p.slug);
  const notifications = await prisma.notification.findMany({ select: { id: true, userId: true, taskId: true, eventId: true, data: true } });
  const mentionsRemoved = (data: unknown) => {
    const u = (data as { url?: string } | null)?.url ?? "";
    if (!u) return false;
    if (removedSlugs.some((s) => u.includes(`/project/${s}`) || u.includes(`/t/${s}`))) return true;
    const asTask = /[?&]task=([a-z0-9]+)/.exec(u)?.[1];
    if (asTask && removedTaskIds.has(asTask)) return true;
    const asNumber = /\/work\/(\d+)/.exec(u)?.[1];
    return Boolean(asNumber && removedNumbers.has(Number(asNumber)));
  };
  const removedNotifications = notifications.filter((n) => gone(n.userId) || (n.taskId && removedTaskIds.has(n.taskId)) || (n.eventId && removedEventIds.has(n.eventId)) || mentionsRemoved(n.data));

  const departments = await prisma.department.findMany({ select: { id: true, name: true, hodId: true, createdById: true } });
  const removedDepartments = departments.filter((d) => REMOVE_DEPARTMENTS.includes(d.name));
  const removedDepartmentIds = new Set(removedDepartments.map((d) => d.id));
  const groups = await prisma.assignmentGroup.findMany({ select: { id: true, name: true, departmentId: true, leadId: true, members: { select: { id: true, userId: true } } } });
  const removedGroups = groups.filter((g) => removedDepartmentIds.has(g.departmentId));
  const removedGroupIds = new Set(removedGroups.map((g) => g.id));
  const removedGroupMembers = groups.flatMap((g) => g.members.filter((m) => removedGroupIds.has(g.id) || gone(m.userId)));
  const categories = await prisma.taskCategory.findMany({ select: { id: true, name: true } });
  void categories; // categories point at departments with SetNull; none are removed here

  const members = await prisma.projectMember.findMany({ select: { id: true, projectId: true, userId: true } });
  const removedMembers = members.filter((m) => removedProjectIds.has(m.projectId) || gone(m.userId));

  // Files nothing will point at once the rest has gone.
  const files = await prisma.storedFile.findMany({ select: { id: true, name: true, size: true } });
  const stillUsed = new Set<string>();
  const use = (u: string | null | undefined) => {
    if (u && u.startsWith(UPLOADS)) stillUsed.add(u.slice(UPLOADS.length));
  };
  for (const a of attachments) if (!removedAttachmentIds.has(a.id)) use(a.url);
  for (const c of comments) if (!removedCommentIds.has(c.id)) use(c.attachmentUrl);
  for (const a of activities) if (!removedActivityIds.has(a.id)) use(a.attachmentUrl);
  for (const p of keptProjects) use(p.logoUrl);
  for (const t of keptTasks) use(t.deliverableUrl);
  const removedFiles = files.filter((f) => !stillUsed.has(f.id));

  // Kept rows that point at something removed.
  const projectsToCeo = keptProjects.filter((p) => gone(p.ownerId) || p.ownerId === null);
  const projectsLeadCleared = keptProjects.filter((p) => gone(p.leadId));
  const departmentsHeadCleared = departments.filter((d) => !removedDepartmentIds.has(d.id) && gone(d.hodId));
  const departmentsCreatorCleared = departments.filter((d) => !removedDepartmentIds.has(d.id) && gone(d.createdById));
  const tasksReturned = keptTasks.filter((t) => gone(t.assigneeId));
  const tasksPeopleCleared = keptTasks.filter((t) => [t.requesterId, t.givenById, t.completedById, t.resolvedById, t.closedById].some(gone) || (t.assignmentGroupId && removedGroupIds.has(t.assignmentGroupId)));
  const groupsLeadCleared = groups.filter((g) => !removedGroupIds.has(g.id) && gone(g.leadId));

  const sets: Record<string, string[]> = {
    CommentAttachment: idOf(removedAttachments),
    Comment: idOf(removedComments),
    Notification: idOf(removedNotifications),
    TaskActivity: idOf(removedActivities),
    EventAttendee: idOf(removedAttendees),
    CalendarEvent: idOf(removedEvents),
    Task: idOf(removedTasks),
    Milestone: idOf(removedMilestones),
    ProjectMember: idOf(removedMembers),
    Project: idOf(removedProjects),
    AssignmentGroupMember: idOf(removedGroupMembers),
    AssignmentGroup: idOf(removedGroups),
    PersonalProject: idOf(removedPersonalProjects),
    PersonalDepartment: idOf(removedPersonalDepartments),
    HabitMark: idOf(habitMarks),
    Habit: idOf(habits),
    HabitSegment: idOf(segments),
    NonNegotiableMark: idOf(ruleMarks),
    NonNegotiable: idOf(rules),
    WeightEntry: idOf(weights),
    RoutineTask: idOf(routineTasks),
    RoutineCollaborator: idOf(removedCollaborators),
    Person: idOf(removedPersons),
    Invite: idOf(removedInvites),
    PasswordResetRequest: idOf(removedResets),
    PushSubscription: idOf(pushes),
    EmailLog: idOf(emailLogs),
    WhatsAppLog: idOf(whatsAppLogs),
    UserEmail: idOf(userEmails),
    LoginAttempt: idOf(loginAttempts),
    Department: idOf(removedDepartments),
    User: idOf(removedUsers),
    StoredFile: idOf(removedFiles),
  };

  const label = (t: { number: number; title: string; deletedAt: Date | null; projectId: string | null; isPrivate: boolean }) =>
    `#${t.number} ${t.title.trim().slice(0, 40) || "(untitled)"}${t.deletedAt ? " [deleted]" : ""}${t.isPrivate ? " [private]" : ""}`;
  const p: Plan = {
    host,
    stamp,
    keep: {
      users: users.filter((u) => keepUserIds.has(u.id)).map((u) => `${u.email} (${u.role})`),
      projects: keptProjects.map((k) => `${k.name} — ${keptTasks.filter((t) => t.projectId === k.id && !t.parentId).length} tasks`),
      departments: departments.filter((d) => !removedDepartmentIds.has(d.id)).map((d) => d.name),
    },
    remove: {
      User: removedUsers.map((u) => `${u.email} (${u.role})`),
      Project: removedProjects.map((r) => `${r.name} (${tasks.filter((t) => t.projectId === r.id).length} tasks)`),
      Department: removedDepartments.map((d) => d.name),
      Task: removedTasks.map(label),
      TaskActivity: [`${removedActivities.filter((a) => removedTaskIds.has(a.taskId)).length} on removed tasks`, `${removedActivities.filter((a) => !removedTaskIds.has(a.taskId) && a.body.includes(SEED_MARK)).length} seed-marked notes on kept tasks`, `${removedActivities.filter((a) => !removedTaskIds.has(a.taskId) && !a.body.includes(SEED_MARK)).length} notes by removed accounts on kept tasks`],
      Comment: removedComments.map((c) => `[${c.targetType}] by ${who(c.authorId)}: "${c.body.slice(0, 30)}"`),
      CommentAttachment: removedAttachments.map((a) => a.name),
      CalendarEvent: removedEvents.map((e) => `"${e.title}" ${e.date.toISOString().slice(0, 10)} by ${who(e.createdById)}`),
      EventAttendee: [`${removedAttendees.length}`],
      Milestone: removedMilestones.map((m) => m.name),
      ProjectMember: [`${removedMembers.length}`],
      Person: removedPersons.map((r) => `${r.name} (login ${who(r.userId)}, owner ${who(r.managerId)})`),
      WellBeing: [`${segments.length} segments, ${habits.length} habits, ${habitMarks.length} marks, ${rules.length} rules, ${ruleMarks.length} rule marks, ${weights.length} weights, ${routineTasks.length} routine tasks, ${removedCollaborators.length} collaborators`],
      PersonalProject: removedPersonalProjects.map((x) => `${x.name} (${who(x.ownerId)})`),
      PersonalDepartment: removedPersonalDepartments.map((x) => `${x.name} (${who(x.ownerId)})`),
      Invite: removedInvites.map((i) => who(i.userId)),
      PasswordResetRequest: removedResets.map((r) => who(r.userId)),
      Notification: [`${removedNotifications.filter((n) => gone(n.userId)).length} of removed accounts`, `${removedNotifications.filter((n) => !gone(n.userId)).length} of kept accounts about removed tasks, meetings or projects`],
      EmailLog: [`${emailLogs.length}`],
      WhatsAppLog: [`${whatsAppLogs.length}`],
      PushSubscription: [`${pushes.length}`],
      UserEmail: [`${userEmails.length}`],
      LoginAttempt: [`${loginAttempts.length} (rate-limit rows, all)`],
      AssignmentGroup: removedGroups.map((g) => g.name),
      AssignmentGroupMember: [`${removedGroupMembers.length}`],
      StoredFile: removedFiles.map((f) => `${f.name} (${f.size} B)`),
    },
    repoint: {
      "Project.ownerId -> the CEO": projectsToCeo.map((x) => `${x.name} (was ${who(x.ownerId)})`),
      "Project.leadId -> none": projectsLeadCleared.map((x) => `${x.name} (was ${who(x.leadId)})`),
      "Department.hodId -> none": departmentsHeadCleared.map((d) => `${d.name} (was ${who(d.hodId)})`),
      "Department.createdById -> none": departmentsCreatorCleared.map((d) => d.name),
      "Task returned to the queue (holder removed)": tasksReturned.map((t) => `${label(t)} (was ${who(t.assigneeId)}, ${t.state})`),
      "Task people cleared (requester/giver/completer/resolver/closer removed)": tasksPeopleCleared.map(label),
      "Invite.createdById -> the CEO": repointedInvites.map((i) => `${who(i.userId)} (invited by ${who(i.createdById)})`),
      "PasswordResetRequest.resolvedById -> none": clearedResolvers.map((r) => who(r.userId)),
      "AssignmentGroup.leadId -> none": groupsLeadCleared.map((g) => g.name),
    },
  };

  // What every table should hold afterwards, for the post-delete recount.
  const expectedLeft: Record<string, number> = {};
  const counts: Record<string, number> = {
    CommentAttachment: attachments.length, Comment: comments.length, Notification: notifications.length, TaskActivity: activities.length,
    EventAttendee: events.reduce((n, e) => n + e.attendees.length, 0), CalendarEvent: events.length, Task: tasks.length, Milestone: milestones.length,
    ProjectMember: members.length, Project: projects.length, AssignmentGroupMember: groups.reduce((n, g) => n + g.members.length, 0), AssignmentGroup: groups.length,
    PersonalProject: personalProjects.length, PersonalDepartment: personalDepartments.length,
    HabitMark: await prisma.habitMark.count(), Habit: await prisma.habit.count(), HabitSegment: await prisma.habitSegment.count(),
    NonNegotiableMark: await prisma.nonNegotiableMark.count(), NonNegotiable: await prisma.nonNegotiable.count(), WeightEntry: await prisma.weightEntry.count(),
    RoutineTask: await prisma.routineTask.count(), RoutineCollaborator: collaborators.length, Person: persons.length, Invite: invites.length,
    PasswordResetRequest: resets.length, PushSubscription: await prisma.pushSubscription.count(), EmailLog: await prisma.emailLog.count(),
    WhatsAppLog: await prisma.whatsAppLog.count(), UserEmail: await prisma.userEmail.count(), LoginAttempt: loginAttempts.length,
    Department: departments.length, User: users.length, StoredFile: files.length,
  };
  for (const [t, ids] of Object.entries(sets)) expectedLeft[t] = counts[t] - ids.length;
  return { p, sets, expectedLeft };
}

function print(p: Plan, sets: Record<string, string[]>) {
  console.log(`\n${APPLY ? "APPLYING" : "DRY RUN"} on ${LOCAL ? "the local clone" : `PRODUCTION (${p.host})`}\n`);
  console.log("KEEP");
  console.log(`  accounts (${p.keep.users.length}): ${p.keep.users.join(", ")}`);
  console.log(`  projects (${p.keep.projects.length}): ${p.keep.projects.join("; ")}`);
  console.log(`  departments (${p.keep.departments.length}): ${p.keep.departments.join(", ")}`);
  console.log("\nREMOVE — table by table");
  for (const [table, ids] of Object.entries(sets)) {
    const detail = p.remove[table] ?? [];
    const shown = detail.length > 12 ? [...detail.slice(0, 12), `… and ${detail.length - 12} more`] : detail;
    console.log(`  ${table.padEnd(22)} ${String(ids.length).padStart(4)}${shown.length ? `   ${shown.join(" | ")}` : ""}`);
  }
  console.log(`  ${"Well Being data".padEnd(22)}      ${p.remove.WellBeing.join("")}`);
  console.log("\nKEPT ROWS CHANGED");
  for (const [what, list] of Object.entries(p.repoint)) if (list.length) console.log(`  ${what}: ${list.join("; ")}`);
}

async function apply(sets: Record<string, string[]>, expectedLeft: Record<string, number>, p: Plan) {
  const ceo = await prisma.user.findFirstOrThrow({ where: { role: "FOUNDER" }, select: { id: true } });
  const removedUsers = sets.User;
  const removedGroups = sets.AssignmentGroup;
  await prisma.$transaction(
    async (tx) => {
      const del = async (table: string, run: (ids: string[]) => Promise<{ count: number }>) => {
        const ids = sets[table];
        const { count } = ids.length ? await run(ids) : { count: 0 };
        if (count !== ids.length) throw new Error(`${table}: planned ${ids.length}, deleted ${count} — rolled back`);
        console.log(`  deleted ${table}: ${count}`);
      };
      // Children before parents, so no FK cascade ever removes a row the plan did not name.
      await del("CommentAttachment", (ids) => tx.commentAttachment.deleteMany({ where: { id: { in: ids } } }));
      await del("Comment", (ids) => tx.comment.deleteMany({ where: { id: { in: ids } } }));
      await del("Notification", (ids) => tx.notification.deleteMany({ where: { id: { in: ids } } }));
      await del("TaskActivity", (ids) => tx.taskActivity.deleteMany({ where: { id: { in: ids } } }));
      await del("EventAttendee", (ids) => tx.eventAttendee.deleteMany({ where: { id: { in: ids } } }));
      await del("CalendarEvent", (ids) => tx.calendarEvent.deleteMany({ where: { id: { in: ids } } }));
      await del("Task", (ids) => tx.task.deleteMany({ where: { id: { in: ids } } }));
      await del("Milestone", (ids) => tx.milestone.deleteMany({ where: { id: { in: ids } } }));
      await del("ProjectMember", (ids) => tx.projectMember.deleteMany({ where: { id: { in: ids } } }));
      await del("Project", (ids) => tx.project.deleteMany({ where: { id: { in: ids } } }));
      await del("AssignmentGroupMember", (ids) => tx.assignmentGroupMember.deleteMany({ where: { id: { in: ids } } }));
      await del("AssignmentGroup", (ids) => tx.assignmentGroup.deleteMany({ where: { id: { in: ids } } }));
      await del("PersonalProject", (ids) => tx.personalProject.deleteMany({ where: { id: { in: ids } } }));
      await del("PersonalDepartment", (ids) => tx.personalDepartment.deleteMany({ where: { id: { in: ids } } }));
      await del("HabitMark", (ids) => tx.habitMark.deleteMany({ where: { id: { in: ids } } }));
      await del("Habit", (ids) => tx.habit.deleteMany({ where: { id: { in: ids } } }));
      await del("HabitSegment", (ids) => tx.habitSegment.deleteMany({ where: { id: { in: ids } } }));
      await del("NonNegotiableMark", (ids) => tx.nonNegotiableMark.deleteMany({ where: { id: { in: ids } } }));
      await del("NonNegotiable", (ids) => tx.nonNegotiable.deleteMany({ where: { id: { in: ids } } }));
      await del("WeightEntry", (ids) => tx.weightEntry.deleteMany({ where: { id: { in: ids } } }));
      await del("RoutineTask", (ids) => tx.routineTask.deleteMany({ where: { id: { in: ids } } }));
      await del("RoutineCollaborator", (ids) => tx.routineCollaborator.deleteMany({ where: { id: { in: ids } } }));
      await del("Person", (ids) => tx.person.deleteMany({ where: { id: { in: ids } } }));
      await del("Invite", (ids) => tx.invite.deleteMany({ where: { id: { in: ids } } }));
      await del("PasswordResetRequest", (ids) => tx.passwordResetRequest.deleteMany({ where: { id: { in: ids } } }));
      await del("PushSubscription", (ids) => tx.pushSubscription.deleteMany({ where: { id: { in: ids } } }));
      await del("EmailLog", (ids) => tx.emailLog.deleteMany({ where: { id: { in: ids } } }));
      await del("WhatsAppLog", (ids) => tx.whatsAppLog.deleteMany({ where: { id: { in: ids } } }));
      await del("UserEmail", (ids) => tx.userEmail.deleteMany({ where: { id: { in: ids } } }));
      await del("LoginAttempt", (ids) => tx.loginAttempt.deleteMany({ where: { id: { in: ids } } }));

      // Kept rows that pointed at someone removed: hand over or clear BEFORE the accounts go,
      // so the two relations that refuse a delete (Invite.createdBy, CalendarEvent.createdBy) never fire.
      if (removedUsers.length) {
        await tx.invite.updateMany({ where: { createdById: { in: removedUsers } }, data: { createdById: ceo.id } });
        await tx.project.updateMany({ where: { OR: [{ ownerId: { in: removedUsers } }, { ownerId: null }] }, data: { ownerId: ceo.id } });
        await tx.project.updateMany({ where: { leadId: { in: removedUsers } }, data: { leadId: null } });
        await tx.department.updateMany({ where: { hodId: { in: removedUsers } }, data: { hodId: null } });
        await tx.department.updateMany({ where: { createdById: { in: removedUsers } }, data: { createdById: null } });
        await tx.assignmentGroup.updateMany({ where: { leadId: { in: removedUsers } }, data: { leadId: null } });
        await tx.passwordResetRequest.updateMany({ where: { resolvedById: { in: removedUsers } }, data: { resolvedById: null } });
        // A task whose holder goes returns to the queue; the record keeps its history.
        await tx.task.updateMany({ where: { assigneeId: { in: removedUsers }, state: { in: ["IN_PROGRESS", "ASSIGNED"] } }, data: { state: "NEW", status: "TODO" } });
        await tx.task.updateMany({ where: { assigneeId: { in: removedUsers } }, data: { assigneeId: null, assignedAt: null } });
        await tx.task.updateMany({ where: { requesterId: { in: removedUsers } }, data: { requesterId: null } });
        await tx.task.updateMany({ where: { givenById: { in: removedUsers } }, data: { givenById: null } });
        await tx.task.updateMany({ where: { completedById: { in: removedUsers } }, data: { completedById: null } });
        await tx.task.updateMany({ where: { resolvedById: { in: removedUsers } }, data: { resolvedById: null } });
        await tx.task.updateMany({ where: { closedById: { in: removedUsers } }, data: { closedById: null } });
      }
      if (removedGroups.length) await tx.task.updateMany({ where: { assignmentGroupId: { in: removedGroups } }, data: { assignmentGroupId: null } });

      await del("Department", (ids) => tx.department.deleteMany({ where: { id: { in: ids } } }));
      await del("User", (ids) => tx.user.deleteMany({ where: { id: { in: ids } } }));
      await del("StoredFile", (ids) => tx.storedFile.deleteMany({ where: { id: { in: ids } } }));

      // Every table recounted: a hidden cascade would show here, and roll everything back.
      const after: Record<string, number> = {
        CommentAttachment: await tx.commentAttachment.count(), Comment: await tx.comment.count(), Notification: await tx.notification.count(), TaskActivity: await tx.taskActivity.count(),
        EventAttendee: await tx.eventAttendee.count(), CalendarEvent: await tx.calendarEvent.count(), Task: await tx.task.count(), Milestone: await tx.milestone.count(),
        ProjectMember: await tx.projectMember.count(), Project: await tx.project.count(), AssignmentGroupMember: await tx.assignmentGroupMember.count(), AssignmentGroup: await tx.assignmentGroup.count(),
        PersonalProject: await tx.personalProject.count(), PersonalDepartment: await tx.personalDepartment.count(), HabitMark: await tx.habitMark.count(), Habit: await tx.habit.count(),
        HabitSegment: await tx.habitSegment.count(), NonNegotiableMark: await tx.nonNegotiableMark.count(), NonNegotiable: await tx.nonNegotiable.count(), WeightEntry: await tx.weightEntry.count(),
        RoutineTask: await tx.routineTask.count(), RoutineCollaborator: await tx.routineCollaborator.count(), Person: await tx.person.count(), Invite: await tx.invite.count(),
        PasswordResetRequest: await tx.passwordResetRequest.count(), PushSubscription: await tx.pushSubscription.count(), EmailLog: await tx.emailLog.count(), WhatsAppLog: await tx.whatsAppLog.count(),
        UserEmail: await tx.userEmail.count(), LoginAttempt: await tx.loginAttempt.count(), Department: await tx.department.count(), User: await tx.user.count(), StoredFile: await tx.storedFile.count(),
      };
      const off = Object.entries(after).filter(([t, n]) => n !== expectedLeft[t]);
      if (off.length) throw new Error(`recount off, rolled back: ${off.map(([t, n]) => `${t} has ${n}, expected ${expectedLeft[t]}`).join("; ")}`);
      console.log("  recount: every table holds exactly what the plan leaves");
    },
    { timeout: 600_000, maxWait: 30_000 },
  );
  const dir = join(process.cwd(), "records", "snapshots", `reset-${p.host.replace(/[^a-z0-9.-]/gi, "_")}-${p.stamp}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ ...p, counts: Object.fromEntries(Object.entries(sets).map(([t, ids]) => [t, ids.length])), ids: sets }, null, 1));
  console.log(`\nmanifest: ${dir}/manifest.json`);
}

function freshBackupExists(): boolean {
  const dir = join(process.cwd(), "records", "snapshots");
  try {
    return readdirSync(dir).some((f) => f.startsWith("prod-backup-") && Date.now() - statSync(join(dir, f)).mtimeMs < 3 * 60 * 60 * 1000);
  } catch {
    return false;
  }
}

async function main() {
  if (!host) throw new Error("DATABASE_URL is not set — run with --env-file=.env.local (clone) or --env-file=.env (production)");
  if (APPLY) {
    if (!confirmHost) throw new Error(`--apply needs --confirm-host=${host}`);
    if (confirmHost !== host) throw new Error(`--confirm-host says "${confirmHost}" but the database host is "${host}" — refusing`);
    if (!LOCAL && !freshBackupExists()) throw new Error("no records/snapshots/prod-backup-* from the last three hours — back up first (scripts/prod-backup.ts)");
  }
  const { p, sets, expectedLeft } = await plan();
  print(p, sets);
  if (!APPLY) {
    console.log("\nDry run: nothing was changed. Add --apply --confirm-host=<host> to do it.");
    return;
  }
  console.log("\nApplying in one transaction …");
  await apply(sets, expectedLeft, p);
  console.log("done");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
