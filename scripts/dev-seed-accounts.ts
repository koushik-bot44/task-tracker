/* Local-dev logins, one per level, all with password orbit123 (idempotent).
 * Complements dev-seed-org.ts (departments + founder@ / hod-ops@ / hod-rnd@).
 * Never run against production. */
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

const USERS: { email: string; name: string; role: Role; heads?: string; department?: string }[] = [
  { email: "hod-dev@orbit.local", name: "Dev Head", role: "HOD", heads: "Development", department: "Development" },
  { email: "manager@orbit.local", name: "Meera Manager", role: "MANAGER", department: "Development" },
  { email: "lead@orbit.local", name: "Priya Lead", role: "TEAM_LEAD", department: "Development" },
  { email: "dev@orbit.local", name: "Arjun Dev", role: "RESOURCE", department: "Development" },
  { email: "admin@orbit.local", name: "Admin", role: "ADMIN" },
];

async function main() {
  const passwordHash = await hashPassword("orbit123");
  for (const u of USERS) {
    const dept = u.department ? await prisma.department.findFirst({ where: { name: u.department } }) : null;
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role, passwordHash, status: "ACTIVE", disabledAt: null, ...(dept ? { departmentId: dept.id } : {}) },
      create: { email: u.email, name: u.name, role: u.role, passwordHash, status: "ACTIVE", ...(dept ? { departmentId: dept.id } : {}) },
    });
    if (u.heads && dept) await prisma.department.update({ where: { id: dept.id }, data: { hodId: user.id } });
    console.log(`user ${u.email} (${u.role})${u.heads ? ` heads ${u.heads}` : ""}`);
  }
}

main().finally(() => prisma.$disconnect());
