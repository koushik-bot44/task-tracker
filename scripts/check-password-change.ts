/**
 * Change-your-own-password flow. Pins the fix for the "Unauthorized + bounced to
 * login" bug: a WRONG current password is 403 (not 401) so the client shows the
 * real reason instead of treating it as an expired session. A genuinely
 * unauthenticated request still 401s. Throwaway pw- actor; hard teardown.
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const BASE = "http://localhost:3000";
const PREFIX = "pw-";
const prisma = new PrismaClient();
let pass = 0, fail = 0;
function rec(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(52)} got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
async function signIn(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return { status: res.status, cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] };
}
async function changePw(cookie: string | null, body: unknown) {
  const res = await fetch(`${BASE}/api/users/me/password`, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  let json: any = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
async function teardown() {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}
async function main() {
  await teardown();
  const email = `${PREFIX}user@orbit.local`;
  const oldPw = generateTempPassword(16);
  const newPw = generateTempPassword(16);
  await prisma.user.create({ data: { email, name: "PW User", role: "RESOURCE", status: "ACTIVE", passwordHash: await hashPassword(oldPw) } });
  const { cookie } = await signIn(email, oldPw);

  // Wrong current password -> 403 (NOT 401) with the real message.
  const wrong = await changePw(cookie, { current: "definitely-not-it", next: newPw });
  rec("wrong current password -> 403 (not 401)", wrong.status, 403);
  rec("  message is preserved (not 'Unauthorized')", wrong.json?.error, "That is not your current password.");

  // Too-short new password -> 400 (schema).
  rec("new password < 8 chars -> 400", (await changePw(cookie, { current: oldPw, next: "short" })).status, 400);

  // Correct current + valid new -> 200, and the new password actually works.
  rec("correct current + valid new -> 200", (await changePw(cookie, { current: oldPw, next: newPw })).status, 200);
  rec("old password no longer signs in -> 401", (await signIn(email, oldPw)).status, 401);
  rec("new password signs in -> 200", (await signIn(email, newPw)).status, 200);

  // A genuinely unauthenticated request still 401s (real-auth case intact).
  rec("no session -> 401 (real auth failure unchanged)", (await changePw(null, { current: newPw, next: generateTempPassword(16) })).status, 401);

  await teardown();
  rec("teardown: no pw- residue", await prisma.user.count({ where: { email: { startsWith: PREFIX } } }), 0);
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
