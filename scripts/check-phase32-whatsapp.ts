/**
 * Phase 32 — WhatsApp meeting notifications.
 *
 * Part A (in-process, MOCK Twilio via TWILIO_API_BASE): the sender's recipient
 * filtering (phone present + whatsappOptIn + active), reservation-first dedupe,
 * graceful failure (send fails -> reservation released, no throw), sandbox
 * non-join handling, AND the meeting wiring — notifyEvent now sends WhatsApp as a
 * further channel on the SAME recipient set without disturbing the bell.
 *
 * Part B (against the running app, where TWILIO is UNSET): the self phone/opt-in
 * PATCH is caller-scoped, and the manager-only + config-gated test endpoint.
 *
 * Throwaway p32- actors on the shared prod DB; hard teardown.
 */
import http from "node:http";
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const BASE = "http://localhost:3000";
const PREFIX = "p32-";
const MOCK_PORT = 34599;
const prisma = new PrismaClient();
let pass = 0, fail = 0;
function rec(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(60)} got ${JSON.stringify(got)}`);
  ok ? pass++ : fail++;
}

// --- mock Twilio ---------------------------------------------------------------
let mockMode: "ok" | "auth" | "notjoined" = "ok";
let lastReqBody = "";
const mock = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    lastReqBody = body;
    if (mockMode === "ok") {
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sid: "SM_mock", status: "queued" }));
    } else if (mockMode === "notjoined") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 63015, message: "not joined the sandbox" }));
    } else {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 20003, message: "authenticate" }));
    }
  });
});

async function signIn(email: string, password: string) {
  const r = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`sign-in ${email}: ${r.status}`);
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
async function call(cookie: string, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let json: any = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
}

async function teardown() {
  const ids = (await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } })).map((u) => u.id);
  await prisma.whatsAppLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.eventAttendee.deleteMany({ where: { OR: [{ userId: { in: ids } }, { event: { createdById: { in: ids } } }] } });
  await prisma.calendarEvent.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.projectMember.deleteMany({ where: { userId: { in: ids } } });
  await prisma.emailLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.project.deleteMany({ where: { OR: [{ ownerId: { in: ids } }, { leadId: { in: ids } }] } });
  await prisma.department.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

async function main() {
  // Configure the MOCK Twilio BEFORE any send (ensureConfigured reads env lazily).
  process.env.TWILIO_ACCOUNT_SID = "ACmock";
  process.env.TWILIO_AUTH_TOKEN = "mocktoken";
  process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+17372508034";
  process.env.TWILIO_CONTENT_SID = "HXtesttemplate"; // template mode (the trial requires it)
  process.env.TWILIO_API_BASE = `http://127.0.0.1:${MOCK_PORT}`;
  await new Promise<void>((r) => mock.listen(MOCK_PORT, r));

  // Import AFTER env is set (module body reads no env; functions read lazily).
  const { sendWhatsAppToUsers } = await import("../lib/whatsapp");
  const { notifyEvent } = await import("../lib/notify");

  await teardown();
  const mk = async (label: string, role: "MANAGER" | "TEAM_LEAD" | "RESOURCE", opts: { phone?: string | null; whatsappOptIn?: boolean; disabled?: boolean } = {}) => {
    const email = `${PREFIX}${label}@orbit.local`;
    const password = generateTempPassword(16);
    const u = await prisma.user.create({
      data: {
        email, name: `P32 ${label}`, role, status: "ACTIVE",
        phone: opts.phone ?? null,
        whatsappOptIn: opts.whatsappOptIn ?? true,
        disabledAt: opts.disabled ? new Date() : null,
        passwordHash: await hashPassword(password),
      },
    });
    return { id: u.id, email, password };
  };

  const M = await mk("owner", "MANAGER");
  const A = await mk("optin", "RESOURCE", { phone: "+911111111111", whatsappOptIn: true });   // reachable
  const B = await mk("optout", "RESOURCE", { phone: "+912222222222", whatsappOptIn: false });  // opted out
  const C = await mk("nophone", "RESOURCE", { phone: null, whatsappOptIn: true });              // no number
  const dept = await prisma.department.create({ data: { name: "P32 Dept", color: "#475569", orderKey: "a0", createdById: M.id } });
  const project = await prisma.project.create({ data: { name: "P32 Proj", slug: `${PREFIX}proj`, color: "#2f68f0", orderKey: "a0", ownerId: M.id, departmentId: dept.id } });

  const makeMeeting = async (title: string) => {
    const ev = await prisma.calendarEvent.create({
      data: { title, description: "d", date: new Date("2026-09-01T00:00:00Z"), startTime: "10:00", endTime: "11:00", isMeeting: true, projectId: project.id, createdById: M.id },
    });
    await prisma.eventAttendee.createMany({ data: [A, B, C, M].map((u) => ({ eventId: ev.id, userId: u.id })) });
    return ev;
  };
  const waLogs = (eventId: string) => prisma.whatsAppLog.count({ where: { refId: eventId } });
  const bells = (eventId: string) => prisma.notification.count({ where: { data: { path: ["eventId"], equals: eventId } } });
  const eventRow = (ev: any) => ({ id: ev.id, title: ev.title, date: ev.date, projectId: ev.projectId, createdById: ev.createdById, isMeeting: true, startTime: ev.startTime, endTime: ev.endTime, updatedAt: ev.updatedAt, description: ev.description });

  console.log("\n-- Part A: sender filtering + meeting wiring (mock Twilio = ok) --");
  mockMode = "ok";
  const ev1 = await makeMeeting("Sprint kickoff");
  await notifyEvent(eventRow(ev1), "created", project.name);
  rec("meeting notify sends WhatsApp to ONLY the reachable attendee (A)", await waLogs(ev1.id), 1);
  rec("  the WhatsApp row is A's (phone + opt-in)", await prisma.whatsAppLog.count({ where: { refId: ev1.id, userId: A.id } }), 1);
  rec("  opted-out B got NO WhatsApp", await prisma.whatsAppLog.count({ where: { refId: ev1.id, userId: B.id } }), 0);
  rec("  no-phone C got NO WhatsApp", await prisma.whatsAppLog.count({ where: { refId: ev1.id, userId: C.id } }), 0);
  rec("  the BELL still fires to all 3 attendees (creator excluded)", await bells(ev1.id), 3);
  rec("  WhatsAppLog kind is event_new", (await prisma.whatsAppLog.findFirst({ where: { refId: ev1.id } }))?.kind, "event_new");
  rec("  the wire uses the ContentSid template, not freeform Body", lastReqBody.includes("ContentSid=HXtesttemplate") && !lastReqBody.includes("Body="), true);
  rec("  ...with ContentVariables + a whatsapp From/To", lastReqBody.includes("ContentVariables=") && lastReqBody.includes("From=whatsapp") && lastReqBody.includes("To=whatsapp"), true);

  console.log("\n-- dedupe: re-notifying the same 'created' sends no second WhatsApp --");
  await notifyEvent(eventRow(ev1), "created", project.name);
  rec("re-notify is deduped (still 1 WhatsApp row)", await waLogs(ev1.id), 1);

  console.log("\n-- graceful failure: Twilio auth error releases the reservation --");
  mockMode = "auth";
  const ev2 = await makeMeeting("Retro");
  await notifyEvent(eventRow(ev2), "created", project.name); // must not throw
  rec("a failed send leaves NO WhatsAppLog row (reservation released)", await waLogs(ev2.id), 0);
  rec("  the bell still fired despite the WhatsApp failure", await bells(ev2.id), 3);

  console.log("\n-- direct sender: counts + sandbox non-join --");
  mockMode = "ok";
  const r1 = await sendWhatsAppToUsers([A.id, B.id, C.id], "hi", { kind: "test", refId: "ref-direct-1" });
  rec("sendWhatsAppToUsers filters to reachable only: {sent:1,skipped:0,failed:0}", r1, { sent: 1, skipped: 0, failed: 0 });
  const r2 = await sendWhatsAppToUsers([A.id], "hi", { kind: "test", refId: "ref-direct-1" });
  rec("  a repeat is skipped (dedupe): {sent:0,skipped:1,failed:0}", r2, { sent: 0, skipped: 1, failed: 0 });
  mockMode = "notjoined";
  const r3 = await sendWhatsAppToUsers([A.id], "hi", { kind: "test", refId: "ref-notjoined" });
  rec("  sandbox non-join is a graceful failure: {sent:0,skipped:0,failed:1}", r3, { sent: 0, skipped: 0, failed: 1 });
  rec("  ...and its reservation was released", await prisma.whatsAppLog.count({ where: { refId: "ref-notjoined" } }), 0);

  console.log("\n-- Part B: self phone/opt-in PATCH + endpoint gating (TWILIO unset on the app) --");
  const mCookie = await signIn(M.email, M.password);
  const aCookie = await signIn(A.email, A.password);
  rec("dev sets OWN phone -> 200", (await call(aCookie, "PATCH", "/api/users/me", { phone: "+919876500000" })).status, 200);
  rec("  it was stored", (await prisma.user.findUnique({ where: { id: A.id } }))?.phone, "+919876500000");
  rec("dev sets an INVALID phone -> 400", (await call(aCookie, "PATCH", "/api/users/me", { phone: "notaphone" })).status, 400);
  rec("dev toggles OWN whatsappOptIn -> 200", (await call(aCookie, "PATCH", "/api/users/me", { whatsappOptIn: false })).status, 200);
  rec("  it was stored", (await prisma.user.findUnique({ where: { id: A.id } }))?.whatsappOptIn, false);
  rec("dev sets ANOTHER user's phone -> 403 (not an account admin)", (await call(aCookie, "PATCH", `/api/users/${M.id}`, { phone: "+910000000000" })).status, 403);
  rec("manager sets another user's phone -> 200", (await call(mCookie, "PATCH", `/api/users/${A.id}`, { phone: "+919000000000" })).status, 200);
  rec("  it was stored", (await prisma.user.findUnique({ where: { id: A.id } }))?.phone, "+919000000000");
  rec("dev hits the WhatsApp test endpoint -> 403 (manager-only)", (await call(aCookie, "POST", "/api/whatsapp/test")).status, 403);
  rec("manager hits it, but TWILIO unset on the app -> 503 (config-gated)", (await call(mCookie, "POST", "/api/whatsapp/test")).status, 503);

  await teardown();
  rec("teardown: no p32- residue", await prisma.user.count({ where: { email: { startsWith: PREFIX } } }), 0);
  await new Promise<void>((r) => mock.close(() => r()));
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); try { mock.close(); } catch {} await prisma.$disconnect(); process.exit(1); });
