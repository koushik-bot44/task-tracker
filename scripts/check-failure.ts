/* Failure (2026-09-11), on the clone: what happens when something Orbit depends on
 * is down or slow.
 *   npx tsx --env-file=.env.local scripts/check-failure.ts      (dev server up)
 *
 * Email and WhatsApp: a task message is sent — in a fresh process each time, since
 * each service reads its settings once — with both services switched off, refusing
 * connections, answering with an error, and hanging. Every time: the bell line is
 * written, nothing stays reserved (so a retry can send), and the send gives up in
 * time rather than holding the request that caused it. The relay and the Twilio API
 * are fakes on this machine and the address is on example.org, which takes no mail,
 * so nothing leaves the laptop. Push is not covered: requests do not wait for it.
 * A slow database: a task's row is locked for 3 seconds while its manager saves a
 * change, and the save waits and lands; locked for 7 seconds, the save may fail,
 * but lands whole or not at all.
 * Throwaway accounts ("flr-…"); leaves no trace.
 */
import { spawn } from "node:child_process";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer as createTcpServer, type AddressInfo, type Server as TcpServer } from "node:net";
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";

if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "")) {
  console.error("DATABASE_URL is not the local clone. Refusing.");
  process.exit(1);
}

/* ---- the child: one send, with whatever settings the parent gave it ---- */
async function sendOnce() {
  const { sendMessage } = await import("../lib/notify");
  const t0 = performance.now();
  let error = "";
  try {
    const msg = {
      kind: "task_given",
      refId: process.env.FLR_REF ?? "",
      title: "FLR a task for you",
      body: "FLR failure check",
      url: "/",
      tag: "flr",
      email: { subject: "FLR failure check", html: "<p>FLR failure check</p>", text: "FLR failure check" },
      whatsapp: "FLR failure check",
      vars: {},
    } as unknown as Parameters<typeof sendMessage>[1];
    await sendMessage([process.env.FLR_USER ?? ""], msg);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  console.log(`RESULT ${JSON.stringify({ ms: Math.round(performance.now() - t0), error })}`);
  process.exit(0);
}

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PASSWORD = "Rig-Failure-2026";
const RUN = Date.now().toString(36);

let pass = 0;
let fail = 0;
function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const note = (text: string) => console.log(`NOTE  ${text}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SERVICES_OFF: Record<string, string | undefined> = {
  SMTP_HOST: undefined, SMTP_PORT: undefined, SMTP_USER: undefined, SMTP_PASS: undefined, SMTP_SECURE: undefined, EMAIL_FROM: undefined, EMAIL_REPLY_TO: undefined,
  TWILIO_ACCOUNT_SID: undefined, TWILIO_AUTH_TOKEN: undefined, TWILIO_WHATSAPP_FROM: undefined, TWILIO_CONTENT_SID: undefined, TWILIO_API_BASE: undefined,
  VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined, VAPID_SUBJECT: undefined,
};
const fakeServices = (smtpPort: number, twilioPort: number) => ({
  ...SERVICES_OFF,
  SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtpPort), SMTP_SECURE: "false", SMTP_USER: "flr", SMTP_PASS: "flr", EMAIL_FROM: "Orbit check <flr@example.org>",
  TWILIO_ACCOUNT_SID: "ACflr", TWILIO_AUTH_TOKEN: "flr", TWILIO_WHATSAPP_FROM: "whatsapp:+10000000000", TWILIO_API_BASE: `http://127.0.0.1:${twilioPort}`,
});

function child(env: Record<string, string | undefined>, capMs: number): Promise<{ ms: number; error: string } | null> {
  return new Promise((resolve) => {
    const childEnv: Record<string, string | undefined> = { ...process.env, ...env };
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete childEnv[k];
    const proc = spawn("npx", ["tsx", process.argv[1], "send"], { env: childEnv as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve(null);
    }, capMs);
    proc.on("exit", () => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith("RESULT "));
      resolve(line ? JSON.parse(line.slice(7)) : { ms: -1, error: out.trim().split("\n").slice(-2).join(" ") });
    });
  });
}

const portOf = (s: HttpServer | TcpServer) => (s.address() as AddressInfo).port;
const listen = <T extends HttpServer | TcpServer>(s: T) => new Promise<T>((r) => s.listen(0, "127.0.0.1", () => r(s)));

async function countAll(): Promise<Record<string, number>> {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%' ORDER BY tablename`);
  const out: Record<string, number> = {};
  for (const { tablename } of tables) {
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${tablename}"`);
    out[tablename] = Number(n);
  }
  return out;
}

async function cleanup(started: Date | null) {
  const ids = (await prisma.user.findMany({ where: { email: { startsWith: "flr-" } }, select: { id: true } })).map((u) => u.id);
  const departments = (await prisma.department.findMany({ where: { name: { startsWith: "FLR " } }, select: { id: true } })).map((d) => d.id);
  const taskIds = (await prisma.task.findMany({ where: { OR: [{ departmentId: { in: departments } }, { assigneeId: { in: ids } }, { requesterId: { in: ids } }] }, select: { id: true } })).map((t) => t.id);
  await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { taskId: { in: taskIds } }] } });
  await prisma.emailLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.whatsAppLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.taskActivity.deleteMany({ where: { taskId: { in: taskIds } } });
  await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  if (started) await prisma.loginAttempt.deleteMany({ where: { createdAt: { gte: started } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.department.deleteMany({ where: { id: { in: departments } } });
}

const servers: (HttpServer | TcpServer)[] = [];

async function checks() {
  const hash = await hashPassword(PASSWORD);
  const lastDept = await prisma.department.findFirst({ orderBy: { orderKey: "desc" }, select: { orderKey: true } });
  const dept = await prisma.department.create({ data: { name: `FLR Department ${RUN}`, color: "#475569", orderKey: generateKeyBetween(lastDept?.orderKey ?? null, null) } });
  const member = await prisma.user.create({ data: { email: "flr-member@example.org", name: "FLR Member", role: "RESOURCE", passwordHash: hash, status: "ACTIVE", departmentId: dept.id, phone: "+10000000000", whatsappOptIn: true, emailOptIn: true } });
  const manager = await prisma.user.create({ data: { email: "flr-manager@example.org", name: "FLR Manager", role: "MANAGER", passwordHash: hash, status: "ACTIVE", departmentId: dept.id } });

  /* ---- email and WhatsApp ---- */
  const closed = await listen(createTcpServer());
  const closedPort = portOf(closed);
  await new Promise((r) => closed.close(r));
  const smtpDown = await listen(createTcpServer((sock) => {
    sock.write("421 flr relay is down\r\n");
    sock.end();
  }));
  const smtpHang = await listen(createTcpServer(() => undefined));
  const twilioDown = await listen(createHttpServer((_req, res) => {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ code: 20500, message: "flr outage" }));
  }));
  const twilioHang = await listen(createHttpServer(() => undefined));
  servers.push(smtpDown, smtpHang, twilioDown, twilioHang);

  const scenarios = [
    { label: "both switched off", env: SERVICES_OFF, budget: 3000, cap: 40000 },
    { label: "both refusing connections", env: fakeServices(closedPort, closedPort), budget: 5000, cap: 40000 },
    { label: "both answering with an error", env: fakeServices(portOf(smtpDown), portOf(twilioDown)), budget: 5000, cap: 40000 },
    { label: "both hanging", env: fakeServices(portOf(smtpHang), portOf(twilioHang)), budget: 25000, cap: 45000 },
  ];
  for (const s of scenarios) {
    const refId = `flr-${RUN}-${s.label.replace(/\W+/g, "-")}`;
    // Counted as a difference: the clock a row is stamped with need not match this one.
    const bellsBefore = await prisma.notification.count({ where: { userId: member.id, type: "task_given" } });
    const res = await child({ ...s.env, FLR_USER: member.id, FLR_REF: refId }, s.cap);
    const bell = (await prisma.notification.count({ where: { userId: member.id, type: "task_given" } })) - bellsBefore;
    const emailHeld = await prisma.emailLog.count({ where: { refId } });
    const whatsAppHeld = await prisma.whatsAppLog.count({ where: { refId } });
    const reserved = emailHeld + whatsAppHeld;
    record(`${s.label}: the send gives up within ${s.budget / 1000} s, without an error`, Boolean(res) && res!.error === "" && res!.ms >= 0 && res!.ms <= s.budget, res ? `${res.ms} ms${res.error ? `; ${res.error}` : ""}` : `still waiting after ${s.cap / 1000} s`);
    record(`${s.label}: the bell line is written`, bell === 1, String(bell));
    record(`${s.label}: nothing stays reserved, so a retry can send`, reserved === 0, `email ${emailHeld}, WhatsApp ${whatsAppHeld}`);
  }

  /* ---- a slow database ---- */
  const auth = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "10.65.0.1" }, body: JSON.stringify({ email: manager.email, password: PASSWORD }) });
  const cookie = (auth.headers.get("set-cookie") ?? "").split(";")[0];
  const patch = async (body: unknown) => {
    const t0 = performance.now();
    const res = await fetch(`${BASE}/api/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify(body) });
    return { status: res.status, ms: Math.round(performance.now() - t0) };
  };
  const made = await fetch(`${BASE}/api/tasks`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ title: `FLR slow database ${RUN}`, departmentId: dept.id }) });
  const taskId = ((await made.json()) as { id?: string }).id ?? "";
  record("a task to save changes to", made.status === 201 && Boolean(taskId), `status ${made.status}`);
  if (!taskId) return;
  const lockFor = (ms: number) =>
    prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(`SELECT id FROM "Task" WHERE id = $1 FOR UPDATE`, taskId);
      await sleep(ms);
    }, { timeout: ms + 10000, maxWait: 5000 });

  const held = lockFor(3000);
  await sleep(400);
  const quick = await patch({ priority: "HIGH" });
  await held;
  const afterQuick = await prisma.task.findUnique({ where: { id: taskId }, select: { priority: true } });
  record("the database stalls for 3 s: the save waits, then lands", quick.status === 200 && afterQuick?.priority === "HIGH" && quick.ms >= 2000, `${quick.status} after ${quick.ms} ms`);

  const heldLong = lockFor(7000);
  await sleep(400);
  const slow = await patch({ priority: "LOW", title: `FLR slow database changed ${RUN}` });
  await heldLong;
  const afterSlow = await prisma.task.findUnique({ where: { id: taskId }, select: { priority: true, title: true } });
  const landed = afterSlow?.priority === "LOW" && Boolean(afterSlow?.title.includes("changed"));
  const untouched = afterSlow?.priority === "HIGH" && !afterSlow?.title.includes("changed");
  record("the database stalls for 7 s: the save lands whole or not at all", slow.status === 200 ? landed : untouched, `${slow.status} after ${slow.ms} ms; ${landed ? "landed" : untouched ? "untouched" : "half-written"}`);
  if (slow.status >= 500) note(`a save that waits about 5 s or more on the database answers ${slow.status} with a generic message; nothing was half-written`);
}

async function main() {
  await cleanup(null);
  const before = await countAll();
  const started = new Date();
  try {
    await checks();
  } catch (e) {
    record("the checks ran to the end", false, (e instanceof Error ? e.message : String(e)).split("\n")[0]);
  } finally {
    for (const s of servers) (s as { closeAllConnections?: () => void }).closeAllConnections?.();
    await cleanup(started);
    const after = await countAll();
    const changed = Object.keys({ ...before, ...after }).filter((t) => before[t] !== after[t]);
    record("the run leaves no trace: every table holds what it held before", changed.length === 0, changed.map((t) => `${t} ${before[t]}→${after[t]}`).join(", "));
  }
}

if (process.argv[2] === "send") {
  void sendOnce();
} else {
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
}
