/**
 * Last-manager safety-guard test (phase 13). The system must always keep at
 * least one active MANAGER, because creating and deleting projects is theirs
 * alone. This proves the guard refuses to disable or demote the last one — and
 * refuses a self-disable for anyone.
 *
 * SAFETY: the guard returns 403 BEFORE any write, so a correct guard never
 * mutates anyone. Belt-and-suspenders anyway:
 *   1. A pre-flight self-disable must 403; if it doesn't, the guard layer is
 *      broken and we abort WITHOUT going near the real manager.
 *   2. The destructive assertions only run when exactly ONE active manager
 *      exists (so it truly is the last), and if the endpoint ever wrongly
 *      succeeds, we re-enable / re-promote immediately via prisma.
 * Only a throwaway ADMIN is created; no throwaway managers, so the real
 * manager's "last" status is real. Torn down at the end.
 *
 *   npx tsx --env-file=.env scripts/check-last-manager-guard.ts
 */
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PREFIX = "lmtest-";

let pass = 0, fail = 0;
function record(name: string, got: number, want: number) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(52)} got ${got}, want ${want}`);
}
async function signIn(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`sign-in ${email}: ${res.status}`);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}
async function call(cookie: string, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return res.status;
}

async function main() {
  const email = `${PREFIX}admin@orbit.local`;
  const password = generateTempPassword(16);
  const adminUser = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: await hashPassword(password), role: "ADMIN", disabledAt: null, status: "ACTIVE" },
    create: { email, name: "LM Admin", role: "ADMIN", passwordHash: await hashPassword(password), status: "ACTIVE" },
  });
  const cookie = await signIn(email, password);

  // Pre-flight: the self-guard must hold before we go near the real manager.
  const selfStatus = await call(cookie, "PATCH", `/api/users/${adminUser.id}`, { disable: true });
  record("admin disables self -> 403 (pre-flight)", selfStatus, 403);
  if (selfStatus !== 403) {
    console.log("ABORT: self-guard broken — not touching the real manager.");
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await prisma.$disconnect();
    process.exit(1);
  }

  const activeManagers = await prisma.user.count({ where: { role: "MANAGER", disabledAt: null, status: "ACTIVE" } });
  if (activeManagers !== 1) {
    console.log(`SKIP destructive last-manager assertions: ${activeManagers} active managers present (need exactly 1 to be sure it's the last).`);
  } else {
    const realMgr = await prisma.user.findFirstOrThrow({
      where: { role: "MANAGER", disabledAt: null, status: "ACTIVE" },
      select: { id: true, name: true },
    });
    console.log(`(the sole active manager is "${realMgr.name}" — the guard must protect it)`);

    const disableStatus = await call(cookie, "PATCH", `/api/users/${realMgr.id}`, { disable: true });
    record("admin disables the LAST manager -> 403", disableStatus, 403);
    if (disableStatus !== 403) {
      await prisma.user.update({ where: { id: realMgr.id }, data: { disabledAt: null } });
      console.log("!! guard failed to block disable — re-enabled immediately");
    }

    const demoteStatus = await call(cookie, "PATCH", `/api/users/${realMgr.id}`, { role: "RESOURCE" });
    record("admin demotes the LAST manager -> 403", demoteStatus, 403);
    if (demoteStatus !== 403) {
      await prisma.user.update({ where: { id: realMgr.id }, data: { role: "MANAGER" } });
      console.log("!! guard failed to block demote — re-promoted immediately");
    }

    // Final verification: the real manager is untouched.
    const after = await prisma.user.findUniqueOrThrow({ where: { id: realMgr.id }, select: { role: true, disabledAt: true } });
    record("real manager still MANAGER + active", after.role === "MANAGER" && after.disabledAt === null ? 1 : 0, 1);
  }

  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
