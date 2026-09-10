/* The seven named test logins (2026-09-10) — read-only, idempotent.
 *   npx tsx --env-file=.env.local scripts/check-test-accounts.ts   (dev server up)
 *
 * For each login: does the account exist, with the role and department the test
 * plan expects, active, with a password, not switched off — and can it actually
 * sign in (POST /api/auth → 200)? Also: does HR's head pointer point at the HR
 * head. Writes nothing. A wrong row is fixed with the seeders, never by hand.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PASSWORD = "orbit123";

/** The plan's table. Only six rows are listed, although it says seven. */
const EXPECTED = [
  { email: "founder@orbit.local", name: "Rahul", role: "FOUNDER", department: null },
  { email: "salyush@orbit.local", name: "Salyush", role: "CO_FOUNDER", department: null },
  { email: "staff-hr-head@orbit.local", name: "Imran Sheikh", role: "HOD", department: "HR" },
  { email: "staff-accounts-manager@orbit.local", name: "Meera Shetty", role: "MANAGER", department: "Accounts" },
  { email: "staff-accounts-lead@orbit.local", name: "Karthik Reddy", role: "TEAM_LEAD", department: "Accounts" },
  { email: "staff-erm-member-1@orbit.local", name: "Rahul Chandra", role: "RESOURCE", department: "ERM" },
] as const;

async function main() {
  let fail = 0;
  const hr = await prisma.department.findFirst({ where: { name: "HR" }, select: { hodId: true } });

  console.log("login".padEnd(38), "exists name ok role ok  dept ok  active pw  !disabled heads-HR  sign-in");
  for (const e of EXPECTED) {
    const u = await prisma.user.findUnique({
      where: { email: e.email },
      select: { id: true, name: true, role: true, status: true, passwordHash: true, disabledAt: true, department: { select: { name: true } } },
    });
    const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e.email, password: PASSWORD }) });
    const checks = {
      exists: Boolean(u),
      name: u?.name === e.name,
      role: u?.role === e.role,
      dept: (u?.department?.name ?? null) === e.department,
      active: u?.status === "ACTIVE",
      pw: Boolean(u?.passwordHash),
      notDisabled: u ? u.disabledAt === null : false,
      signIn: res.status === 200,
    };
    // Only the HR head is expected to be HR's head; for everyone else the column is informational.
    const headsHr = u ? hr?.hodId === u.id : false;
    const headsOk = e.email === "staff-hr-head@orbit.local" ? headsHr : true;
    const ok = Object.values(checks).every(Boolean) && headsOk;
    if (!ok) fail++;
    const b = (x: boolean) => (x ? "yes" : "NO ");
    console.log(
      e.email.padEnd(38),
      b(checks.exists).padEnd(6), b(checks.name).padEnd(7), `${(u?.role ?? "-").padEnd(10)}${checks.role ? "" : "!"}`.padEnd(11),
      `${(u?.department?.name ?? "—").padEnd(8)}${checks.dept ? "" : "!"}`.padEnd(9),
      b(checks.active).padEnd(6), b(checks.pw).padEnd(3), b(checks.notDisabled).padEnd(9), b(headsHr).padEnd(9),
      String(res.status), ok ? "" : "  <-- FAIL",
    );
  }
  console.log(`\nHR department head points at staff-hr-head@orbit.local: ${hr?.hodId === (await prisma.user.findUnique({ where: { email: "staff-hr-head@orbit.local" }, select: { id: true } }))?.id ? "yes" : "NO"}`);
  console.log(`${EXPECTED.length - fail} of ${EXPECTED.length} logins correct`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
