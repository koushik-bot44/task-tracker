/* Work-model rig (2026-09-09): proves the rules the study found missing.
 *   npx tsx --env-file=.env.local scripts/check-work-model.ts   (dev server up)
 * Throwaway accounts (wm-*) and rows (titles "WM ") are removed in `finally`.
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PREFIX = "wm-";
let pass = 0;
let fail = 0;
type Actor = { label: string; id: string; email: string; cookie: string };

function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`sign-in ${email}: ${res.status}`);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}
async function call(actor: Actor | null, method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(actor ? { cookie: actor.cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

async function main() {
  const [deptA, deptB] = await prisma.department.findMany({ orderBy: { orderKey: "asc" }, take: 2 });
  if (!deptA || !deptB) throw new Error("need two departments on the clone");
  const password = generateTempPassword(16);
  const hash = await hashPassword(password);
  const mk = async (label: string, role: "HOD" | "MANAGER" | "TEAM_LEAD" | "RESOURCE", departmentId: string): Promise<Actor> => {
    const email = `${PREFIX}${label}@orbit.local`;
    const u = await prisma.user.upsert({
      where: { email },
      update: { passwordHash: hash, role, disabledAt: null, status: "ACTIVE", departmentId },
      create: { email, name: `WM ${label}`, role, passwordHash: hash, status: "ACTIVE", departmentId },
    });
    return { label, id: u.id, email, cookie: await signIn(email, password) };
  };
  const ceoRow = await prisma.user.findFirst({ where: { role: "FOUNDER" }, select: { id: true, email: true } });
  if (!ceoRow) throw new Error("no CEO on the clone");
  const ceo: Actor = { label: "ceo", id: ceoRow.id, email: ceoRow.email, cookie: await signIn(ceoRow.email, "orbit123") };
  const hodA = await mk("hod-a", "HOD", deptA.id);
  const managerA = await mk("manager-a", "MANAGER", deptA.id);
  const leadA = await mk("lead-a", "TEAM_LEAD", deptA.id);
  const devA = await mk("dev-a", "RESOURCE", deptA.id);
  const devA2 = await mk("dev-a2", "RESOURCE", deptA.id);
  const managerB = await mk("manager-b", "MANAGER", deptB.id);
  const devB = await mk("dev-b", "RESOURCE", deptB.id);
  await prisma.department.update({ where: { id: deptA.id }, data: { hodId: hodA.id } });
  const ids = [hodA, managerA, leadA, devA, devA2, managerB, devB].map((a) => a.id);
  let projectId = "";
  let groupId = "";

  try {
    console.log("\n── teams ─────────────────────────────────────────────────────");
    const g = await call(hodA, "POST", "/api/assignment-groups", { departmentId: deptA.id, name: "WM Network", leadId: leadA.id, memberIds: [devA.id] });
    record("an HOD makes a team in their department", g.status === 201, `status ${g.status}`);
    groupId = g.json?.id ?? "";
    const gB = await call(managerB, "POST", "/api/assignment-groups", { departmentId: deptA.id, name: "WM Rogue" });
    record("a manager elsewhere cannot make a team in it", gB.status === 403, `status ${gB.status}`);
    const gList = await call(devA, "GET", "/api/assignment-groups");
    record("a member sees the teams", gList.status === 200 && (gList.json ?? []).some((x: any) => x.id === groupId), `status ${gList.status}`);

    console.log("\n── a task on its own, routed to a team ────────────────────────");
    const t1 = await call(devB, "POST", "/api/tasks", { title: "WM Wi-Fi is down", type: "ISSUE", assignmentGroupId: groupId });
    record("anyone raises a task without a project", t1.status === 201, `status ${t1.status}`);
    const t1Id: string = t1.json?.id;
    record("…it is NEW, on the team, in the team's department, requested by the raiser", t1.json?.state === "NEW" && t1.json?.assignmentGroupId === groupId && t1.json?.departmentId === deptA.id && t1.json?.requesterId === devB.id, `${t1.json?.state} · ${t1.json?.departmentId === deptA.id}`);
    record("…it carries a number and a ref", typeof t1.json?.number === "number" && /^I-\d+$/.test(t1.json?.ref ?? ""), t1.json?.ref);
    const seeReq = await call(devB, "GET", `/api/tasks/${t1Id}`);
    record("the one who asked can open it", seeReq.status === 200, `status ${seeReq.status}`);
    const seeTeam = await call(devA, "GET", `/api/tasks/${t1Id}`);
    record("a team member can open it", seeTeam.status === 200, `status ${seeTeam.status}`);
    const seeOther = await call(devA2, "GET", `/api/tasks/${t1Id}`);
    record("someone in the department can open it", seeOther.status === 200, `status ${seeOther.status}`);
    const lead1 = await call(leadA, "GET", `/api/tasks/${t1Id}`);
    record("the team lead's access lists Assign and Start", lead1.json?.access?.canAssign === true && (lead1.json?.access?.transitions ?? []).includes("IN_PROGRESS"), JSON.stringify(lead1.json?.access?.transitions));
    record("the one who asked may not assign it", seeReq.json?.access?.canAssign === false && seeReq.json?.access?.staff === false, JSON.stringify(seeReq.json?.access));

    console.log("\n── assignment: department → team → person ─────────────────────");
    const wrong = await call(leadA, "POST", `/api/tasks/${t1Id}/assign`, { assigneeId: devB.id });
    record("a person outside the team cannot be given it", wrong.status === 400, `status ${wrong.status}`);
    const right = await call(leadA, "POST", `/api/tasks/${t1Id}/assign`, { assigneeId: devA.id });
    record("a team member can", right.status === 200 && right.json?.assigneeId === devA.id && right.json?.state === "ASSIGNED", `status ${right.status} · ${right.json?.state}`);
    const bell = await prisma.notification.count({ where: { userId: devA.id, taskId: t1Id, type: "task_given" } });
    record("the holder gets exactly one 'gave you a task'", bell === 1, `${bell}`);
    const again = await call(leadA, "POST", `/api/tasks/${t1Id}/assign`, { assigneeId: devA.id });
    const bell2 = await prisma.notification.count({ where: { userId: devA.id, taskId: t1Id, type: "task_given" } });
    record("saving the same holder again sends nothing", again.status === 200 && bell2 === 1, `${bell2}`);
    const re = await call(leadA, "POST", `/api/tasks/${t1Id}/assign`, { assigneeId: leadA.id });
    const told = await prisma.notification.count({ where: { userId: devA.id, taskId: t1Id, type: "work.reassigned" } });
    record("the previous holder is told it is no longer theirs", re.status === 200 && told === 1, `${told}`);
    await call(leadA, "POST", `/api/tasks/${t1Id}/assign`, { assigneeId: devA.id });

    console.log("\n── the state machine ──────────────────────────────────────────");
    const skip = await call(devA, "POST", `/api/tasks/${t1Id}/transition`, { to: "CLOSED" });
    record("Assigned → Closed is not a move", skip.status === 409, `status ${skip.status}`);
    const start = await call(devA, "POST", `/api/tasks/${t1Id}/transition`, { to: "IN_PROGRESS" });
    record("the holder starts it", start.status === 200 && start.json?.state === "IN_PROGRESS" && start.json?.status === "DOING", `${start.json?.state}/${start.json?.status}`);
    const waitNo = await call(devA, "POST", `/api/tasks/${t1Id}/transition`, { to: "WAITING" });
    record("Waiting needs a reason", waitNo.status === 400, `status ${waitNo.status}`);
    const wait = await call(devA, "POST", `/api/tasks/${t1Id}/transition`, { to: "WAITING", waitingReason: "REQUESTER", waitingNote: "Need the laptop model" });
    record("…and with one it is Waiting (reads Stuck on the old screens)", wait.status === 200 && wait.json?.state === "WAITING" && wait.json?.status === "STUCK" && wait.json?.waitingReason === "REQUESTER", `${wait.json?.state}/${wait.json?.status}`);
    const waitingBell = await prisma.notification.count({ where: { userId: devB.id, taskId: t1Id, title: { contains: "waiting on you" } } });
    record("the one who asked is told it waits on them", waitingBell === 1, `${waitingBell}`);
    await call(devA, "POST", `/api/tasks/${t1Id}/transition`, { to: "IN_PROGRESS" });
    const resolveByReq = await call(devB, "POST", `/api/tasks/${t1Id}/transition`, { to: "RESOLVED", resolutionCode: "FIXED" });
    record("the one who asked cannot resolve it", resolveByReq.status === 403, `status ${resolveByReq.status}`);
    const resolved = await call(devA, "POST", `/api/tasks/${t1Id}/resolve`, { resolutionCode: "FIXED", resolutionNotes: "Restarted AP-204", rootCause: "Corrupt AP config" });
    record("the holder resolves it with a code, notes and a root cause", resolved.status === 200 && resolved.json?.state === "RESOLVED" && resolved.json?.status === "DONE" && resolved.json?.resolutionCode === "FIXED" && resolved.json?.rootCause === "Corrupt AP config", `${resolved.json?.state}`);
    const resolvedMsg = await prisma.notification.count({ where: { userId: devB.id, taskId: t1Id, type: "task_resolved" } });
    record("the one who asked gets the resolved message", resolvedMsg === 1, `${resolvedMsg}`);
    const closeByStranger = await call(devA2, "POST", `/api/tasks/${t1Id}/close`, {});
    record("a bystander cannot close it", closeByStranger.status === 403, `status ${closeByStranger.status}`);
    const reopen = await call(devB, "POST", `/api/tasks/${t1Id}/reopen`, { note: "Still not working on the 3rd floor" });
    record("the one who asked reopens it with a note", reopen.status === 200 && reopen.json?.state === "REOPENED" && reopen.json?.status === "TODO" && reopen.json?.resolutionCode === null, `${reopen.json?.state}`);
    await call(devA, "POST", `/api/tasks/${t1Id}/transition`, { to: "IN_PROGRESS" });
    await call(devA, "POST", `/api/tasks/${t1Id}/resolve`, { resolutionCode: "FIXED" });
    const close = await call(devB, "POST", `/api/tasks/${t1Id}/close`, {});
    record("…then closes it", close.status === 200 && close.json?.state === "CLOSED" && Boolean(close.json?.closedAt), `${close.json?.state}`);

    console.log("\n── the activity stream ────────────────────────────────────────");
    const act = await call(devA, "GET", `/api/tasks/${t1Id}/activity`);
    const types = (act.json ?? []).map((a: any) => a.type);
    record("field changes were recorded from the moves themselves", act.status === 200 && types.filter((t: string) => t === "FIELD_CHANGE").length >= 8, `${types.length} rows, ${types.filter((t: string) => t === "FIELD_CHANGE").length} changes`);
    const stateRows = (act.json ?? []).filter((a: any) => a.type === "FIELD_CHANGE" && a.metadata?.field === "state");
    record("a status change carries old and new words", stateRows.some((a: any) => a.metadata.oldLabel === "In progress" && a.metadata.newLabel === "Waiting"), `${stateRows.length} state rows`);
    record("the reopen note is in the stream", (act.json ?? []).some((a: any) => a.type === "COMMENT" && a.body.includes("3rd floor")));
    const tn = await call(devA, "POST", `/api/tasks/${t1Id}/work-notes`, { body: "AP-204 logs show auth failures" });
    record("the holder writes a team note", tn.status === 201 && tn.json?.visibility === "INTERNAL", `status ${tn.status}`);
    const reqView = await call(devB, "GET", `/api/tasks/${t1Id}/activity`);
    record("the one who asked does not see team notes", reqView.status === 200 && !(reqView.json ?? []).some((a: any) => a.type === "WORK_NOTE"), `${(reqView.json ?? []).length} rows`);
    const staffView = await call(hodA, "GET", `/api/tasks/${t1Id}/activity?type=WORK_NOTE`);
    record("the head does, and can filter to them", staffView.status === 200 && (staffView.json ?? []).length === 1 && staffView.json[0].type === "WORK_NOTE", `${(staffView.json ?? []).length}`);
    const hist = await call(devB, "GET", `/api/tasks/${t1Id}/history`);
    record("history is the field changes alone", hist.status === 200 && (hist.json ?? []).every((a: any) => a.type === "FIELD_CHANGE") && (hist.json ?? []).length >= 8, `${(hist.json ?? []).length}`);
    const mention = await call(devA, "POST", `/api/tasks/${t1Id}/comments`, { body: "@WM lead-a can you check?", mentions: [leadA.id] });
    const mentionBell = await prisma.notification.count({ where: { userId: leadA.id, taskId: t1Id, type: "work.mention" } });
    record("an @mention reaches the person", mention.status === 201 && mentionBell === 1, `${mentionBell}`);

    console.log("\n── project tasks keep the owner's rules, without the holes ────");
    const proj = await call(managerA, "POST", "/api/projects", { name: "WM Project", departmentId: deptA.id, leadId: leadA.id });
    projectId = proj.json?.id ?? "";
    record("a manager starts a project", proj.status === 201, `status ${proj.status}`);
    const pt = await call(leadA, "POST", "/api/tasks", { projectId, title: "WM fix login", assigneeId: devA.id });
    record("a lead gives a project task", pt.status === 201 && pt.json?.type === "PROJECT_TASK" && pt.json?.state === "ASSIGNED", `${pt.json?.type}/${pt.json?.state}`);
    const ptId: string = pt.json?.id;
    const doneByMember = await call(devA, "PATCH", `/api/tasks/${ptId}`, { status: "DONE" });
    record("a team member still cannot tick it done", doneByMember.status === 403, `status ${doneByMember.status}`);
    const bornDone = await call(devA, "POST", "/api/tasks", { projectId, title: "WM born done", status: "DONE" });
    const bornRow = bornDone.json?.id ? await prisma.task.findUnique({ where: { id: bornDone.json.id } }) : null;
    record("…nor open one already done", bornDone.status === 403 || (bornRow !== null && bornRow.status !== "DONE"), `status ${bornDone.status} · ${bornRow?.status}`);
    const step = await call(devA, "POST", "/api/tasks", { projectId, parentId: ptId, title: "WM step" });
    const stepId: string = step.json?.id;
    const promote = await call(devA, "PATCH", `/api/tasks/${stepId}`, { parentId: null, status: "DONE" });
    const promoted = stepId ? await prisma.task.findUnique({ where: { id: stepId } }) : null;
    record("…nor mark a step done and promote it in one go", promote.status === 403 || (promoted !== null && !(promoted.parentId === null && promoted.status === "DONE")), `status ${promote.status} · ${promoted?.status}`);
    const stranger = await call(devA2, "DELETE", `/api/tasks/${ptId}`);
    record("someone in the department but not on the project cannot delete its task", stranger.status === 403, `status ${stranger.status}`);
    const strangerEdit = await call(devA2, "PATCH", `/api/tasks/${ptId}`, { title: "WM vandalised" });
    record("…nor rename it", strangerEdit.status === 403, `status ${strangerEdit.status}`);
    const strangerStep = await call(devA2, "POST", "/api/tasks", { projectId, parentId: ptId, title: "WM sneaky step" });
    record("…nor add a step to it", strangerStep.status === 403, `status ${strangerStep.status}`);
    const leadDone = await call(leadA, "PATCH", `/api/tasks/${ptId}`, { status: "DONE" });
    record("the lead ticks it: the old word maps to Resolved", leadDone.status === 200 && leadDone.json?.status === "DONE" && leadDone.json?.state === "RESOLVED" && leadDone.json?.resolutionCode === "COMPLETED", `${leadDone.json?.state}`);
    const untick = await call(leadA, "PATCH", `/api/tasks/${ptId}`, { status: "TODO" });
    record("…and un-ticking reopens it", untick.status === 200 && untick.json?.state === "REOPENED" && untick.json?.status === "TODO", `${untick.json?.state}`);
    const ptAct = await call(leadA, "GET", `/api/tasks/${ptId}/activity?type=FIELD_CHANGE`);
    record("both moves are in the stream", (ptAct.json ?? []).filter((a: any) => a.metadata?.field === "state").length >= 3, `${(ptAct.json ?? []).length}`);

    console.log("\n── accounts: the ceiling and the department wall ──────────────");
    const promoteHod = await call(managerA, "PATCH", `/api/users/${devA.id}`, { role: "HOD" });
    record("a manager cannot make someone a head", promoteHod.status === 403, `status ${promoteHod.status}`);
    const crossPw = await call(hodA, "POST", `/api/users/${devB.id}/password`, { password: "longpassword1" });
    record("a head cannot set a password in another department", crossPw.status === 403, `status ${crossPw.status}`);
    const ownPw = await call(hodA, "POST", `/api/users/${devA.id}/password`, { password: "longpassword1" });
    record("…but can in their own", ownPw.status === 200, `status ${ownPw.status}`);
    const stale = await call(devA, "GET", "/api/users/me");
    record("the old session of that person is over", stale.status === 401, `status ${stale.status}`);
    devA.cookie = await signIn(devA.email, "longpassword1");
    const fresh = await call(devA, "GET", "/api/users/me");
    record("…and the new password signs them in", fresh.status === 200, `status ${fresh.status}`);
    await call(managerA, "POST", `/api/projects/${projectId}/members`, { userId: devA.id, canManage: true });
    const sideDoor = await call(devA, "POST", `/api/projects/${projectId}/members`, { invite: { name: "WM Side", email: `${PREFIX}side@orbit.local`, role: "TEAM_LEAD" } });
    record("a member who runs a project still cannot mint accounts", sideDoor.status === 403, `status ${sideDoor.status}`);
    const phones = await call(leadA, "GET", "/api/users");
    record("a lead sees no phone numbers", phones.status === 200 && (phones.json ?? []).every((u: any) => u.phone === null || u.id === leadA.id), `status ${phones.status}`);

    console.log("\n── the queue and the dashboard ────────────────────────────────");
    const mine = await call(devA, "GET", "/api/work?mine=assigned");
    record("my work lists what I hold", mine.status === 200 && (mine.json?.items ?? []).some((t: any) => t.id === ptId), `${mine.json?.items?.length}`);
    const team = await call(leadA, "GET", `/api/work?assignmentGroupId=${groupId}&state=CLOSED`);
    record("a team queue can be filtered by state", team.status === 200 && (team.json?.items ?? []).some((t: any) => t.id === t1Id), `${team.json?.items?.length}`);
    const search = await call(hodA, "GET", "/api/work?q=Wi-Fi");
    record("search finds a task by its words", search.status === 200 && (search.json?.items ?? []).some((t: any) => t.id === t1Id), `${search.json?.items?.length}`);
    const byRef = await call(hodA, "GET", `/api/work?q=${encodeURIComponent(t1.json?.ref)}`);
    record("…and by its number", byRef.status === 200 && (byRef.json?.items ?? []).some((t: any) => t.id === t1Id), `${byRef.json?.items?.length}`);
    const outsider = await call(devB, "GET", `/api/work?departmentId=${deptA.id}`);
    record("someone outside the department sees only what they are on", outsider.status === 200 && (outsider.json?.items ?? []).every((t: any) => t.requesterId === devB.id || t.assigneeId === devB.id), `${outsider.json?.items?.length}`);
    const today = await call(hodA, "GET", "/api/dashboard/today");
    record("the head's Today carries counters and the department line", today.status === 200 && typeof today.json?.counters?.open === "number" && Array.isArray(today.json?.departments), JSON.stringify(today.json?.counters));
    const depts = await call(ceo, "GET", "/api/dashboard/departments");
    record("the CEO's department view lists every department with teams", depts.status === 200 && (depts.json?.departments ?? []).some((d: any) => d.id === deptA.id && (d.teams ?? []).some((g: any) => g.id === groupId)), `${depts.json?.departments?.length}`);
    const deptsB = await call(managerB, "GET", "/api/dashboard/departments");
    record("a manager's department view is their own department alone", deptsB.status === 200 && (deptsB.json?.departments ?? []).every((d: any) => d.id === deptB.id), `${deptsB.json?.departments?.length}`);
  } finally {
    console.log("\n── cleanup ───────────────────────────────────────────────────");
    const tasks = await prisma.task.deleteMany({ where: { OR: [{ title: { startsWith: "WM " } }, { requesterId: { in: ids } }] } });
    if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
    await prisma.project.deleteMany({ where: { name: { startsWith: "WM " } } });
    await prisma.assignmentGroup.deleteMany({ where: { name: { startsWith: "WM " } } });
    await prisma.calendarEvent.deleteMany({ where: { createdById: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.invite.deleteMany({ where: { OR: [{ createdById: { in: ids } }, { user: { email: { startsWith: PREFIX } } }] } });
    await prisma.department.update({ where: { id: deptA.id }, data: { hodId: deptA.hodId } });
    const users = await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    console.log(`removed ${users.count} throwaway accounts, ${tasks.count} tasks`);
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail > 0) process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
