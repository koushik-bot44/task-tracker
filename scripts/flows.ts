/**
 * The restructure flows F1–F5, run against a live dev server with throwaway
 * accounts (prefix `flow-`), torn down hard at the end. Never touches the
 * owner's real accounts. Run: npx tsx --env-file=.env.local scripts/flows.ts
 *
 *   F1 founder: new project → add milestone → give a task → member sees it on
 *      Today → checks it → the % is tasks done over tasks (nobody types it).
 *   F2 clock 18:00 the day before → message (b) with working links → "Can't"
 *      → Reschedule → slot → (b) again.
 *   F3 review date → Needs your OK → On track → (c) → outcome beside the box.
 *   F4 walls: PERSON 20 work endpoints 403; ADMIN project endpoints 403;
 *      My notes 404 cross-user.
 *   F5 invite with department → set password → placed on People.
 *
 * Email/WhatsApp are not configured locally, so (a)/(b)/(c) are proven through
 * their bell rows and the built bodies (dumped to records/evidence/restructure).
 */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { generateTempPassword, hashPassword } from "../lib/password";
import { issueInvite } from "../lib/invite";
import { buildTomorrow } from "../lib/tomorrow";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PREFIX = "flow-";
const CRON = process.env.CRON_SECRET ?? "";

type Actor = { label: string; id: string; email: string; cookie: string };
let pass = 0;
let fail = 0;
function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`sign-in failed for ${email}: ${res.status}`);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}
async function call(actor: Actor | null, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(actor ? { cookie: actor.cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, json };
}
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

async function main() {
  const department = await prisma.department.findFirst({ orderBy: { orderKey: "asc" } });
  if (!department) throw new Error("no department in the clone");
  const password = generateTempPassword(16);
  const hash = await hashPassword(password);
  const mk = async (label: string, role: "DIRECTOR" | "MANAGER" | "TEAM_LEAD" | "RESOURCE" | "PERSON", departmentId: string | null = department.id): Promise<Actor> => {
    const email = `${PREFIX}${label}@orbit.local`;
    const u = await prisma.user.upsert({
      where: { email },
      update: { passwordHash: hash, role, disabledAt: null, status: "ACTIVE", departmentId },
      create: { email, name: `Flow ${label}`, role, passwordHash: hash, status: "ACTIVE", departmentId },
    });
    return { label, id: u.id, email, cookie: await signIn(email, password) };
  };
  const director = await mk("director", "DIRECTOR");
  const manager = await mk("manager", "MANAGER");
  const lead = await mk("lead", "TEAM_LEAD");
  const member = await mk("member", "RESOURCE");
  const person = await mk("person", "PERSON", null);
  await prisma.person.upsert({
    where: { userId: person.id },
    update: {},
    create: { managerId: manager.id, userId: person.id, name: "Flow kid" },
  });
  const admin: Actor = { label: "admin", id: "", email: "admin@orbit.local", cookie: await signIn("admin@orbit.local", "orbit123") };

  console.log("\n── F1 founder → project → milestone → task → member → % computed ─────");
  const proj = await call(director, "POST", "/api/projects", { name: "FLOW Project", departmentId: department.id, leadId: lead.id, deadline: day(30) });
  record("F1 new project", proj.status === 201, `status ${proj.status}`);
  const projectId: string = proj.json?.id;
  const slug: string = proj.json?.slug;
  const m1 = await call(director, "POST", "/api/milestones", { projectId, name: "FLOW Milestone 1", reviewDate: day(7) });
  record("F1 add milestone creates its review meeting", m1.status === 201 && Boolean(m1.json?.reviewEventId), `status ${m1.status}`);
  const m1Id: string = m1.json?.id;
  const t = await call(director, "POST", "/api/tasks", { projectId, milestoneId: m1Id, title: "FLOW task for member", assigneeId: member.id, dueDate: `${day(7)}T00:00:00.000Z` });
  record("F1 give a task (one request = 3 taps)", t.status === 201 && t.json?.assigneeId === member.id, `status ${t.status}`);
  const taskId: string = t.json?.id;
  const bellA = await prisma.notification.findFirst({ where: { userId: member.id, type: "task_given" }, orderBy: { createdAt: "desc" } });
  record("F1 message (a) task_given reached the member's bell", Boolean(bellA), bellA?.title ?? "");
  const today = await call(member, "GET", "/api/today");
  record("F1 member sees it on Today", today.status === 200 && (today.json?.tasks ?? []).some((x: any) => x.id === taskId));
  // Owner, 2026-09-04: the tick is a lead's to give — a member says Doing, the lead marks it done.
  const doing = await call(member, "PATCH", `/api/tasks/${taskId}`, { status: "DOING" });
  record("F1 member says Doing", doing.status === 200 && doing.json?.status === "DOING", `status ${doing.status}`);
  const memberTick = await call(member, "PATCH", `/api/tasks/${taskId}`, { status: "DONE" });
  record("F1 member cannot tick it done (403)", memberTick.status === 403, `status ${memberTick.status}`);
  const done = await call(lead, "PATCH", `/api/tasks/${taskId}`, { status: "DONE" });
  record("F1 the lead ticks it done", done.status === 200 && done.json?.status === "DONE", `status ${done.status}`);
  // How far along = tasks done over the project's tasks (root tasks, not archived,
  // not deleted — the same rows the server counts in lib/projects.ts). Nobody types it.
  const computedProgress = async () => {
    const list = await call(director, "GET", `/api/tasks?projectId=${projectId}`);
    const roots = (Array.isArray(list.json) ? list.json : []).filter((x: any) => x.parentId === null && !x.archived);
    const doneCount = roots.filter((x: any) => x.status === "DONE").length;
    return { total: roots.length, done: doneCount, pct: roots.length === 0 ? 0 : Math.round((doneCount / roots.length) * 100) };
  };
  const c1 = await computedProgress();
  const p1 = await call(director, "GET", `/api/projects/${projectId}`);
  record("F1 % is tasks done over tasks (computed)", p1.status === 200 && c1.total >= 1 && p1.json?.progress === c1.pct, `${c1.done}/${c1.total} → ${c1.pct}%, got ${p1.json?.progress}`);
  // Owner, 2026-09-04: only the CEO sets the % by hand; a director is refused and the count stands.
  const typed = await call(director, "PATCH", `/api/projects/${projectId}`, { progress: 50 });
  const afterTyped = await call(director, "GET", `/api/projects/${projectId}`);
  record("F1 a director cannot set the % by hand (403, count stands)", typed.status === 403 && afterTyped.json?.progress === c1.pct, `status ${typed.status}, progress ${afterTyped.json?.progress} (computed ${c1.pct})`);
  // A manager who RUNS the project (member with canManage) can edit it.
  await call(director, "POST", `/api/projects/${projectId}/members`, { userId: manager.id, canManage: true });
  const nameByManager = await call(manager, "PATCH", `/api/projects/${projectId}`, { name: "FLOW Project" });
  record("F1 manager who runs it can rename it", nameByManager.status === 200, `status ${nameByManager.status}`);
  const review = await call(director, "GET", `/api/calendar?from=${day(6)}T00:00:00.000Z&to=${day(8)}T00:00:00.000Z`);
  const reviewEvent = (review.json?.events ?? []).find((e: any) => e.milestoneId === m1Id);
  record("F1 review meeting invites the task holder", Boolean(reviewEvent) && reviewEvent.attendees.some((a: any) => a.userId === member.id));

  console.log("\n── F2 18:00 the day before → (b) → Can't → Reschedule → (b) again ────");
  const meet = await call(director, "POST", "/api/events", { title: "FLOW Sync", date: day(1), projectId, startTime: "10:00", attendeeIds: [member.id, lead.id] });
  record("F2 schedule a meeting for tomorrow", meet.status === 201, `status ${meet.status}`);
  const eventId: string = meet.json?.id;
  // A task due tomorrow for the member too, so (b) carries both parts.
  await call(director, "POST", "/api/tasks", { projectId, milestoneId: m1Id, title: "FLOW due tomorrow", assigneeId: member.id, dueDate: `${day(1)}T00:00:00.000Z` });
  const cron = await fetch(`${BASE}/api/cron/tomorrow`, { headers: { authorization: `Bearer ${CRON}` } });
  const cronJson = (await cron.json().catch(() => null)) as any;
  record("F2 cron/tomorrow runs with the secret", cron.status === 200 && (cronJson?.people ?? 0) >= 1, `status ${cron.status}, people ${cronJson?.people}`);
  record("F2 cron/tomorrow without the secret → 401", (await fetch(`${BASE}/api/cron/tomorrow`)).status === 401);
  const bellB = await prisma.notification.findFirst({ where: { userId: member.id, type: "tomorrow" }, orderBy: { createdAt: "desc" } });
  record("F2 message (b) reached the member's bell", Boolean(bellB), bellB?.title ?? "");
  const plans = await buildTomorrow(new Date());
  const memberPlan = plans.find((p) => p.userId === member.id);
  record("F2 (b) built for the member with a meeting + a task", Boolean(memberPlan) && memberPlan!.message.email.text.includes("FLOW Sync") && memberPlan!.message.email.text.includes("FLOW due tomorrow"));
  mkdirSync("records/evidence/restructure", { recursive: true });
  if (memberPlan) {
    writeFileSync("records/evidence/restructure/message-b-email.html", memberPlan.message.email.html);
    writeFileSync("records/evidence/restructure/message-b-email.txt", memberPlan.message.email.text);
    writeFileSync("records/evidence/restructure/message-b-whatsapp.txt", memberPlan.message.whatsapp);
  }
  const noUrl = memberPlan?.message.email.text.match(/Can't: (\S+)/)?.[1];
  record("F2 (b) carries a signed Can't link", Boolean(noUrl));
  if (noUrl) {
    const landing = await fetch(noUrl.replace(/^https?:\/\/[^/]+/, BASE), { redirect: "manual" });
    record("F2 Can't link lands (public, no session)", landing.status === 200);
    const att = await prisma.eventAttendee.findUnique({ where: { eventId_userId: { eventId, userId: member.id } } });
    record("F2 Can't recorded on the attendee row", att?.response === "NO");
    const organiserBell = await prisma.notification.findFirst({ where: { userId: director.id, type: "meeting.cant" }, orderBy: { createdAt: "desc" } });
    record("F2 organiser told (bell)", Boolean(organiserBell));
  }
  const slots = await call(director, "GET", `/api/events/${eventId}/reschedule`);
  const slotDays = (slots.json?.slots ?? []).map((s: string) => new Date(s).getUTCDay());
  record("F2 three working-day slots", slots.status === 200 && slotDays.length === 3 && slotDays.every((d: number) => d >= 1 && d <= 5), JSON.stringify(slots.json?.slots ?? []));
  const moved = await call(director, "POST", `/api/events/${eventId}/reschedule`, { date: slots.json?.slots?.[0]?.slice(0, 10) });
  record("F2 reschedule moves it and re-sends (b)", moved.status === 200 && (moved.json?.resent ?? 0) >= 1 && moved.json?.event?.attendees?.every((a: any) => a.response === null), `resent ${moved.json?.resent}`);
  const bellMoved = await prisma.notification.findFirst({ where: { userId: member.id, type: "tomorrow", title: { startsWith: "Moved" } } });
  record("F2 (b) re-sent after the move (bell)", Boolean(bellMoved));

  console.log("\n── F3 review date → Needs your OK → On track → (c) ────────────────────");
  const m2 = await call(director, "POST", "/api/milestones", { projectId, name: "FLOW Milestone due", reviewDate: day(0) });
  const m2Id: string = m2.json?.id;
  const dToday = await call(director, "GET", "/api/today");
  record("F3 Needs your OK lists the review", (dToday.json?.needsOk ?? []).some((n: any) => n.milestoneId === m2Id));
  record("F3 member does NOT get Needs your OK", (today.json?.needsOk ?? []).length === 0);
  const okByManager = await call(manager, "POST", `/api/milestones/${m2Id}/outcome`, { outcome: "ON_TRACK" });
  record("F3 manager cannot record an outcome", okByManager.status === 403, `status ${okByManager.status}`);
  const ok = await call(director, "POST", `/api/milestones/${m2Id}/outcome`, { outcome: "ON_TRACK", note: "Good pace" });
  record("F3 On track recorded", ok.status === 200 && ok.json?.outcome === "ON_TRACK");
  const note = await prisma.comment.findFirst({ where: { targetType: "MILESTONE", targetId: m2Id } });
  record("F3 outcome note beside the box", Boolean(note) && note!.body.startsWith("On track"));
  const bellC = await prisma.notification.findFirst({ where: { userId: member.id, type: "review_result" }, orderBy: { createdAt: "desc" } });
  record("F3 message (c) reached the project people", Boolean(bellC), bellC?.title ?? "");
  const c3 = await computedProgress();
  record("F3 message (c) says how far along", Boolean(bellC) && bellC!.body.includes("% of tasks done") && bellC!.body.includes(`${c3.pct}% of tasks done`), `${bellC?.body ?? "(no row)"} · computed ${c3.done}/${c3.total} = ${c3.pct}%`);
  const boxes = await call(director, "GET", `/api/milestones?projectId=${projectId}`);
  record("F3 next box is current (M1 has no outcome)", (boxes.json ?? []).some((b: any) => b.id === m1Id && b.outcome === null));

  console.log("\n── F4 walls ───────────────────────────────────────────────────────────");
  const WORK: [string, string, unknown?][] = [
    ["GET", "/api/projects"], ["POST", "/api/projects", { name: "x", departmentId: department.id }], ["GET", `/api/projects/${projectId}`], ["PATCH", `/api/projects/${projectId}`, { name: "x" }],
    ["GET", `/api/projects/${projectId}/members`], ["GET", `/api/projects/${projectId}/attendees`], ["GET", "/api/tasks?view=all"], ["POST", "/api/tasks", { projectId, title: "x" }],
    ["GET", `/api/tasks/${taskId}`], ["PATCH", `/api/tasks/${taskId}`, { title: "x" }], ["GET", `/api/milestones?projectId=${projectId}`], ["POST", "/api/milestones", { projectId, name: "x", reviewDate: day(1) }],
    ["POST", `/api/milestones/${m2Id}/outcome`, { outcome: "ON_TRACK" }], ["GET", `/api/comments?targetType=PROJECT&targetId=${projectId}`], ["POST", "/api/comments", { targetType: "PROJECT", targetId: projectId, body: "x" }],
    ["GET", "/api/today"], ["GET", `/api/calendar?from=${day(0)}T00:00:00.000Z&to=${day(1)}T00:00:00.000Z`], ["POST", "/api/events", { title: "x", date: day(1), projectId, startTime: "10:00", attendeeIds: [] }],
    ["GET", "/api/departments"], ["GET", "/api/users"],
  ];
  let personWalled = 0;
  for (const [m, p, b] of WORK) {
    const r = await call(person, m, p, b);
    if (r.status === 403) personWalled++;
    else console.log(`      PERSON ${m} ${p} → ${r.status}`);
  }
  record(`F4 PERSON walled on ${WORK.length} work endpoints`, personWalled === WORK.length, `${personWalled}/${WORK.length}`);
  const adminChecks = await Promise.all([call(admin, "GET", "/api/projects"), call(admin, "GET", "/api/tasks?view=all"), call(admin, "GET", "/api/today"), call(admin, "GET", `/api/milestones?projectId=${projectId}`), call(admin, "POST", "/api/tasks", { projectId, title: "x" })]);
  record("F4 ADMIN walled on project endpoints", adminChecks.every((r) => r.status === 403), adminChecks.map((r) => r.status).join(","));
  const pd = await call(member, "POST", "/api/my-space/departments", { name: "FLOW private" });
  const pp = await call(member, "POST", "/api/my-space/projects", { departmentId: pd.json?.id, name: "FLOW private project" });
  const pt = await call(member, "POST", "/api/tasks", { isPrivate: true, personalProjectId: pp.json?.id, title: "FLOW private task" });
  record("F4 member creates a private note", pt.status === 201);
  const crossTask = await call(lead, "GET", `/api/tasks/${pt.json?.id}`);
  const crossNotes = await call(lead, "GET", `/api/comments?targetType=TASK&targetId=${pt.json?.id}`);
  const crossDir = await call(director, "GET", `/api/tasks/${pt.json?.id}`);
  record("F4 My notes 404 cross-user (lead, director)", crossTask.status === 404 && crossNotes.status === 404 && crossDir.status === 404, `${crossTask.status}/${crossNotes.status}/${crossDir.status}`);

  console.log("\n── F5 invite with department → set password → placed on People ─────────");
  const inviteEmail = `${PREFIX}invitee@orbit.local`;
  await prisma.user.deleteMany({ where: { email: inviteEmail } });
  const inv = await call(director, "POST", "/api/users", { name: "Flow invitee", email: inviteEmail, role: "RESOURCE", departmentId: department.id });
  record("F5 invite with a department", inv.status === 201 && inv.json?.user?.departmentId === department.id, `status ${inv.status}`);
  const inviteeId: string = inv.json?.user?.id;
  // The email isn't sent locally; mint the same single-use link the email carries.
  const { token } = await issueInvite({ user: { id: inviteeId, name: "Flow invitee", email: inviteEmail, role: "RESOURCE" }, inviterName: "Flow director", createdById: director.id });
  const accept = await call(null, "POST", `/api/invite/${token}/accept`, { password: "flow-pass-Xy7!" });
  record("F5 set password via the invite link", accept.status === 200);
  const people = await call(director, "GET", "/api/users");
  const placed = (people.json ?? []).find((u: any) => u.id === inviteeId);
  record("F5 placed on People under the department", placed?.status === "ACTIVE" && placed?.departmentName === department.name, `${placed?.status} · ${placed?.departmentName}`);

  console.log("\n── teardown ──────────────────────────────────────────────────────────");
  const ids = [director.id, manager.id, lead.id, member.id, person.id, inviteeId].filter(Boolean);
  await prisma.comment.deleteMany({ where: { authorId: { in: ids } } });
  await prisma.task.deleteMany({ where: { ownerId: { in: ids }, isPrivate: true } });
  if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
  await prisma.comment.deleteMany({ where: { targetId: { in: [projectId, m1Id, m2Id].filter(Boolean) } } });
  await prisma.calendarEvent.deleteMany({ where: { createdById: { in: ids } } });
  // Invite.createdById is Restrict: the invites this run issued go before their issuers.
  await prisma.invite.deleteMany({ where: { OR: [{ createdById: { in: ids } }, { userId: { in: ids } }] } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  console.log(`removed ${ids.length} throwaway accounts and their artefacts`);
  const leftAccounts = await prisma.user.count({ where: { email: { startsWith: PREFIX } } });
  const leftProjects = await prisma.project.count({ where: { name: { startsWith: "FLOW " } } });
  console.log(`remaining ${PREFIX}* accounts: ${leftAccounts}, FLOW projects: ${leftProjects}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
