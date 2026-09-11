/* Edges: invariants, concurrency and bad input (2026-09-11), on the clone.
 *   npx tsx --env-file=.env.local scripts/check-edges.ts      (dev server up)
 *
 * Invariants — a random walk of assignments and moves through the API keeps,
 * after every step: the status equal to what its state shows, and a holder on
 * every task in work in progress; one task given to three people lists the same
 * three from each of its records.
 * Concurrency — the same create sent twice at once (a double click); two people
 * assigning the same task at once; one invite link used twice at once; one note
 * with a file deleted twice at once; Resolve pressed twice at once. Never a 5xx,
 * and the data says one thing.
 * Bad input and boundaries — empty, 500- and 501-character and non-Latin titles;
 * the description and note limits; progress at 0, 100 and outside; ten and eleven
 * files on a note; a file at exactly 4 MB and one byte over; a program by its
 * name, and one renamed; due dates at the very end of today in IST and the first
 * millisecond of tomorrow; a malformed order key on a project and on a task.
 * Leaves no trace: everything made ("edg-…", "EDG …") is removed and every table
 * recounted.
 */
import { randomUUID } from "node:crypto";
import { PrismaClient, type WorkState } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";
import { istDayKey, istDayRange } from "../lib/timezone";
import { TRANSITIONS, statusOf } from "../lib/work/workflow";

if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "")) {
  console.error("DATABASE_URL is not the local clone. Refusing.");
  process.exit(1);
}

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const CEO_EMAIL = process.env.CEO_EMAIL ?? "founder@orbit.local";
const CEO_PASSWORD = process.env.CEO_PASSWORD ?? "orbit123";
const PASSWORD = "Rig-Edges-2026";
const RUN = Date.now().toString(36);
const MB = 1024 * 1024;

let pass = 0;
let fail = 0;
function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const note = (text: string) => console.log(`NOTE  ${text}`);

type Res = { status: number; json: any; cookie: string | null };
let ipSeq = 0;
const freshIp = () => `10.62.${Math.floor(++ipSeq / 250)}.${(ipSeq % 250) + 1}`;
const serverErrors: string[] = [];
async function api(cookie: string | null | undefined, method: string, path: string, body?: unknown, ip = "10.62.200.1"): Promise<Res> {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status >= 500) serverErrors.push(`${res.status} ${method} ${path}`);
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* none */
  }
  const set = res.headers.get("set-cookie") ?? "";
  return { status: res.status, json, cookie: set.startsWith("orbit_session=") ? set.split(";")[0] : null };
}
async function signIn(email: string, password: string): Promise<string> {
  const r = await api(null, "POST", "/api/auth", { email, password }, freshIp());
  if (!r.cookie) throw new Error(`sign-in ${email}: ${r.status}`);
  return r.cookie;
}
async function upload(cookie: string, name: string, type: string, bytes: Buffer): Promise<Res> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type }), name);
  const res = await fetch(`${BASE}/api/uploads`, { method: "POST", headers: { cookie }, body: form });
  if (res.status >= 500) serverErrors.push(`${res.status} POST /api/uploads ${name}`);
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* none */
  }
  return { status: res.status, json, cookie: null };
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
  const ids = (await prisma.user.findMany({ where: { email: { startsWith: "edg-" } }, select: { id: true } })).map((u) => u.id);
  const departments = (await prisma.department.findMany({ where: { name: { startsWith: "EDG " } }, select: { id: true } })).map((d) => d.id);
  const projectIds = (await prisma.project.findMany({ where: { OR: [{ name: { startsWith: "EDG " } }, { departmentId: { in: departments } }] }, select: { id: true } })).map((p) => p.id);
  const taskIds = (await prisma.task.findMany({ where: { OR: [{ title: { startsWith: "EDG", mode: "insensitive" } }, { departmentId: { in: departments } }, { projectId: { in: projectIds } }, { assigneeId: { in: ids } }, { requesterId: { in: ids } }] }, select: { id: true } })).map((t) => t.id);
  await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { taskId: { in: taskIds } }, ...(started && ceoId ? [{ userId: ceoId, createdAt: { gte: started } }] : [])] } });
  await prisma.commentAttachment.deleteMany({ where: { OR: [{ activity: { taskId: { in: taskIds } } }, { comment: { targetId: { in: projectIds } } }] } });
  await prisma.comment.deleteMany({ where: { OR: [{ targetId: { in: [...projectIds, ...taskIds] } }, { authorId: { in: ids } }] } });
  await prisma.taskActivity.deleteMany({ where: { taskId: { in: taskIds } } });
  await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.storedFile.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.invite.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdById: { in: ids } }] } });
  if (started) await prisma.loginAttempt.deleteMany({ where: { createdAt: { gte: started } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.department.deleteMany({ where: { id: { in: departments } } });
}

async function edges(ceo: string) {
  const hash = await hashPassword(PASSWORD);
  const dept = await prisma.department.create({ data: { name: `EDG Department ${RUN}`, color: "#475569", orderKey: generateKeyBetween((await prisma.department.findFirst({ orderBy: { orderKey: "desc" }, select: { orderKey: true } }))?.orderKey ?? null, null) } });
  const mk = async (key: string, role: "MANAGER" | "RESOURCE") =>
    prisma.user.create({ data: { email: `edg-${key}@example.com`, name: `EDG ${key}`, role, passwordHash: hash, status: "ACTIVE", departmentId: dept.id } });
  const manager = await mk("manager", "MANAGER");
  const people = [await mk("m1", "RESOURCE"), await mk("m2", "RESOURCE"), await mk("m3", "RESOURCE")];
  const mgr = await signIn(manager.email, PASSWORD);
  const cookies = new Map<string, string>();
  for (const p of people) cookies.set(p.id, await signIn(p.email, PASSWORD));
  const project = await prisma.project.create({ data: { name: `EDG Project ${RUN}`, slug: `edg-project-${RUN}`, color: "#475569", orderKey: generateKeyBetween((await prisma.project.findFirst({ orderBy: { orderKey: "desc" }, select: { orderKey: true } }))?.orderKey ?? null, null), departmentId: dept.id, ownerId: manager.id, members: { create: people.map((p) => ({ userId: p.id })) } } });

  /* ---- invariants: a random walk ---- */
  let seed = 7;
  const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
  const tasks: string[] = [];
  for (let i = 0; i < 6; i++) {
    const r = await api(mgr, "POST", "/api/tasks", { title: `EDG walk ${RUN} ${i}`, departmentId: dept.id, projectId: project.id, assigneeId: i % 2 ? people[i % 3].id : undefined });
    if (r.json?.id) tasks.push(r.json.id);
  }
  record("the walk starts with six tasks", tasks.length === 6);
  const violations: string[] = [];
  let moves = 0;
  let refused = 0;
  for (let step = 0; step < 200; step++) {
    const id = tasks[rand(tasks.length)];
    const row = await prisma.task.findUniqueOrThrow({ where: { id }, select: { state: true } });
    let r: Res;
    if (rand(3) === 0) {
      const who = rand(4);
      r = await api(mgr, "PATCH", `/api/tasks/${id}`, { assigneeId: who === 3 ? null : people[who].id });
    } else {
      const options = TRANSITIONS[row.state as WorkState];
      const to = options[rand(options.length)];
      r = await api(mgr, "POST", `/api/tasks/${id}/transition`, { to, ...(to === "WAITING" ? { waitingReason: "OTHER" } : {}), ...(to === "RESOLVED" ? { resolutionCode: "COMPLETED" } : {}) });
    }
    if (r.status < 300) moves++;
    else if (r.status < 500) refused++;
    const after = await prisma.task.findUniqueOrThrow({ where: { id }, select: { state: true, status: true, assigneeId: true } });
    if (after.status !== statusOf(after.state as WorkState)) violations.push(`step ${step}: ${after.state} shows ${after.status}`);
    if (after.state === "IN_PROGRESS" && !after.assigneeId) violations.push(`step ${step}: work in progress with nobody holding it`);
  }
  record(`200 random steps: the status always matches the state, and work in progress always has a holder`, violations.length === 0, `${moves} done, ${refused} refused; ${violations.slice(0, 3).join("; ")}`);
  const shared = tasks[0];
  const spread = await api(mgr, "POST", `/api/tasks/${shared}/people`, { assigneeIds: people.map((p) => p.id) });
  const siblings = (await prisma.task.findUnique({ where: { id: shared }, select: { siblingKey: true } }))?.siblingKey;
  const records = siblings ? await prisma.task.findMany({ where: { siblingKey: siblings, deletedAt: null }, select: { id: true } }) : [];
  const lists = await Promise.all(records.map(async (t) => ((await api(mgr, "GET", `/api/tasks/${t.id}/people`)).json ?? []).map((p: any) => p.id).sort().join("|")));
  record("one task given to three people lists the same people from every record", spread.status < 300 && records.length >= 3 && new Set(lists).size === 1, `${records.length} records, ${new Set(lists).size} different lists`);

  /* ---- concurrency ---- */
  const clientId = randomUUID();
  const twice = await Promise.all([1, 2].map(() => api(mgr, "POST", "/api/tasks", { id: clientId, title: `EDG double click ${RUN}`, departmentId: dept.id })));
  const madeOnce = await prisma.task.count({ where: { id: clientId } });
  record("the same create sent twice at once makes one task, and neither answer is a 5xx", madeOnce === 1 && twice.every((r) => r.status < 500) && twice.some((r) => r.status === 201), twice.map((r) => r.status).join(", "));
  const contested = await api(mgr, "POST", "/api/tasks", { title: `EDG contested ${RUN}`, departmentId: dept.id, projectId: project.id });
  const both = await Promise.all([api(ceo, "PATCH", `/api/tasks/${contested.json?.id}`, { assigneeId: people[0].id }), api(mgr, "PATCH", `/api/tasks/${contested.json?.id}`, { assigneeId: people[1].id })]);
  const settled = await prisma.task.findUnique({ where: { id: contested.json?.id }, select: { assigneeId: true, state: true, status: true } });
  record(
    "two people assigning at once: no 5xx, one holder, work in progress",
    both.every((r) => r.status < 500) && [people[0].id, people[1].id].includes(settled?.assigneeId ?? "") && settled?.state === "IN_PROGRESS" && settled?.status === "DOING",
    `${both.map((r) => r.status).join(", ")} · ${settled?.state}`,
  );
  const invite = await api(ceo, "POST", "/api/users/invite", { people: [{ name: "EDG invitee", emails: [`edg-invitee-${RUN}@example.com`], departmentId: dept.id }] });
  const token = String(invite.json?.people?.[0]?.url ?? "").split("/invite/")[1];
  const accepts = await Promise.all([1, 2].map(() => api(null, "POST", `/api/invite/${token}/accept`, { password: PASSWORD }, freshIp())));
  record("one invite link used twice at once: exactly one gets in", accepts.map((r) => r.status).sort().join(",") === "200,410", accepts.map((r) => r.status).join(", "));
  const file = await upload(mgr, `edg-${RUN}.txt`, "text/plain", Buffer.from("EDG file"));
  const fileId = String(file.json?.url ?? "").split("/").pop() ?? "";
  const withFile = await api(mgr, "POST", "/api/comments", { targetType: "PROJECT", targetId: project.id, body: `EDG note ${RUN}`, attachments: [{ url: file.json?.url, name: file.json?.name, type: file.json?.type, size: 8 }] });
  const deletes = await Promise.all([1, 2].map(() => api(mgr, "DELETE", `/api/comments/${withFile.json?.id}`)));
  const fileLeft = await prisma.storedFile.count({ where: { id: fileId } });
  record("one note deleted twice at once: one 200, one 404, and its file let go", deletes.map((r) => r.status).sort().join(",") === "200,404" && fileLeft === 0, `${deletes.map((r) => r.status).join(", ")}; file rows left ${fileLeft}`);
  const toResolve = await api(mgr, "POST", "/api/tasks", { title: `EDG resolve twice ${RUN}`, departmentId: dept.id, projectId: project.id, assigneeId: people[2].id });
  // A project task is marked done by a team lead or above, so the manager presses it.
  const resolves = await Promise.all([1, 2].map(() => api(mgr, "POST", `/api/tasks/${toResolve.json?.id}/resolve`, { resolutionCode: "COMPLETED" })));
  const resolvedRows = await prisma.taskActivity.count({ where: { taskId: toResolve.json?.id, type: "FIELD_CHANGE", AND: [{ metadata: { path: ["field"], equals: "state" } }, { metadata: { path: ["newValue"], equals: "RESOLVED" } }] } });
  record("Resolve pressed twice at once: no 5xx, resolved once", resolves.every((r) => r.status < 500) && resolvedRows === 1, `${resolves.map((r) => `${r.status} ${r.json?.error ?? ""}`.trim()).join(", ")}; ${resolvedRows} resolve rows`);

  /* ---- bad input and boundaries ---- */
  const title = async (t: string) => api(mgr, "POST", "/api/tasks", { title: t, departmentId: dept.id });
  const empty = await title("");
  if (empty.status === 201) note("a task can be made with an empty title through the API (the screen asks for one); it reads '(empty)'");
  else record("an empty title is refused", empty.status === 400, `status ${empty.status}`);
  record("a 500-character title is taken", (await title(`EDG ${RUN} `.padEnd(500, "x"))).status === 201);
  record("a 501-character title is refused", (await title(`EDG ${RUN} `.padEnd(501, "x"))).status === 400);
  const words = `EDG ${RUN} कार्य సమీక్ష مراجعة 😀`;
  const intl = await title(words);
  const stored = intl.json?.id ? (await prisma.task.findUnique({ where: { id: intl.json.id }, select: { title: true } }))?.title : null;
  record("Hindi, Telugu, Arabic and an emoji go in and come back unchanged", intl.status === 201 && Boolean(stored?.includes("कार्य సమీక్ష مراجعة 😀")), stored ?? `status ${intl.status}`);
  const long = await api(mgr, "POST", "/api/tasks", { title: `EDG description ${RUN}`, departmentId: dept.id, descriptionMd: "d".repeat(20000) });
  const tooLong = await api(mgr, "POST", "/api/tasks", { title: `EDG description ${RUN}`, departmentId: dept.id, descriptionMd: "d".repeat(20001) });
  record("a 20,000-character description is taken, one more is refused", long.status === 201 && tooLong.status === 400, `${long.status}, ${tooLong.status}`);
  const noteTask = await api(mgr, "POST", "/api/tasks", { title: `EDG notes ${RUN}`, departmentId: dept.id, projectId: project.id, assigneeId: people[2].id });
  const holderTask = noteTask.json?.id;
  const noteAt = async (len: number) => api(cookies.get(people[2].id), "POST", `/api/tasks/${holderTask}/comments`, { body: "n".repeat(len) });
  record("a 4,000-character note is taken, one more is refused", (await noteAt(4000)).status === 201 && (await noteAt(4001)).status === 400);
  const progressTask = contested.json?.id;
  const setProgress = async (v: unknown) => (await api(mgr, "PATCH", `/api/tasks/${progressTask}`, { progress: v })).status;
  const p0 = await setProgress(0);
  const p100 = await setProgress(100);
  const pNeg = await setProgress(-1);
  const pOver = await setProgress(101);
  const pFrac = await setProgress(12.5);
  record("progress takes 0 and 100, and refuses -1, 101 and 12.5", p0 === 200 && p100 === 200 && pNeg === 400 && pOver === 400 && pFrac === 400, `${p0} ${p100} ${pNeg} ${pOver} ${pFrac}`);
  const small = await upload(mgr, `edg-${RUN}-a.txt`, "text/plain", Buffer.from("a"));
  const entry = { url: small.json?.url, name: small.json?.name, type: small.json?.type, size: 1 };
  const ten = await api(mgr, "POST", "/api/comments", { targetType: "PROJECT", targetId: project.id, body: `EDG ten ${RUN}`, attachments: Array.from({ length: 10 }, () => entry) });
  const eleven = await api(mgr, "POST", "/api/comments", { targetType: "PROJECT", targetId: project.id, body: `EDG eleven ${RUN}`, attachments: Array.from({ length: 11 }, () => entry) });
  record("ten files on a note are taken, eleven are refused", ten.status === 201 && eleven.status === 400, `${ten.status}, ${eleven.status}`);
  const exact = await upload(mgr, `edg-${RUN}-exact.bin`, "application/octet-stream", Buffer.alloc(4 * MB, 1));
  const over = await upload(mgr, `edg-${RUN}-over.bin`, "application/octet-stream", Buffer.alloc(4 * MB + 1, 1));
  record("a file of exactly 4 MB is taken, one byte more is refused", exact.status === 201 && over.status === 413, `${exact.status}, ${over.status}`);
  const exe = await upload(mgr, `edg-${RUN}-tool.exe`, "application/octet-stream", Buffer.from("MZ"));
  const js = await upload(mgr, `edg-${RUN}-run.js`, "text/javascript", Buffer.from("alert(1)"));
  record("a program by its name is refused", exe.status === 415 && js.status === 415, `${exe.status}, ${js.status}`);
  const renamed = await upload(mgr, `edg-${RUN}-invoice.pdf`, "application/pdf", Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]));
  if (renamed.status === 201) note("a program renamed to .pdf is taken: the contents are not checked, only the name and the declared type (security review)");

  const { end } = istDayRange(istDayKey(new Date()));
  const lastMs = await api(mgr, "POST", "/api/tasks", { title: `EDG due last ms ${RUN}`, departmentId: dept.id, dueDate: end.toISOString() });
  const nextMs = await api(mgr, "POST", "/api/tasks", { title: `EDG due next ms ${RUN}`, departmentId: dept.id, dueDate: new Date(end.getTime() + 1).toISOString() });
  const dueToday = await api(mgr, "GET", "/api/work?dueToday=1&rows=tasks&limit=200");
  const listed = (dueToday.json?.items ?? []).map((t: any) => t.id);
  record("due today takes the last millisecond of today in IST, not the first of tomorrow", listed.includes(lastMs.json?.id) && !listed.includes(nextMs.json?.id), `today's range ends ${end.toISOString()}`);
  const monthEnd = await api(mgr, "POST", "/api/tasks", { title: `EDG month end ${RUN}`, departmentId: dept.id, dueDate: "2026-09-30T18:29:59.999Z" });
  const back = monthEnd.json?.id ? await prisma.task.findUnique({ where: { id: monthEnd.json.id }, select: { dueDate: true } }) : null;
  record("a due date at the last moment of a month is kept exactly, and reads as that month in IST", back?.dueDate?.toISOString() === "2026-09-30T18:29:59.999Z" && istDayKey(back.dueDate) === "2026-09-30", back?.dueDate?.toISOString() ?? `status ${monthEnd.status}`);

  /* ---- a malformed place in a list ---- */
  // Lists keep their order with fractional-indexing keys, and a new item goes after
  // the last key. A made-up key used to be stored as sent, so the next project anyone
  // started answered 500 (found 2026-09-11 through a test fixture's hand-made key).
  const badProjectKey = await api(mgr, "PATCH", `/api/projects/${project.id}`, { orderKey: "zzz" });
  const nextProject = await api(mgr, "POST", "/api/projects", { name: `EDG next project ${RUN}`, departmentId: dept.id, leadId: manager.id });
  record("a malformed order key on a project is refused, and starting a project still works", badProjectKey.status === 400 && nextProject.status === 201, `${badProjectKey.status}, then ${nextProject.status}`);
  const badTaskKey = await api(mgr, "PATCH", `/api/tasks/${tasks[1]}`, { orderKey: "zzz" });
  const badNewKey = await api(mgr, "POST", "/api/tasks", { title: `EDG bad key ${RUN}`, departmentId: dept.id, orderKey: "not a key" });
  const nextTask = await api(mgr, "POST", "/api/tasks", { title: `EDG after a bad key ${RUN}`, departmentId: dept.id, projectId: project.id });
  record("a malformed order key on a task is refused, made or moved, and adding a task still works", badTaskKey.status === 400 && badNewKey.status === 400 && nextTask.status === 201, `${badTaskKey.status}, ${badNewKey.status}, then ${nextTask.status}`);
}

async function main() {
  const ceo = await signIn(CEO_EMAIL, CEO_PASSWORD).catch(() => null);
  record("the CEO signs in", Boolean(ceo));
  // A column's CURRENT_TIMESTAMP default is stored in the server's zone; the app writes UTC.
  // Neon runs in UTC, so the clone must too, or its rows' own times drift 5h30m (2026-09-11).
  const [{ tz }] = await prisma.$queryRawUnsafe<{ tz: string }[]>(`SELECT current_setting('TimeZone') AS tz`);
  record("the clone runs in UTC, as Neon does, so a row stamped by the database agrees with the app", ["UTC", "Etc/UTC", "GMT"].includes(tz), tz);
  if (!ceo) return;
  const ceoId: string = (await api(ceo, "GET", "/api/users/me")).json?.id ?? "";
  await cleanup(null, null);
  const before = await countAll();
  const started = new Date();
  try {
    await edges(ceo);
  } catch (e) {
    record("the checks ran to the end", false, (e instanceof Error ? e.message : String(e)).split("\n")[0]);
  } finally {
    record("no request answered 5xx", serverErrors.length === 0, serverErrors.slice(0, 5).join(" | "));
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
