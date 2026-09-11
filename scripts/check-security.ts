/* Security (2026-09-11), on the clone: the attacks Orbit must turn away, and the
 * leaks it must not have.
 *   npx tsx --env-file=.env.local scripts/check-security.ts      (dev server up)
 *
 * Never against the live site — production gets read-only checks by hand (its
 * headers, a signed-out 401). Throwaway accounts ("sec-…") in two departments
 * ("SEC A …", "SEC B …"); leaves no trace.
 *  1. Headers: framing, sniffing, referrer, browser features; no x-powered-by.
 *  2. Sessions: a tampered, foreign-key, unsigned or expired token is refused; a
 *     password change or a reset link ends older sessions; a switched-off or
 *     demoted account loses its powers at once; a signed-out copy (noted).
 *  3. Sign-in: wrong passwords are throttled; a real and an unknown address fail
 *     alike, at sign-in and at "forgot password"; set-up stays shut.
 *  4. Across departments: someone in B cannot read, change, delete, write on, take
 *     or open the files of A's work; nobody raises their own position or invites
 *     above it; private notes stay private, even from the CEO; the Well Being and
 *     admin walls hold; Well Being is the CEO's alone.
 *  5. Input: script in a title or description never runs; an uploaded web page,
 *     SVG or text never renders as a page; paths cannot climb out of uploads; a
 *     huge body or a quote in a search is refused or taken as text.
 *  6. A form on another site cannot act with the person's cookie; cron needs its secret.
 *  7. An emailed reply link answers on a plain visit (noted: a mail scanner could).
 */
import { randomBytes } from "node:crypto";
import { PrismaClient, type Role } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { SignJWT } from "jose";
import { chromium, type Browser } from "playwright";
import { hashInviteToken } from "../lib/invite";
import { signReplyToken } from "../lib/meeting-reply";
import { hashPassword } from "../lib/password";

const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "") || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("Attack checks run against the local clone and this machine's dev server only. Refusing.");
  process.exit(1);
}

const prisma = new PrismaClient();
const CEO_EMAIL = process.env.CEO_EMAIL ?? "founder@orbit.local";
const CEO_PASSWORD = process.env.CEO_PASSWORD ?? "orbit123";
const PASSWORD = "Rig-Security-2026";
const RUN = Date.now().toString(36);
const TODAY = new Date().toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

let pass = 0;
let fail = 0;
function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const note = (text: string) => console.log(`NOTE  ${text}`);
const refused = (s: number) => s === 403 || s === 404;

type Res = { status: number; json: any; headers: Headers; cookie: string | null };
let ipSeq = 0;
const freshIp = () => `10.67.${Math.floor(++ipSeq / 250)}.${(ipSeq % 250) + 1}`;
const serverErrors: string[] = [];
async function call(cookie: string | null | undefined, method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Res> {
  const res = await fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "10.67.250.1", ...extra, ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status >= 500) serverErrors.push(`${res.status} ${method} ${path.slice(0, 80)}`);
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* none */
  }
  const set = res.headers.get("set-cookie") ?? "";
  return { status: res.status, json, headers: res.headers, cookie: set.startsWith("orbit_session=") ? set.split(";")[0] : null };
}
async function signIn(email: string, password = PASSWORD): Promise<string> {
  const r = await call(null, "POST", "/api/auth", { email, password }, { "x-forwarded-for": freshIp() });
  if (!r.cookie) throw new Error(`sign-in ${email}: ${r.status}`);
  return r.cookie;
}
async function upload(cookie: string, name: string, type: string, bytes: Buffer): Promise<Res> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type }), name);
  const res = await fetch(`${BASE}/api/uploads`, { method: "POST", headers: { cookie }, body: form });
  if (res.status >= 500) serverErrors.push(`${res.status} POST /api/uploads ${name}`);
  return { status: res.status, json: await res.json().catch(() => null), headers: res.headers, cookie: null };
}

/* ---- headers ---- */
function headerProblems(h: Headers): string[] {
  const out: string[] = [];
  if (!/frame-ancestors/.test(h.get("content-security-policy") ?? "")) out.push("no frame-ancestors");
  if (!/^(sameorigin|deny)$/i.test(h.get("x-frame-options") ?? "")) out.push("no x-frame-options");
  if (!/nosniff/.test(h.get("x-content-type-options") ?? "")) out.push("no nosniff");
  if (!h.get("referrer-policy")) out.push("no referrer-policy");
  if (!h.get("permissions-policy")) out.push("no permissions-policy");
  if (h.get("x-powered-by")) out.push(`x-powered-by: ${h.get("x-powered-by")}`);
  return out;
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
  const ids = (await prisma.user.findMany({ where: { email: { startsWith: "sec-" } }, select: { id: true } })).map((u) => u.id);
  const departments = (await prisma.department.findMany({ where: { name: { startsWith: "SEC " } }, select: { id: true } })).map((d) => d.id);
  const projectIds = (await prisma.project.findMany({ where: { OR: [{ name: { startsWith: "SEC " } }, { departmentId: { in: departments } }] }, select: { id: true } })).map((p) => p.id);
  const taskIds = (
    await prisma.task.findMany({
      where: { OR: [{ title: { startsWith: "SEC", mode: "insensitive" } }, { departmentId: { in: departments } }, { projectId: { in: projectIds } }, { assigneeId: { in: ids } }, { requesterId: { in: ids } }, { ownerId: { in: ids } }] },
      select: { id: true },
    })
  ).map((t) => t.id);
  const eventIds = (await prisma.calendarEvent.findMany({ where: { OR: [{ createdById: { in: ids } }, { taskId: { in: taskIds } }, { title: { startsWith: "SEC" } }] }, select: { id: true } })).map((e) => e.id);
  await prisma.eventAttendee.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { taskId: { in: taskIds } }, { eventId: { in: eventIds } }, ...(started && ceoId ? [{ userId: ceoId, createdAt: { gte: started } }] : [])] } });
  await prisma.calendarEvent.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.commentAttachment.deleteMany({ where: { OR: [{ activity: { taskId: { in: taskIds } } }, { comment: { targetId: { in: projectIds } } }] } });
  await prisma.comment.deleteMany({ where: { OR: [{ targetId: { in: [...projectIds, ...taskIds] } }, { authorId: { in: ids } }] } });
  await prisma.taskActivity.deleteMany({ where: { taskId: { in: taskIds } } });
  await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.storedFile.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.invite.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdById: { in: ids } }] } });
  await prisma.passwordResetRequest.deleteMany({ where: { userId: { in: ids } } });
  await prisma.emailLog.deleteMany({ where: { userId: { in: ids } } });
  if (started) await prisma.loginAttempt.deleteMany({ where: { createdAt: { gte: started } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.department.deleteMany({ where: { id: { in: departments } } });
}

let browser: Browser | null = null;

async function attacks(ceo: string, ceoId: string) {
  /* ---- set-up ---- */
  const hash = await hashPassword(PASSWORD);
  const nextDeptKey = async () => generateKeyBetween((await prisma.department.findFirst({ orderBy: { orderKey: "desc" }, select: { orderKey: true } }))?.orderKey ?? null, null);
  const deptA = await prisma.department.create({ data: { name: `SEC A ${RUN}`, color: "#475569", orderKey: await nextDeptKey() } });
  const deptB = await prisma.department.create({ data: { name: `SEC B ${RUN}`, color: "#475569", orderKey: await nextDeptKey() } });
  const mk = (key: string, role: Role, departmentId: string | null) =>
    prisma.user.create({ data: { email: `sec-${key}-${RUN}@example.com`, name: `SEC ${key}`, role, passwordHash: hash, status: "ACTIVE", departmentId } });
  const managerA = await mk("manager-a", "MANAGER", deptA.id);
  const memberA = await mk("member-a", "RESOURCE", deptA.id);
  const victim = await mk("victim", "RESOURCE", deptA.id);
  const managerB = await mk("manager-b", "MANAGER", deptB.id);
  const memberB = await mk("member-b", "RESOURCE", deptB.id);
  const person = await mk("person", "PERSON", null);
  const admin = await mk("admin", "ADMIN", null);
  const cMgrA = await signIn(managerA.email);
  const cMemA = await signIn(memberA.email);
  const cMgrB = await signIn(managerB.email);
  const cMemB = await signIn(memberB.email);
  const cPerson = await signIn(person.email);
  const cAdmin = await signIn(admin.email);

  const project = await call(cMgrA, "POST", "/api/projects", { name: `SEC Project ${RUN}`, departmentId: deptA.id, leadId: managerA.id, memberIds: [memberA.id] });
  const task = await call(cMgrA, "POST", "/api/tasks", { title: `SEC task ${RUN}`, departmentId: deptA.id, projectId: project.json?.id, assigneeId: memberA.id });
  const file = await upload(cMgrA, `sec-${RUN}-note.txt`, "text/plain", Buffer.from("SEC a private file"));
  const fileUrl: string = file.json?.url ?? "";
  const noted = await call(cMgrA, "POST", `/api/tasks/${task.json?.id}/comments`, { body: `SEC note ${RUN}`, attachments: [{ url: fileUrl, name: file.json?.name, type: file.json?.type, size: 18 }] });
  const privateTask = await prisma.task.create({ data: { title: `SEC private ${RUN}`, orderKey: generateKeyBetween(null, null), isPrivate: true, ownerId: memberA.id, requesterId: memberA.id, state: "NEW", status: "TODO" } });
  record("set-up: a project, a task and a note with a file in department A", project.status === 201 && task.status === 201 && file.status === 201 && noted.status === 201, `${project.status}, ${task.status}, ${file.status}, ${noted.status}`);
  const taskId: string = task.json?.id ?? "none";

  /* ---- 1. headers ---- */
  const loginPage = await fetch(`${BASE}/login`, { redirect: "manual" });
  record("headers: the login page carries the security headers, and no x-powered-by", headerProblems(loginPage.headers).length === 0, headerProblems(loginPage.headers).join("; "));
  const signedOut = await fetch(`${BASE}/api/work`);
  record("headers: …a signed-out 401 too", signedOut.status === 401 && headerProblems(signedOut.headers).length === 0, `${signedOut.status}; ${headerProblems(signedOut.headers).join("; ")}`);
  const workPage = await fetch(`${BASE}/work`, { headers: { cookie: cMgrA }, redirect: "manual" });
  record("headers: …and a signed-in page", headerProblems(workPage.headers).length === 0, headerProblems(workPage.headers).join("; "));

  /* ---- 4. across departments ---- */
  const readById = await call(cMemB, "GET", `/api/tasks/${taskId}`);
  const readByNumber = await call(cMemB, "GET", `/api/work/${task.json?.number}`);
  record("department B cannot read A's task, by id or by number", refused(readById.status) && refused(readByNumber.status), `${readById.status}, ${readByNumber.status}`);
  const edit = await call(cMemB, "PATCH", `/api/tasks/${taskId}`, { title: `SEC taken over ${RUN}` });
  const remove = await call(cMemB, "DELETE", `/api/tasks/${taskId}`);
  const still = await prisma.task.findUnique({ where: { id: taskId }, select: { title: true, deletedAt: true } });
  record("…nor change or delete it", refused(edit.status) && refused(remove.status) && still?.title === task.json?.title && !still?.deletedAt, `${edit.status}, ${remove.status}; title now "${still?.title}", deleted ${Boolean(still?.deletedAt)}`);
  const write = await call(cMemB, "POST", `/api/tasks/${taskId}/comments`, { body: "SEC from B" });
  const thread = await call(cMemB, "GET", `/api/comments?targetType=PROJECT&targetId=${project.json?.id}`);
  record("…nor write on it, nor read its project's notes", refused(write.status) && refused(thread.status), `${write.status}, ${thread.status}`);
  const take = await call(cMemB, "POST", `/api/tasks/${taskId}/assign`, { assigneeId: memberB.id });
  record("…nor take it", refused(take.status), String(take.status));
  const openFile = await fetch(BASE + fileUrl, { headers: { cookie: cMemB } });
  record("…nor open the file on its note", openFile.status === 404, String(openFile.status));
  const meetingOnA = await call(cMgrB, "POST", "/api/events", { title: `SEC meeting ${RUN}`, date: TOMORROW, startTime: "11:00", attendeeIds: [managerB.id], taskId });
  record("a manager in B cannot hang a meeting on A's task", refused(meetingOnA.status), `${meetingOnA.status} ${meetingOnA.json?.error ?? ""}`.trim());
  const raiseSelf = await call(cMemA, "PATCH", `/api/users/${memberA.id}`, { role: "FOUNDER" });
  const inviteAbove = await call(cMemA, "POST", "/api/users/invite", { people: [{ emails: [`sec-raised-${RUN}@example.com`], role: "CO_FOUNDER" }] });
  const managerAbove = await call(cMgrA, "POST", "/api/users/invite", { people: [{ emails: [`sec-raised-two-${RUN}@example.com`], role: "HOD", departmentId: deptA.id }] });
  record("nobody raises their own position, or invites above their own", refused(raiseSelf.status) && refused(inviteAbove.status) && refused(managerAbove.status), `${raiseSelf.status}, ${inviteAbove.status}, ${managerAbove.status}`);
  const placeInB = await call(cMgrA, "POST", "/api/users/invite", { people: [{ emails: [`sec-placed-${RUN}@example.com`], departmentId: deptB.id }] });
  record("a manager cannot place a new person in another department", placeInB.status === 403, String(placeInB.status));
  const privateByCeo = await call(ceo, "GET", `/api/tasks/${privateTask.id}`);
  const privateByManager = await call(cMgrA, "GET", `/api/tasks/${privateTask.id}`);
  record("a private note stays its owner's, even from the CEO and their manager", refused(privateByCeo.status) && refused(privateByManager.status), `${privateByCeo.status}, ${privateByManager.status}`);
  const personWork = await call(cPerson, "GET", "/api/work");
  const personTask = await call(cPerson, "POST", "/api/tasks", { title: `SEC by the person ${RUN}` });
  const adminWork = await call(cAdmin, "GET", "/api/work");
  const wellBeing = await call(cMgrA, "GET", "/api/routine");
  record("the walls hold: a Well Being login and the admin reach no work; Well Being is the CEO's alone", personWork.status === 403 && personTask.status === 403 && adminWork.status === 403 && wellBeing.status === 403, `${personWork.status}, ${personTask.status}, ${adminWork.status}, ${wellBeing.status}`);

  /* ---- 3. sign-in ---- */
  const oneIp = "10.67.249.9";
  const tries: number[] = [];
  for (let i = 0; i < 9; i++) tries.push((await call(null, "POST", "/api/auth", { email: memberA.email, password: "wrong-password" }, { "x-forwarded-for": oneIp })).status);
  const rightAfter = await call(null, "POST", "/api/auth", { email: memberA.email, password: PASSWORD }, { "x-forwarded-for": oneIp });
  record("sign-in: after eight wrong passwords the ninth is throttled, and so is the right one straight after", tries.slice(0, 8).every((s) => s === 401) && tries[8] === 429 && rightAfter.status === 429, `${tries.join(",")} then ${rightAfter.status}`);
  const realWrong = await call(null, "POST", "/api/auth", { email: memberA.email, password: "wrong-password" }, { "x-forwarded-for": freshIp() });
  const unknownWrong = await call(null, "POST", "/api/auth", { email: `sec-nobody-${RUN}@example.com`, password: "wrong-password" }, { "x-forwarded-for": freshIp() });
  record("sign-in: a real address and an unknown one fail alike", realWrong.status === unknownWrong.status && realWrong.json?.error === unknownWrong.json?.error, `${realWrong.status} / ${unknownWrong.status}`);
  const resetReal = await call(null, "POST", "/api/password-reset/request", { email: memberA.email }, { "x-forwarded-for": freshIp() });
  const resetUnknown = await call(null, "POST", "/api/password-reset/request", { email: `sec-nobody-${RUN}@example.com` }, { "x-forwarded-for": freshIp() });
  record("forgot password: a real address and an unknown one get the same answer", resetReal.status === resetUnknown.status && JSON.stringify(resetReal.json) === JSON.stringify(resetUnknown.json), `${resetReal.status} / ${resetUnknown.status}`);
  let throttled = 0;
  for (let i = 0; i < 12; i++) if ((await call(null, "POST", "/api/auth", { email: memberA.email, password: "wrong-password" }, { "x-forwarded-for": freshIp() })).status === 429) throttled++;
  note(`sign-in: twelve wrong passwords, each from a different X-Forwarded-For, were throttled ${throttled} times — the limit keys on that header, which Vercel sets itself, but a server reached directly takes it from the caller`);
  const intruder = `sec-intruder-${RUN}@example.com`;
  const setUp = await call(null, "POST", "/api/auth/bootstrap", { passcode: "a-guess", name: "SEC Intruder", email: intruder, password: "Rig-Intruder-2026" }, { "x-forwarded-for": freshIp() });
  record("set-up: once an account exists, the first-run door stays shut", [401, 403, 410].includes(setUp.status) && (await prisma.user.count({ where: { email: intruder } })) === 0, String(setUp.status));

  /* ---- 2. sessions ---- */
  const me = (cookie: string | null) => call(cookie, "GET", "/api/users/me");
  const cVictim = await signIn(victim.email);
  record("sessions: a real token works", (await me(cVictim)).status === 200);
  const raw = cVictim.slice("orbit_session=".length);
  const [, payloadPart] = raw.split(".");
  const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString()) as { role: string; name: string; v: number };
  const tampered = `orbit_session=${raw.slice(0, -2)}${raw.endsWith("AA") ? "BB" : "AA"}`;
  record("sessions: a token with a changed signature is refused", (await me(tampered)).status === 401);
  const foreign = await new SignJWT({ role: claims.role, name: claims.name, v: claims.v }).setProtectedHeader({ alg: "HS256" }).setSubject(victim.id).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("a-key-that-is-not-orbits-000000"));
  record("sessions: a token signed with another key is refused", (await me(`orbit_session=${foreign}`)).status === 401);
  const unsigned = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ ...claims, role: "FOUNDER", sub: victim.id })).toString("base64url")}.`;
  record("sessions: an unsigned token claiming to be the CEO is refused", (await me(`orbit_session=${unsigned}`)).status === 401);
  const now = Math.floor(Date.now() / 1000);
  const expired = await new SignJWT({ role: claims.role, name: claims.name, v: claims.v }).setProtectedHeader({ alg: "HS256" }).setSubject(victim.id).setIssuedAt(now - 7200).setExpirationTime(now - 3600).sign(new TextEncoder().encode(process.env.AUTH_SECRET ?? ""));
  record("sessions: an expired token is refused", (await me(`orbit_session=${expired}`)).status === 401);

  const copy = await signIn(victim.email);
  await call(copy, "DELETE", "/api/auth");
  const afterSignOut = await me(copy);
  // Signing out ends every session of the account (owner, 2026-09-12), so a copied token dies with it.
  record("sessions: signing out ends a copied token too", afterSignOut.status === 401, String(afterSignOut.status));

  const first = await signIn(victim.email);
  const second = await signIn(victim.email);
  const changed = "Rig-Security-Changed-2026";
  let change = await call(first, "POST", "/api/users/me/password", { current: PASSWORD, next: changed });
  if (change.status === 405) change = await call(first, "PATCH", "/api/users/me/password", { current: PASSWORD, next: changed });
  record("sessions: changing a password ends the account's other sessions", change.status === 200 && (await me(second)).status === 401 && (await me(change.cookie)).status === 200, `change ${change.status}`);

  const beforeReset = await signIn(victim.email, changed);
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 3_600_000);
  // As if the admin's reset link had been emailed: the same invite row, with a token this check knows.
  await prisma.invite.upsert({
    where: { userId: victim.id },
    update: { tokenHash: hashInviteToken(rawToken), expiresAt, consumedAt: null, createdById: ceoId },
    create: { userId: victim.id, tokenHash: hashInviteToken(rawToken), expiresAt, createdById: ceoId },
  });
  const resetTo = "Rig-Security-Reset-2026";
  const accepted = await call(null, "POST", `/api/invite/${rawToken}/accept`, { password: resetTo }, { "x-forwarded-for": freshIp() });
  const olderAfterReset = await me(beforeReset);
  record("sessions: setting a password from a reset link ends the account's older sessions", accepted.status === 200 && olderAfterReset.status === 401, `accept ${accepted.status}; the older session answers ${olderAfterReset.status}`);

  const beforeOff = await signIn(victim.email, resetTo);
  const off = await call(ceo, "PATCH", `/api/users/${victim.id}`, { disable: true });
  record("sessions: switching an account off ends its sessions at once", off.status === 200 && (await me(beforeOff)).status === 401, `switch off ${off.status}`);
  const demote = await call(ceo, "PATCH", `/api/users/${managerB.id}`, { role: "RESOURCE" });
  const schedule = await call(cMgrB, "POST", "/api/events", { title: `SEC meeting ${RUN}`, date: TOMORROW, startTime: "11:00", attendeeIds: [] });
  record("sessions: a demoted manager's open session loses manager powers at once", demote.status === 200 && (schedule.status === 403 || schedule.status === 401), `demote ${demote.status}; schedule ${schedule.status}`);

  /* ---- 5. input ---- */
  const xss = await call(cMgrA, "POST", "/api/tasks", {
    title: `SEC <img src=x onerror="window.__orbitXss=1"> ${RUN}`,
    departmentId: deptA.id,
    descriptionMd: `[open](javascript:window.__orbitXss=2) <script>window.__orbitXss=3</script> <img src=x onerror="window.__orbitXss=4">`,
  });
  const served = async (name: string, type: string, body: string) => {
    const up = await upload(cMgrA, name, type, Buffer.from(body));
    if (!up.json?.url) return { up: up.status, type: "", disposition: "", csp: "", nosniff: false };
    const res = await fetch(BASE + up.json.url, { headers: { cookie: cMgrA } });
    return { up: up.status, type: res.headers.get("content-type") ?? "", disposition: res.headers.get("content-disposition") ?? "", csp: res.headers.get("content-security-policy") ?? "", nosniff: /nosniff/.test(res.headers.get("x-content-type-options") ?? "") };
  };
  const page_ = await served(`sec-${RUN}.html`, "text/html", "<script>alert(1)</script>");
  record("uploads: a web page downloads, sandboxed, and never opens as a page", page_.up === 415 || (page_.type === "application/octet-stream" && page_.disposition.startsWith("attachment") && /sandbox/.test(page_.csp)), `${page_.up}; ${page_.type}`);
  const svg = await served(`sec-${RUN}.svg`, "image/svg+xml", `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`);
  record("uploads: an SVG carrying a script downloads, sandboxed", svg.disposition.startsWith("attachment") && /sandbox/.test(svg.csp), `${svg.type}; ${svg.disposition.slice(0, 24)}`);
  const text = await served(`sec-${RUN}.txt`, "text/plain", "<script>alert(1)</script>");
  record("uploads: text with a script inside shows as plain text, never sniffed into a page", text.type.startsWith("text/plain") && text.nosniff, `${text.type}; nosniff ${text.nosniff}`);
  const renamed = await served(`sec-${RUN}-invoice.pdf`, "application/pdf", "MZ not really a pdf");
  if (renamed.up === 201) note(`uploads: a program renamed to .pdf is taken and served as ${renamed.type}: only the name and declared type are checked, never the contents (with nosniff, a browser shows a broken PDF)`);
  const climbs = await Promise.all(["..%2F..%2Fpackage.json", "%2e%2e%2f%2e%2e%2f.env.local", "..%5C..%5C.env"].map(async (p) => (await fetch(`${BASE}/api/uploads/${p}`, { headers: { cookie: cMgrA } })).status));
  record("uploads: an address cannot climb out of the file store", climbs.every((s) => s === 404 || s === 400), climbs.join(", "));
  const huge = await call(cMgrA, "POST", "/api/tasks", { title: "x".repeat(5 * 1024 * 1024), departmentId: deptA.id });
  record("a 5 MB title is refused cleanly", huge.status === 400 || huge.status === 413, String(huge.status));
  const quoted = await call(cMgrA, "GET", `/api/work?rows=tasks&open=false&q=${encodeURIComponent("' OR 1=1 --")}`);
  record("a quote in a search is only text", quoted.status === 200 && quoted.json?.total === 0, `${quoted.status}, total ${quoted.json?.total}`);

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  let dialogs = 0;
  page.on("dialog", (d) => {
    dialogs++;
    void d.dismiss();
  });
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', managerA.email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 });
  const ran: string[] = [];
  for (const path of [`/work/${xss.json?.number}`, "/work?f=all", "/"]) {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const fired = await page.evaluate(`typeof window.__orbitXss === "undefined" ? 0 : window.__orbitXss`);
    const links = await page.evaluate(`document.querySelectorAll('a[href^="javascript:"]').length`);
    if (fired || links) ran.push(`${path}: fired ${fired}, javascript: links ${links}`);
  }
  record("script in a title or a description never runs, on the record, the list or Today", xss.status === 201 && ran.length === 0 && dialogs === 0, ran.join("; ") || `created ${xss.status}`);

  /* ---- 6. another site's form, and cron ---- */
  const evil = await context.newPage();
  const form = `<form method="POST" action="${BASE}/api/tasks" enctype="text/plain"><input name='{"title":"SEC csrf ${RUN}","departmentId":"${deptA.id}","x":"' value='"}'></form><script>document.forms[0].submit()</script>`;
  await evil.goto(`data:text/html,${encodeURIComponent(form)}`).catch(() => undefined);
  await evil.waitForTimeout(3000);
  const forged = await prisma.task.count({ where: { title: `SEC csrf ${RUN}` } });
  record("a form on another site cannot make a task with the person's cookie", forged === 0, `${forged} made`);
  await context.close();
  const cronBare = await call(null, "GET", "/api/cron/snooze-wake");
  const cronWrong = await call(null, "GET", "/api/cron/snooze-wake", undefined, { authorization: "Bearer not-the-secret" });
  record("cron jobs refuse a caller without the secret", cronBare.status === 401 && cronWrong.status === 401, `${cronBare.status}, ${cronWrong.status}`);

  /* ---- 7. reply links ---- */
  const event = await prisma.calendarEvent.create({ data: { title: `SEC review ${RUN}`, date: new Date(`${TODAY}T00:00:00.000Z`), createdById: managerA.id, isMeeting: true } });
  const attendee = await prisma.eventAttendee.create({ data: { eventId: event.id, userId: memberA.id } });
  const token = await signReplyToken(attendee.id, "NO");
  const visit = await fetch(`${BASE}/r/${token}`);
  const replied = await prisma.eventAttendee.findUnique({ where: { id: attendee.id }, select: { response: true } });
  if (replied?.response === "NO") note(`reply links: a plain visit to the emailed "Can't" link (status ${visit.status}) records the reply and tells the organiser — a mail scanner that opens links would do the same`);
  else record("reply links: a plain visit records nothing until the person confirms", visit.status < 500, String(visit.status));
}

async function main() {
  const ceo = await signIn(CEO_EMAIL, CEO_PASSWORD).catch(() => null);
  record("the CEO signs in", Boolean(ceo));
  if (!ceo) return;
  const ceoId: string = (await call(ceo, "GET", "/api/users/me")).json?.id ?? "";
  await cleanup(null, null);
  const before = await countAll();
  const started = new Date();
  try {
    await attacks(ceo, ceoId);
  } catch (e) {
    record("the checks ran to the end", false, (e instanceof Error ? e.message : String(e)).split("\n")[0]);
  } finally {
    await browser?.close();
    record("no request answered 5xx", serverErrors.length === 0, serverErrors.slice(0, 5).join(" | "));
    await cleanup(started, ceoId);
    const after = await countAll();
    // LoginAttempt is trimmed by the app itself: every failed sign-in deletes rows older than ten minutes.
    const changed = Object.keys({ ...before, ...after }).filter((t) => t !== "LoginAttempt" && before[t] !== after[t]);
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
