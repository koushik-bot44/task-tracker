/* The whole flow, from signing in to assigned work (2026-09-11), on the clone.
 *   npx tsx --env-file=.env.local scripts/check-journey.ts      (dev server up; no fixture needed)
 *
 * Throwaway accounts for every role, in a throwaway department, made the way a
 * new organisation makes them. Each step is checked through the API; the key
 * screens open on a desktop (1280) and a phone (390), and any console error or
 * 5xx fails the run.
 *   Sign-in: success and its cookie; a wrong password; the ninth failure in a
 *   minute refused; a disabled account; a pending invite; sign-out; an old
 *   session after a password reset.
 *   Invite → set a password from the link on a phone → first sign-in, placed in
 *   the right department.
 *   The CEO sets up a department, a team and a project. A manager raises a task
 *   and gives it to a member, work in progress at once. The member sees it on
 *   Today and under Your work, adds a note with three files and previews each.
 *   The manager schedules a meeting from the task: only the task's people are
 *   invited. Progress; On Hold with a reason; back to work; resolved; closed;
 *   reopened; given to someone else; deleted and brought back.
 *   Every bell those steps send, to exactly the right people, and nobody else.
 *   Work filters (Individual, Awaiting meeting, Overdue), search and paging;
 *   project notes and milestone notes.
 * Leaves no trace: everything made ("jny-…@example.com", "JNY …") is removed and
 * every table recounted.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";

if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "")) {
  console.error("DATABASE_URL is not the local clone. Refusing.");
  process.exit(1);
}

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const CEO_EMAIL = process.env.CEO_EMAIL ?? "founder@orbit.local";
const CEO_PASSWORD = process.env.CEO_PASSWORD ?? "orbit123";
const PASSWORD = "Rig-Journey-2026";
const RUN = Date.now().toString(36);
const mail = (key: string) => `jny-${key}@example.com`;

let pass = 0;
let fail = 0;
function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const note = (text: string) => console.log(`NOTE  ${text}`);
const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 200);
async function until(check: () => Promise<boolean>, timeout = 15000): Promise<boolean> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

type Res = { status: number; json: any; cookie: string | null; setCookie: string };
let ipSeq = 0;
/** Each caller its own made-up address, so the sign-in limit counts only what a case means it to. */
const freshIp = () => `10.61.${Math.floor(++ipSeq / 250)}.${(ipSeq % 250) + 1}`;
async function api(cookie: string | null | undefined, method: string, path: string, body?: unknown, ip = "10.61.200.1"): Promise<Res> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  const setCookie = res.headers.get("set-cookie") ?? "";
  return { status: res.status, json, cookie: setCookie.startsWith("orbit_session=") ? setCookie.split(";")[0] : null, setCookie };
}
const signIn = (email: string, password: string, ip = freshIp()) => api(null, "POST", "/api/auth", { email, password }, ip);
async function upload(cookie: string, name: string, type: string, bytes: Buffer): Promise<Res> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type }), name);
  const res = await fetch(`${BASE}/api/uploads`, { method: "POST", headers: { cookie }, body: form });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* none */
  }
  return { status: res.status, json, cookie: null, setCookie: "" };
}

async function countAll(): Promise<Record<string, number>> {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%' ORDER BY tablename`);
  const out: Record<string, number> = {};
  for (const { tablename } of tables) {
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${tablename}"`);
    out[tablename] = Number(n);
  }
  return out;
}

async function cleanup(started: Date | null, ceoId: string | null) {
  const ids = (await prisma.user.findMany({ where: { email: { startsWith: "jny-" } }, select: { id: true } })).map((u) => u.id);
  const projectIds = (await prisma.project.findMany({ where: { name: { startsWith: "JNY " } }, select: { id: true } })).map((p) => p.id);
  const milestoneIds = (await prisma.milestone.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } })).map((m) => m.id);
  const taskIds = (
    await prisma.task.findMany({
      where: { OR: [{ title: { startsWith: "JNY", mode: "insensitive" } }, { projectId: { in: projectIds } }, { assigneeId: { in: ids } }, { requesterId: { in: ids } }, { givenById: { in: ids } }] },
      select: { id: true },
    })
  ).map((t) => t.id);
  const eventIds = (
    await prisma.calendarEvent.findMany({
      where: { OR: [{ createdById: { in: ids } }, { taskId: { in: taskIds } }, { projectId: { in: projectIds } }, { milestoneId: { in: milestoneIds } }, { title: { startsWith: "JNY" } }] },
      select: { id: true },
    })
  ).map((e) => e.id);
  await prisma.eventAttendee.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.notification.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { taskId: { in: taskIds } }, { eventId: { in: eventIds } }, ...(started && ceoId ? [{ userId: ceoId, createdAt: { gte: started } }] : [])] },
  });
  await prisma.calendarEvent.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.commentAttachment.deleteMany({ where: { OR: [{ activity: { taskId: { in: taskIds } } }, { comment: { targetId: { in: [...projectIds, ...milestoneIds] } } }] } });
  await prisma.comment.deleteMany({ where: { OR: [{ targetId: { in: [...projectIds, ...milestoneIds, ...taskIds] } }, { authorId: { in: ids } }] } });
  await prisma.taskActivity.deleteMany({ where: { taskId: { in: taskIds } } });
  await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.assignmentGroup.deleteMany({ where: { name: { startsWith: "JNY " } } });
  await prisma.storedFile.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.invite.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdById: { in: ids } }] } });
  if (started) await prisma.loginAttempt.deleteMany({ where: { createdAt: { gte: started } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.department.deleteMany({ where: { name: { startsWith: "JNY " } } });
}

let browser: Browser | null = null;
const consoleErrors: string[] = [];
const serverErrors: string[] = [];
function watch(page: Page) {
  page.on("console", (m) => {
    if (m.type() === "error" && !/status of 4\d\d/.test(m.text())) consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url().replace(BASE, "")}`);
  });
}
async function pageAs(cookie: string, phone: boolean): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser!.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
  const eq = cookie.indexOf("=");
  await ctx.addCookies([{ name: cookie.slice(0, eq), value: cookie.slice(eq + 1), url: BASE }]);
  const page = await ctx.newPage();
  watch(page);
  return { ctx, page };
}
const IST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
const dayKey = (offset: number) => IST.format(new Date(Date.now() + offset * 86_400_000));

async function journey(ceo: string, ceoId: string) {
  /* ---- the organisation: a department, its people ---- */
  const dept = await api(ceo, "POST", "/api/departments", { name: `JNY Department ${RUN}`, color: "#0d9488" });
  record("the CEO makes a department", dept.status === 201, `status ${dept.status}`);
  const deptId: string = dept.json?.id;
  const development = await prisma.department.findFirst({ where: { name: "Development" }, select: { id: true } });
  const roles = {
    head: { role: "HOD", departmentId: deptId },
    manager: { role: "MANAGER", departmentId: deptId },
    lead: { role: "TEAM_LEAD", departmentId: deptId },
    member: { role: "RESOURCE", departmentId: deptId },
    member2: { role: "RESOURCE", departmentId: deptId },
    outsider: { role: "RESOURCE", departmentId: development?.id ?? null },
    disabled: { role: "RESOURCE", departmentId: deptId },
    pending: { role: "RESOURCE", departmentId: deptId },
  } as const;
  const keys = Object.keys(roles) as (keyof typeof roles)[];
  const invited = await api(ceo, "POST", "/api/users/invite", { people: keys.map((k) => ({ name: `JNY ${k}`, emails: [mail(k)], role: roles[k].role, departmentId: roles[k].departmentId })) });
  record("the CEO invites every role in one go", invited.status === 201 && invited.json?.people?.length === keys.length, `status ${invited.status} ${invited.json?.error ?? ""}`);
  const person = new Map<string, { id: string; url: string }>((invited.json?.people ?? []).map((p: any) => [p.email.split("@")[0].replace("jny-", ""), { id: p.id, url: p.url }]));
  const id = (k: string) => person.get(k)?.id ?? "";
  record("the head of department heads it at once", (await prisma.department.findUnique({ where: { id: deptId }, select: { hodId: true } }))?.hodId === id("head"));

  /* ---- invite → set a password on a phone → first sign-in, placed right ---- */
  const cookie = new Map<string, string>();
  const phoneCtx = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phoneInvite = await phoneCtx.newPage();
  watch(phoneInvite);
  try {
    await phoneInvite.goto(person.get("member")!.url);
    await phoneInvite.getByLabel("New password", { exact: true }).fill(PASSWORD, { timeout: 60000 });
    await phoneInvite.getByLabel("Repeat password", { exact: true }).fill(PASSWORD);
    await phoneInvite.getByRole("button", { name: "Set password & sign in" }).click();
    const landed = await phoneInvite.waitForURL((u) => !u.pathname.startsWith("/invite"), { timeout: 60000 }).then(() => true).catch(() => false);
    const c = (await phoneCtx.cookies()).find((x) => x.name === "orbit_session");
    if (c) cookie.set("member", `orbit_session=${c.value}`);
    record("a member sets a password from the link on a phone and lands on Today", landed && new URL(phoneInvite.url()).pathname === "/" && Boolean(c), new URL(phoneInvite.url()).pathname);
  } catch (e) {
    record("a member sets a password from the link on a phone", false, firstLine(e));
  }
  await phoneCtx.close();
  const memberMe = await api(cookie.get("member"), "GET", "/api/users/me");
  record("…signed in the first time, in the department they were placed in", memberMe.status === 200 && memberMe.json?.departmentId === deptId && memberMe.json?.role === "RESOURCE", `${memberMe.status} ${memberMe.json?.role}`);
  for (const k of keys) {
    if (k === "pending" || cookie.has(k)) continue;
    const r = await api(null, "POST", `/api/invite/${person.get(k)!.url.split("/invite/")[1]}/accept`, { password: PASSWORD });
    if (r.cookie) cookie.set(k, r.cookie);
  }
  record("everyone but the pending one has set a password", keys.filter((k) => k !== "pending").every((k) => cookie.has(k)), `${cookie.size} of ${keys.length - 1}`);

  /* ---- sign-in ---- */
  const ok = await signIn(mail("lead"), PASSWORD);
  record("signing in works", ok.status === 200 && Boolean(ok.cookie));
  record("…with a cookie scripts can't read, sent only to this site, for every path", /HttpOnly/i.test(ok.setCookie) && /SameSite=Lax/i.test(ok.setCookie) && /Path=\//i.test(ok.setCookie), ok.setCookie.replace(/orbit_session=[^;]+/, "orbit_session=…"));
  if (!/Secure/i.test(ok.setCookie)) note("the cookie is not marked Secure here; it is in production (NODE_ENV=production)");
  const wrong = await signIn(mail("lead"), "not-the-password");
  const nobody = await signIn(mail("nobody"), "not-the-password");
  record("a wrong password is refused", wrong.status === 401);
  record("…with the same answer as an address nobody has, so it gives nothing away", wrong.status === nobody.status && wrong.json?.error === nobody.json?.error, String(wrong.json?.error));
  const burst = freshIp();
  const tries: number[] = [];
  for (let i = 0; i < 8; i++) tries.push((await signIn(mail("lead"), `wrong-${i}`, burst)).status);
  const ninth = await signIn(mail("lead"), PASSWORD, burst);
  record("eight failures in a minute are each refused", tries.every((s) => s === 401), tries.join(","));
  record("…and the ninth try is refused even with the right password", ninth.status === 429, `status ${ninth.status}`);
  await api(ceo, "PATCH", `/api/users/${id("disabled")}`, { disable: true });
  const off = await signIn(mail("disabled"), PASSWORD);
  record("a disabled account can't sign in, and is told nothing more", off.status === 401 && off.json?.error === nobody.json?.error, `status ${off.status}`);
  const pend = await signIn(mail("pending"), PASSWORD);
  record("a pending invite can't sign in, and is told nothing more", pend.status === 401 && pend.json?.error === nobody.json?.error, `status ${pend.status}`);
  const outCookie = (await signIn(mail("lead"), PASSWORD)).cookie;
  const signOut = await api(outCookie, "DELETE", "/api/auth");
  record("signing out clears the cookie", signOut.status === 200 && /orbit_session=;/.test(signOut.setCookie) && /Max-Age=0/i.test(signOut.setCookie), signOut.setCookie.slice(0, 60));
  const replay = await api(outCookie, "GET", "/api/users/me");
  if (replay.status === 200) note("a copy of the signed-out token still works until it expires: sign-out only clears the browser's cookie (security review)");
  const before = cookie.get("member")!;
  const reset = await api(ceo, "PATCH", `/api/users/${id("member")}`, { reset: true });
  const old = await api(before, "GET", "/api/users/me");
  record("after a password reset the old session is refused", reset.status === 200 && old.status === 401, `reset ${reset.status}, old session ${old.status}`);
  const fresh = await signIn(mail("member"), reset.json?.tempPassword ?? "");
  record("…and the new password signs in", fresh.status === 200 && Boolean(fresh.cookie), `status ${fresh.status}`);
  if (fresh.cookie) cookie.set("member", fresh.cookie);

  /* ---- a team and a project ---- */
  const team = await api(ceo, "POST", "/api/assignment-groups", { departmentId: deptId, name: `JNY Team ${RUN}`, leadId: id("lead"), memberIds: [id("member"), id("member2")] });
  record("the CEO makes a team with a lead and two members", team.status === 201, `status ${team.status} ${team.json?.error ?? ""}`);
  const project = await api(ceo, "POST", "/api/projects", { name: `JNY Project ${RUN}`, departmentId: deptId, leadId: id("manager"), memberIds: [id("lead"), id("member"), id("member2")] });
  record("…and a project led by the manager", project.status === 201, `status ${project.status} ${project.json?.error ?? ""}`);
  const projectId: string = project.json?.id;
  const slug: string = project.json?.slug;

  /* ---- a task, given to a member ---- */
  const t0 = new Date();
  const made = await api(cookie.get("manager"), "POST", "/api/tasks", { title: `JNY journey task ${RUN}`, projectId, departmentId: deptId, assigneeId: id("member") });
  const task = made.json;
  record("the manager gives a task to the member: work in progress at once", made.status === 201 && task?.state === "IN_PROGRESS" && task?.status === "DOING", `status ${made.status} ${task?.state ?? made.json?.error}`);
  if (!task?.id) throw new Error("no task to go on with");
  const today = await api(cookie.get("member"), "GET", "/api/today");
  record("it is on the member's Today", (today.json?.tasks ?? []).some((t: any) => t.id === task.id));
  const yours = await api(cookie.get("member"), "GET", "/api/work?mine=assigned&rows=tasks&open=true&limit=50");
  record("…and under Your work", (yours.json?.items ?? []).some((t: any) => t.id === task.id));

  /* ---- a note with three files, each previewed ---- */
  const scratch = await browser!.newPage();
  await scratch.setContent(`<h1 style="font:40px sans-serif;padding:40px">JNY ${RUN}</h1>`);
  const files = [
    { name: `jny-${RUN}-photo.png`, type: "image/png", bytes: Buffer.from(await scratch.screenshot({ type: "png" })) },
    { name: `jny-${RUN}-brief.pdf`, type: "application/pdf", bytes: Buffer.from(await scratch.pdf({ format: "A6" })) },
    { name: `jny-${RUN}-notes.txt`, type: "text/plain", bytes: Buffer.from(`JNY notes ${RUN}\nsecond line\n`) },
  ];
  await scratch.close();
  const stored: { url: string; name: string; type: string; size: number }[] = [];
  for (const f of files) {
    const u = await upload(cookie.get("member")!, f.name, f.type, f.bytes);
    if (u.status === 201) stored.push({ url: u.json.url, name: u.json.name, type: u.json.type, size: f.bytes.length });
  }
  record("the member uploads three files", stored.length === 3, `${stored.length} stored`);
  const noteRes = await api(cookie.get("member"), "POST", `/api/tasks/${task.id}/comments`, { body: `JNY three files ${RUN}`, attachments: stored });
  record("…and posts them on one note", noteRes.status === 201, `status ${noteRes.status} ${noteRes.json?.error ?? ""}`);
  const desk = await pageAs(cookie.get("member")!, false);
  try {
    await desk.page.goto(`${BASE}/work/${task.number}`);
    for (const [i, f] of stored.entries()) {
      const tile = desk.page.getByRole("button", { name: `Open ${f.name}` }).first();
      await tile.click({ timeout: i === 0 ? 90000 : 15000 });
      const viewer = desk.page.getByRole("dialog", { name: `${f.name}, file ${i + 1} of 3` });
      const shown = await viewer.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
      record(`the member previews ${f.type === "image/png" ? "the picture" : f.type === "application/pdf" ? "the PDF" : "the text file"}`, shown);
      await desk.page.keyboard.press("Escape");
      await until(async () => (await viewer.count()) === 0, 5000);
    }
  } catch (e) {
    record("the member previews each file", false, firstLine(e));
  }
  await desk.ctx.close();

  /* ---- a meeting from the task ---- */
  const meeting = await api(cookie.get("manager"), "POST", "/api/events", { title: `JNY sync ${RUN}`, date: dayKey(1), startTime: "11:00", attendeeIds: [id("member"), id("manager"), id("outsider")], taskId: task.id });
  const attendees: string[] = (meeting.json?.attendees ?? []).map((a: any) => a.userId);
  record("the manager schedules a meeting from the task", meeting.status === 201, `status ${meeting.status} ${meeting.json?.error ?? ""}`);
  record("…inviting only the task's people, not someone from another department", attendees.includes(id("member")) && !attendees.includes(id("outsider")), `${attendees.length} invited`);

  /* ---- progress, on hold, resolved, closed, reopened, reassigned, deleted, restored ---- */
  const progress = await api(cookie.get("member"), "PATCH", `/api/tasks/${task.id}`, { progress: 50 });
  record("the member marks it half done", progress.status === 200 && progress.json?.progress === 50, `status ${progress.status}`);
  const noReason = await api(cookie.get("member"), "POST", `/api/tasks/${task.id}/wait`, {});
  record("On Hold without a reason is refused", noReason.status === 400, `status ${noReason.status}`);
  const hold = await api(cookie.get("member"), "POST", `/api/tasks/${task.id}/wait`, { waitingReason: "VENDOR" });
  record("On Hold with a reason", hold.status === 200 && hold.json?.state === "WAITING" && hold.json?.status === "STUCK", `${hold.status} ${hold.json?.state}`);
  const resume = await api(cookie.get("member"), "POST", `/api/tasks/${task.id}/start`, {});
  record("back to work in progress", resume.status === 200 && resume.json?.state === "IN_PROGRESS", `${resume.status} ${resume.json?.state}`);
  // A project task is marked done by a team lead or above (the owner's rule), so the team's lead resolves it.
  const resolved = await api(cookie.get("lead"), "POST", `/api/tasks/${task.id}/resolve`, { resolutionCode: "COMPLETED", resolutionNotes: "Done in the journey" });
  record("the team's lead resolves it, with how", resolved.status === 200 && resolved.json?.state === "RESOLVED" && resolved.json?.status === "DONE", `${resolved.status} ${resolved.json?.state}`);
  const closed = await api(cookie.get("manager"), "POST", `/api/tasks/${task.id}/close`, {});
  record("the manager closes it", closed.status === 200 && closed.json?.state === "CLOSED", `${closed.status} ${closed.json?.state}`);
  const reopened = await api(cookie.get("manager"), "POST", `/api/tasks/${task.id}/reopen`, {});
  record("…and reopens it", reopened.status === 200 && reopened.json?.state === "REOPENED", `${reopened.status} ${reopened.json?.state}`);
  const moved = await api(cookie.get("manager"), "POST", `/api/tasks/${task.id}/assign`, { assigneeId: id("member2") });
  record("the manager gives it to someone else", moved.status === 200 && moved.json?.assigneeId === id("member2"), `${moved.status} ${moved.json?.error ?? ""}`);
  const gone = await api(cookie.get("manager"), "DELETE", `/api/tasks/${task.id}`);
  const hidden = await api(cookie.get("member2"), "GET", `/api/tasks/${task.id}`);
  record("deleted, it is gone from the new holder", gone.status === 200 && hidden.status === 404, `delete ${gone.status}, holder sees ${hidden.status}`);
  const back = await api(cookie.get("manager"), "PATCH", `/api/tasks/${task.id}`, { deletedAt: null });
  const seen = await api(cookie.get("member2"), "GET", `/api/tasks/${task.id}`);
  record("…and brought back, it is theirs again", back.status === 200 && seen.status === 200 && seen.json?.assigneeId === id("member2"), `restore ${back.status}, holder sees ${seen.status}`);

  /* ---- every bell, to exactly the right people ---- */
  await new Promise((r) => setTimeout(r, 1500));
  const bells = await prisma.notification.findMany({ where: { createdAt: { gte: t0 }, OR: [{ taskId: task.id }, { eventId: meeting.json?.id ?? "none" }] }, select: { userId: true, type: true } });
  const got = (k: string) => bells.filter((b) => b.userId === (k === "ceo" ? ceoId : id(k))).map((b) => b.type).sort();
  const EXPECT: Record<string, string[]> = {
    manager: ["task_note", "task_resolved", "work.status", "work.status"],
    member: ["event.created", "task_given", "work.reassigned", "work.status", "work.status", "work.status"],
    member2: ["task_given"],
    head: [],
    lead: [],
    outsider: [],
    ceo: [],
  };
  for (const [k, want] of Object.entries(EXPECT)) {
    const have = got(k);
    record(`bells for the ${k === "ceo" ? "CEO" : k}: ${want.length ? want.join(", ") : "none"}`, have.join("|") === [...want].sort().join("|"), have.join(", ") || "none");
  }

  /* ---- Work filters, search, paging ---- */
  const lonely = await api(ceo, "POST", "/api/tasks", { title: `JNY individual job ${RUN}`, assigneeId: id("member2") });
  const individual = await api(ceo, "GET", "/api/work?mine=individual&rows=tasks&open=true&limit=200");
  record("Individual lists work given straight to a person, and not a department's", (individual.json?.items ?? []).some((t: any) => t.id === lonely.json?.id) && !(individual.json?.items ?? []).some((t: any) => t.id === task.id));
  const awaiting = await api(cookie.get("manager"), "GET", "/api/work?meeting=1&open=true&rows=tasks&limit=200");
  record("Awaiting meeting lists the task with its meeting ahead", (awaiting.json?.items ?? []).some((t: any) => t.id === task.id && t.nextMeeting) && (awaiting.json?.items ?? []).every((t: any) => t.nextMeeting));
  const late = await api(cookie.get("manager"), "POST", "/api/tasks", { title: `JNY overdue ${RUN}`, projectId, departmentId: deptId, assigneeId: id("lead"), dueDate: new Date(`${dayKey(-2)}T06:00:00.000Z`).toISOString() });
  const overdue = await api(cookie.get("manager"), "GET", "/api/work?overdue=1&rows=tasks&limit=200");
  record("Overdue lists work past its date, and only that", late.status === 201 && (overdue.json?.items ?? []).some((t: any) => t.id === late.json?.id) && (overdue.json?.items ?? []).every((t: any) => t.dueDate && t.dueDate.slice(0, 10) < dayKey(0)), `status ${late.status}`);
  const search = await api(cookie.get("manager"), "GET", `/api/work?q=${encodeURIComponent(`overdue ${RUN}`)}&rows=tasks&limit=50`);
  record("search finds a task by its words", (search.json?.items ?? []).some((t: any) => t.id === late.json?.id) && !(search.json?.items ?? []).some((t: any) => t.id === task.id));
  for (let i = 0; i < 5; i++) await api(cookie.get("manager"), "POST", "/api/tasks", { title: `JNY page ${RUN} ${i}`, projectId, departmentId: deptId });
  // The Work screen pages by number (rows=tasks&page=N); other API callers walk records by cursor.
  const byPage: string[] = [];
  let total = -1;
  let pages = 0;
  for (let page = 1; page <= 10; page++) {
    const p: Res = await api(cookie.get("manager"), "GET", `/api/work?q=${encodeURIComponent(`page ${RUN}`)}&rows=tasks&limit=2&page=${page}`);
    if (total < 0) total = p.json?.total ?? -1;
    const items = p.json?.items ?? [];
    for (const t of items) byPage.push(t.id);
    pages++;
    if (items.length < 2 || page * 2 >= total) break;
  }
  record("paging two at a time walks all five, none twice, and the count agrees", byPage.length === 5 && new Set(byPage).size === 5 && total === 5 && pages === 3, `${byPage.length} over ${pages} pages, total ${total}`);
  const byCursor: string[] = [];
  let cursor: string | null = null;
  let hops = 0;
  do {
    const p: Res = await api(cookie.get("manager"), "GET", `/api/work?q=${encodeURIComponent(`page ${RUN}`)}&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    for (const t of p.json?.items ?? []) byCursor.push(t.id);
    cursor = p.json?.nextCursor ?? null;
    hops++;
  } while (cursor && hops < 10);
  record("…and by cursor, two records at a time, the same five", byCursor.length === 5 && new Set(byCursor).size === 5 && byCursor.every((x) => byPage.includes(x)), `${byCursor.length} over ${hops} requests`);

  /* ---- project notes and milestone notes ---- */
  const projectNote = await api(cookie.get("manager"), "POST", "/api/comments", { targetType: "PROJECT", targetId: projectId, body: `JNY project note ${RUN}` });
  const projectNotes = await api(cookie.get("member"), "GET", `/api/comments?targetType=PROJECT&targetId=${projectId}`);
  const outsiderNotes = await api(cookie.get("outsider"), "GET", `/api/comments?targetType=PROJECT&targetId=${projectId}`);
  record("a project note reaches the people on the project", projectNote.status === 201 && JSON.stringify(projectNotes.json ?? "").includes(`JNY project note ${RUN}`), `status ${projectNote.status}`);
  record("…and not someone outside it", outsiderNotes.status === 403 || outsiderNotes.status === 404, `status ${outsiderNotes.status}`);
  const milestone = await api(ceo, "POST", "/api/milestones", { projectId, name: `JNY milestone ${RUN}`, reviewDate: dayKey(14) });
  const milestoneNote = milestone.json?.id ? await api(cookie.get("manager"), "POST", "/api/comments", { targetType: "MILESTONE", targetId: milestone.json.id, body: `JNY milestone note ${RUN}` }) : { status: 0, json: null };
  const milestoneNotes = milestone.json?.id ? await api(cookie.get("member"), "GET", `/api/comments?targetType=MILESTONE&targetId=${milestone.json.id}`) : { status: 0, json: null };
  record("a milestone note reaches the project's people", milestone.status === 201 && milestoneNote.status === 201 && JSON.stringify(milestoneNotes.json ?? "").includes(`JNY milestone note ${RUN}`), `milestone ${milestone.status}, note ${milestoneNote.status}`);
  const outsiderMilestone = milestone.json?.id ? await api(cookie.get("outsider"), "GET", `/api/comments?targetType=MILESTONE&targetId=${milestone.json.id}`) : { status: 0 };
  record("…and not someone outside it", outsiderMilestone.status === 403 || outsiderMilestone.status === 404, `status ${outsiderMilestone.status}`);

  /* ---- the screens, desktop and phone ---- */
  for (const phone of [false, true]) {
    for (const who of ["manager", "member2"]) {
      const s = await pageAs(cookie.get(who)!, phone);
      for (const path of ["/", "/work", `/work/${task.number}`, `/project/${slug}`, "/calendar"]) {
        const res = await s.page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => null);
        await s.page.waitForTimeout(1500);
        const width = await s.page.evaluate("document.documentElement.scrollWidth");
        record(`${phone ? "phone" : "desktop"}: the ${who} opens ${path.replace(RUN, "…")}`, Boolean(res && res.status() === 200) && (!phone || Number(width) <= 390), `status ${res?.status() ?? "none"}${phone ? `, ${width}px` : ""}`);
      }
      await s.ctx.close();
    }
  }
}

async function main() {
  const signedIn = await signIn(CEO_EMAIL, CEO_PASSWORD);
  record("the CEO signs in", Boolean(signedIn.cookie));
  if (!signedIn.cookie) return;
  const ceo = signedIn.cookie;
  const ceoId: string = (await api(ceo, "GET", "/api/users/me")).json?.id ?? "";
  await cleanup(null, null);
  const before = await countAll();
  const started = new Date();
  browser = await chromium.launch();
  try {
    await journey(ceo, ceoId);
  } catch (e) {
    record("the journey ran to the end", false, firstLine(e));
  } finally {
    await browser.close().catch(() => undefined);
    record("no request answered 5xx", serverErrors.length === 0, serverErrors.slice(0, 4).join(" | "));
    record("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | ").slice(0, 400));
    await cleanup(started, ceoId);
    const after = await countAll();
    const changed = Object.keys({ ...before, ...after }).filter((t) => before[t] !== after[t]);
    record("the run leaves no trace: every table holds what it held before", changed.length === 0, changed.map((t) => `${t} ${before[t]}→${after[t]}`).join(", "));
  }
}

main()
  .catch((e) => {
    console.error(e);
    fail++;
  })
  .finally(async () => {
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  });
