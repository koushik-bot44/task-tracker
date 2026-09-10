/* End-to-end pass over everything touched on 2026-09-08, against the running
   dev server. Throwaway data, cleaned up at the end. */
import { PrismaClient } from "@prisma/client";
import { istDayKey } from "../lib/timezone";

const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const prisma = new PrismaClient();

let pass = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    fails.push(`${name}${detail ? `  (${detail})` : ""}`);
    console.log(`FAIL  ${name}${detail ? `  (${detail})` : ""}`);
  }
}

async function signIn(email: string, password = "orbit123"): Promise<string> {
  const r = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`sign-in ${email}: ${r.status}`);
  return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}
const api = (cookie: string) => async (path: string, init?: RequestInit) => {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", cookie, ...(init?.headers ?? {}) },
  });
  const text = await r.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: r.status, body };
};

async function main() {
  const ceo = api(await signIn("founder@orbit.local"));
  const lead = api(await signIn("lead@orbit.local"));
  const dev = api(await signIn("dev@orbit.local"));

  const dept = await prisma.department.findFirst({ where: { name: "Development" }, select: { id: true } });
  const leadUser = await prisma.user.findUnique({ where: { email: "lead@orbit.local" }, select: { id: true } });
  const devUser = await prisma.user.findUnique({ where: { email: "dev@orbit.local" }, select: { id: true } });

  // ── 1. A project, a milestone, and one shared day ───────────────────────
  const proj = await ceo("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name: "E2E throwaway", departmentId: dept!.id, startDate: "2026-09-08", deadline: "2026-10-30", leadId: leadUser!.id }),
  });
  check("CEO creates a project", proj.status === 201 || proj.status === 200, `status ${proj.status}`);
  const projectId: string = proj.body.id;

  const ms = await ceo("/api/milestones", {
    method: "POST",
    body: JSON.stringify({ projectId, name: "E2E box", reviewDate: "2026-09-25" }),
  });
  check("a milestone is added", ms.status === 201 || ms.status === 200, `status ${ms.status}`);
  const milestoneId: string = ms.body.id;

  let row = await prisma.milestone.findUnique({ where: { id: milestoneId }, select: { reviewDate: true, reviewEvent: { select: { id: true, date: true, title: true } } } });
  check("the review lands on the day asked for", istDayKey(row!.reviewDate) === "2026-09-25", istDayKey(row!.reviewDate));
  check("its meeting is on the same day", Boolean(row!.reviewEvent) && istDayKey(row!.reviewEvent!.date) === "2026-09-25", row!.reviewEvent ? istDayKey(row!.reviewEvent.date) : "no meeting");

  // ── 2. Tasks typed into the box take the box's day ──────────────────────
  for (const title of ["E2e Task One", "E2e Task Two"]) {
    const t = await ceo("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ projectId, milestoneId, title, dueDate: row!.reviewDate.toISOString(), dueProvisional: true, parentId: null }),
    });
    if (t.status !== 201 && t.status !== 200) check(`task "${title}" created`, false, `status ${t.status} ${JSON.stringify(t.body).slice(0, 90)}`);
  }
  let tasks = await prisma.task.findMany({ where: { milestoneId, deletedAt: null }, select: { title: true, dueDate: true, dueProvisional: true } });
  check("tasks sit on the box's day", tasks.length === 2 && tasks.every((t) => t.dueDate && istDayKey(t.dueDate) === "2026-09-25"), `${tasks.length} tasks`);

  // ── 3. Moving the review takes the meeting AND the tasks with it ────────
  const moved = await ceo(`/api/milestones/${milestoneId}`, { method: "PATCH", body: JSON.stringify({ reviewDate: "2026-10-02" }) });
  check("the review moves", moved.status === 200, `status ${moved.status}`);
  row = await prisma.milestone.findUnique({ where: { id: milestoneId }, select: { reviewDate: true, reviewEvent: { select: { id: true, title: true, date: true } } } });
  tasks = await prisma.task.findMany({ where: { milestoneId, deletedAt: null }, select: { title: true, dueDate: true, dueProvisional: true } });
  check("the meeting followed the review", istDayKey(row!.reviewEvent!.date) === "2026-10-02", istDayKey(row!.reviewEvent!.date));
  check("the tasks followed the review", tasks.every((t) => t.dueDate && istDayKey(t.dueDate) === "2026-10-02"), tasks.map((t) => istDayKey(t.dueDate!)).join(","));

  // A date somebody set by hand must NOT be dragged along.
  await prisma.task.updateMany({ where: { milestoneId, title: "E2e Task Two" }, data: { dueProvisional: false, dueDate: new Date("2026-10-09T00:00:00.000Z") } });
  await ceo(`/api/milestones/${milestoneId}`, { method: "PATCH", body: JSON.stringify({ reviewDate: "2026-10-05" }) });
  tasks = await prisma.task.findMany({ where: { milestoneId, deletedAt: null }, select: { title: true, dueDate: true, dueProvisional: true } });
  const byHand = tasks.find((t) => t.title === "E2e Task Two")!;
  const auto = tasks.find((t) => t.title === "E2e Task One")!;
  check("a hand-set date is left alone", istDayKey(byHand.dueDate!) === "2026-10-09", istDayKey(byHand.dueDate!));
  check("an automatic date still follows", istDayKey(auto.dueDate!) === "2026-10-05", istDayKey(auto.dueDate!));

  // ── 4. Postpone: the box, the meeting and the tasks stay together ───────
  const eventId = row!.reviewEvent!.id;
  const slots = await ceo(`/api/events/${eventId}/reschedule`);
  check("Postpone offers three days", Array.isArray(slots.body?.slots) && slots.body.slots.length === 3, `${slots.body?.slots?.length} slots`);
  const pick = String(slots.body.slots[0]).slice(0, 10);
  const post = await ceo(`/api/events/${eventId}/reschedule`, { method: "POST", body: JSON.stringify({ date: pick }) });
  check("the meeting is postponed", post.status === 200, `status ${post.status}`);
  row = await prisma.milestone.findUnique({ where: { id: milestoneId }, select: { reviewDate: true, reviewEvent: { select: { id: true, title: true, date: true } } } });
  tasks = await prisma.task.findMany({ where: { milestoneId, deletedAt: null, dueProvisional: true }, select: { title: true, dueDate: true, dueProvisional: true } });
  check("the box moved with it", istDayKey(row!.reviewDate) === pick, `${istDayKey(row!.reviewDate)} vs ${pick}`);
  check("its tasks moved with it", tasks.every((t) => istDayKey(t.dueDate!) === pick), tasks.map((t) => istDayKey(t.dueDate!)).join(","));
  const movedNotices = await prisma.notification.count({ where: { title: { startsWith: "Moved: " }, body: { contains: "E2E box" } } });
  check("one 'Moved' notice per person, not a pile", movedNotices <= 3, `${movedNotices} notices`);

  // ── 5. Today only carries today and tomorrow ────────────────────────────
  let today = await ceo("/api/today");
  const listed = (today.body.meetings ?? []).map((m: any) => m.id);
  check("a review weeks away stays off Today", !listed.includes(eventId), `${listed.length} meetings listed`);

  // …unless somebody can't make it and the CEO can move it.
  const attendee = await prisma.eventAttendee.findFirst({ where: { eventId }, select: { id: true, userId: true } });
  await prisma.eventAttendee.update({ where: { id: attendee!.id }, data: { response: "NO", respondedAt: new Date() } });
  today = await ceo("/api/today");
  check("a 'Can't' brings it to the CEO's Today", (today.body.meetings ?? []).some((m: any) => m.id === eventId));

  // ── 6. Meetings without a project ───────────────────────────────────────
  const company = await ceo("/api/events", {
    method: "POST",
    body: JSON.stringify({ title: "E2E company meeting", date: "2026-09-24", startTime: "10:00", projectId: null, attendeeIds: [leadUser!.id, devUser!.id] }),
  });
  check("a company meeting needs no project", company.status === 201 || company.status === 200, `status ${company.status}`);
  const companyId = company.body?.id;
  const edited = await ceo(`/api/events/${companyId}`, { method: "PATCH", body: JSON.stringify({ attendeeIds: [leadUser!.id] }) });
  check("its people can be changed", edited.status === 200, `status ${edited.status}`);
  const cal = await ceo("/api/calendar?from=2026-09-24&to=2026-09-24");
  check("it shows on the calendar", (cal.body.events ?? []).some((e: any) => e.id === companyId));
  const oneToOne = await ceo("/api/events", {
    method: "POST",
    body: JSON.stringify({ title: "E2E one-on-one", date: "2026-09-24", startTime: "16:00", projectId: null, attendeeIds: [devUser!.id] }),
  });
  check("a one-on-one works", oneToOne.status === 201 || oneToOne.status === 200, `status ${oneToOne.status}`);
  const noBody = await ceo("/api/events", {
    method: "POST",
    body: JSON.stringify({ title: "E2E nobody", date: "2026-09-24", startTime: "16:00", projectId: null, attendeeIds: [] }),
  });
  check("a meeting with nobody is refused", noBody.status === 400, `status ${noBody.status}`);

  // ── 7. Notes: delete rules ──────────────────────────────────────────────
  const leadNote = await lead("/api/comments", {
    method: "POST",
    body: JSON.stringify({ targetType: "PROJECT", targetId: projectId, body: "E2E note from the lead https://example.com/x" }),
  });
  check("the lead writes a note", leadNote.status === 201 || leadNote.status === 200, `status ${leadNote.status}`);
  const devDelete = await dev(`/api/comments/${leadNote.body.id}`, { method: "DELETE" });
  check("a member cannot delete someone else's note", devDelete.status === 403, `status ${devDelete.status}`);
  const ceoDelete = await ceo(`/api/comments/${leadNote.body.id}`, { method: "DELETE" });
  check("the CEO can delete anyone's note", ceoDelete.status === 200, `status ${ceoDelete.status}`);

  // ── 8. Set a password by hand ───────────────────────────────────────────
  const made = await ceo("/api/users", {
    method: "POST",
    body: JSON.stringify({ name: "E2E Person", email: "e2e-person@orbit.local", role: "RESOURCE", departmentId: dept!.id }),
  });
  check("the CEO invites someone", made.status === 201 || made.status === 200, `status ${made.status}`);
  const newId = made.body?.user?.id ?? made.body?.id;
  const setPw = await ceo(`/api/users/${newId}/password`, { method: "POST", body: JSON.stringify({ password: "Handover@2026" }) });
  check("a password can be set by hand", setPw.status === 200, `status ${setPw.status}`);
  const asThem = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "e2e-person@orbit.local", password: "Handover@2026" }),
  });
  check("they can sign in with it at once", asThem.status === 200, `status ${asThem.status}`);
  const stillPending = await prisma.user.findUnique({ where: { id: newId }, select: { status: true, invite: { select: { id: true } } } });
  check("the invite is spent, the account is active", stillPending?.status === "ACTIVE" && !stillPending.invite, `${stillPending?.status}, invite ${stillPending?.invite ? "still there" : "gone"}`);
  const leadTries = await lead(`/api/users/${newId}/password`, { method: "POST", body: JSON.stringify({ password: "nope123456" }) });
  check("a team lead cannot set passwords", leadTries.status === 403, `status ${leadTries.status}`);
  const ceoTarget = await prisma.user.findUnique({ where: { email: "founder@orbit.local" }, select: { id: true } });
  const atCeo = await lead(`/api/users/${ceoTarget!.id}/password`, { method: "POST", body: JSON.stringify({ password: "nope123456" }) });
  check("nobody can set the CEO's password", atCeo.status === 403, `status ${atCeo.status}`);

  // ── 9. Departments ──────────────────────────────────────────────────────
  const newDept = await ceo("/api/departments", { method: "POST", body: JSON.stringify({ name: "E2E dept", color: "#4ade80" }) });
  check("the CEO creates a department", newDept.status === 201 || newDept.status === 200, `status ${newDept.status}`);
  const delEmpty = await ceo(`/api/departments/${newDept.body.id}`, { method: "DELETE" });
  check("an empty department can be deleted", delEmpty.status === 200, `status ${delEmpty.status}`);
  const delFull = await ceo(`/api/departments/${dept!.id}`, { method: "DELETE" });
  check("a department holding projects is refused", delFull.status === 409, `status ${delFull.status}`);

  // ── 10. A review after the project deadline ─────────────────────────────
  const late = await ceo("/api/milestones", {
    method: "POST",
    body: JSON.stringify({ projectId, name: "E2E late box", reviewDate: "2026-12-25" }),
  });
  check("a review past the deadline is still allowed (a slipped project needs it)", late.status === 201, `status ${late.status}`);

  // ── 11. An important task carries its star through the API ──────────────
  const starred = await ceo("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ projectId, milestoneId, title: "E2e Important", important: true, parentId: null }),
  });
  check("a task can be marked important", starred.status === 201 && starred.body.important === true, `status ${starred.status}`);
  const taskList = await ceo(`/api/tasks?projectId=${projectId}`);
  const starRow = (Array.isArray(taskList.body) ? taskList.body : taskList.body?.tasks ?? []).find((t: any) => t.title === "E2e Important");
  check("the box's rows carry the star", starRow?.important === true, JSON.stringify(starRow?.important));

  // ── teardown ────────────────────────────────────────────────────────────
  await prisma.calendarEvent.deleteMany({ where: { OR: [{ projectId }, { title: { startsWith: "E2E " } }] } });
  await prisma.task.deleteMany({ where: { projectId } });
  await prisma.milestone.deleteMany({ where: { projectId } });
  await prisma.comment.deleteMany({ where: { targetId: projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.notification.deleteMany({ where: { OR: [{ title: { contains: "E2E" } }, { body: { contains: "E2E" } }] } });
  if (newId) {
    await prisma.invite.deleteMany({ where: { userId: newId } });
    await prisma.emailLog.deleteMany({ where: { userId: newId } });
    await prisma.notification.deleteMany({ where: { userId: newId } });
    await prisma.eventAttendee.deleteMany({ where: { userId: newId } });
    await prisma.user.deleteMany({ where: { id: newId } });
  }
  await prisma.department.deleteMany({ where: { name: "E2E dept" } });

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) for (const f of fails) console.log("  ✗", f);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
