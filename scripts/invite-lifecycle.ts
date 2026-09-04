/**
 * Invite lifecycle (phase 10), end to end against the running dev server.
 * create pending -> validate -> accept (ACTIVE + signed in) -> token consumed
 * -> reuse blocked; resend rotates the token (old one dies); expired rejected;
 * a pending user's login is non-disclosed; an existing ACTIVE user still logs in.
 *
 * Self-contained: throwaway "invtest-" users, torn down at the end.
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { issueInvite } from "../lib/invite";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const BASE = "http://localhost:3000";
const PREFIX = "invtest-";
const PW = "orbit-pass-9k2";
let fail = 0;
const check = (n: string, cond: boolean) => { if (!cond) fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${n}`); };

async function main() {
  // Defensive: clear any residue from an interrupted prior run.
  await prisma.invite.deleteMany({ where: { user: { email: { startsWith: PREFIX } } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } }).catch(() => undefined);

  const browser = await chromium.launch();
  const fresh = () => browser.newContext().then((c) => c.request);

  const mgr = await prisma.user.create({
    data: { email: `${PREFIX}mgr@orbit.local`, name: "Inv Mgr", role: "MANAGER", status: "ACTIVE", passwordHash: await hashPassword("mgr-known-pw-1") },
  });

  // Regression: an EXISTING active account (real hash, ACTIVE status) still
  // logs in after the nullable-passwordHash + status migration.
  const existingLogin = await (await browser.newContext()).request.post(`${BASE}/api/auth`, {
    data: { email: mgr.email, password: "mgr-known-pw-1" },
  });
  check("existing ACTIVE user still logs in (no migration regression)", existingLogin.status() === 200);

  // 1. A PENDING invitee + issued invite (this is exactly what POST /api/users does)
  const invitee = await prisma.user.create({
    data: { email: `${PREFIX}dev@orbit.local`, name: "Inv Dev", role: "RESOURCE", status: "PENDING", passwordHash: null },
  });
  const { token } = await issueInvite({ user: invitee, inviterName: mgr.name, createdById: mgr.id });
  check("created PENDING invitee with no password", invitee.status === "PENDING" && invitee.passwordHash === null);

  // 2. validate
  const v = await (await fresh()).get(`${BASE}/api/invite/${token}/validate`);
  const vb = await v.json();
  check("validate -> valid + details", v.status() === 200 && vb.state === "valid" && vb.email === invitee.email && vb.role === "RESOURCE");

  // 3. accept (signs in on this context)
  const ctx = await browser.newContext();
  const a = await ctx.request.post(`${BASE}/api/invite/${token}/accept`, { data: { password: PW } });
  check("accept -> 200", a.status() === 200);
  const me = await ctx.request.get(`${BASE}/api/users/me`);
  const meb = await me.json();
  check("signed in as the invitee, now ACTIVE", me.status() === 200 && meb.id === invitee.id && meb.status === "ACTIVE");

  // 4. DB state
  const after = await prisma.user.findUnique({ where: { id: invitee.id } });
  const inv = await prisma.invite.findUnique({ where: { userId: invitee.id } });
  check("user ACTIVE + passwordHash set", after?.status === "ACTIVE" && !!after?.passwordHash);
  check("invite consumed (single-use)", !!inv?.consumedAt);

  // 5. reuse blocked
  const reuse = await (await fresh()).post(`${BASE}/api/invite/${token}/accept`, { data: { password: "another-pass-1" } });
  check("reuse consumed token -> 410", reuse.status() === 410);
  const reval = await (await fresh()).get(`${BASE}/api/invite/${token}/validate`);
  check("consumed token validate -> 410", reval.status() === 410 && (await reval.json()).state === "consumed");

  // 6. invitee logs in with the password they set
  const login = await (await fresh()).post(`${BASE}/api/auth`, { data: { email: invitee.email, password: PW } });
  check("invitee logs in with new password -> 200", login.status() === 200);

  // 7. resend rotates the token
  const p2 = await prisma.user.create({ data: { email: `${PREFIX}dev2@orbit.local`, name: "Inv Dev2", role: "RESOURCE", status: "PENDING", passwordHash: null } });
  const r1 = await issueInvite({ user: p2, inviterName: mgr.name, createdById: mgr.id });
  const r2 = await issueInvite({ user: p2, inviterName: mgr.name, createdById: mgr.id });
  const oldV = await (await fresh()).get(`${BASE}/api/invite/${r1.token}/validate`);
  const newV = await (await fresh()).get(`${BASE}/api/invite/${r2.token}/validate`);
  check("resend: old token now dead (unknown)", oldV.status() === 404);
  check("resend: new token valid", newV.status() === 200);

  // 8. expired token
  const p3 = await prisma.user.create({ data: { email: `${PREFIX}dev3@orbit.local`, name: "Inv Dev3", role: "RESOURCE", status: "PENDING", passwordHash: null } });
  const r3 = await issueInvite({ user: p3, inviterName: mgr.name, createdById: mgr.id });
  await prisma.invite.update({ where: { userId: p3.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const expV = await (await fresh()).get(`${BASE}/api/invite/${r3.token}/validate`);
  check("expired token validate -> 410 expired", expV.status() === 410 && (await expV.json()).state === "expired");

  // 9. pending user login is non-disclosed (p2 still pending)
  const pendLogin = await (await fresh()).post(`${BASE}/api/auth`, { data: { email: p2.email, password: "anything" } });
  check("pending user login -> 401 (non-disclosed)", pendLogin.status() === 401);

  // teardown: invitees first (cascade their invites), then the manager
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX }, id: { not: mgr.id } } });
  await prisma.user.delete({ where: { id: mgr.id } });
  await browser.close();
  console.log(fail === 0 ? "\nall invite-lifecycle checks passed" : `\n${fail} FAILED`);
  if (fail > 0) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
