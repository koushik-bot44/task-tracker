/* Every account, for a reviewer (2026-09-10). Read-only — changes nothing.
 *   npx tsx --env-file=.env.local scripts/list-accounts.ts
 *
 * Who can sign in, as what, where they sit, their other addresses, and whether
 * the demo password actually opens the account (checked against the stored
 * hash here, so no sign-in is attempted anywhere).
 */
import { PrismaClient } from "@prisma/client";
import { verifyPassword } from "@/lib/password";

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD ?? "orbit123";
const ORDER = ["FOUNDER", "CO_FOUNDER", "ADMIN", "HOD", "MANAGER", "TEAM_LEAD", "RESOURCE", "PERSON"];
const LABEL: Record<string, string> = {
  FOUNDER: "CEO",
  CO_FOUNDER: "Co-founder",
  ADMIN: "Admin",
  HOD: "Head of dept",
  MANAGER: "Manager",
  TEAM_LEAD: "Team lead",
  RESOURCE: "Member",
  PERSON: "Well Being person",
};

async function main() {
  const users = await prisma.user.findMany({
    select: {
      name: true,
      email: true,
      role: true,
      status: true,
      disabledAt: true,
      passwordHash: true,
      department: { select: { name: true } },
      headedDepartments: { select: { name: true } },
      otherEmails: { select: { email: true } },
      personAccount: { select: { manager: { select: { name: true } } } },
    },
  });
  users.sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || (a.department?.name ?? "~").localeCompare(b.department?.name ?? "~") || a.name.localeCompare(b.name));

  const rows: string[][] = [];
  for (const u of users) {
    const opens = u.passwordHash ? await verifyPassword(PASSWORD, u.passwordHash) : false;
    const state = u.disabledAt ? "disabled" : u.status !== "ACTIVE" ? u.status.toLowerCase() : opens ? "yes" : "other password";
    const where = u.headedDepartments.length
      ? `heads ${u.headedDepartments.map((d) => d.name).join(", ")}`
      : u.personAccount
        ? `Well Being of ${u.personAccount.manager.name}`
        : (u.department?.name ?? "—");
    rows.push([u.name, u.email, LABEL[u.role] ?? u.role, where, state, u.otherEmails.map((e) => e.email).join(", ")]);
  }
  const head = ["Name", "Sign in with", "Role", "Where", `${PASSWORD}?`, "Also signs in with"];
  const width = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r: string[]) => r.map((c, i) => c.padEnd(width[i])).join("  ").trimEnd();
  console.log(line(head));
  console.log(width.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));
  const ok = rows.filter((r) => r[4] === "yes").length;
  console.log(`\n${users.length} accounts · ${ok} open with ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
