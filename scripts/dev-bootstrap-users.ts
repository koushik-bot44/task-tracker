/* Local-dev bootstrap: one account per work role so every view is reachable.
 * Idempotent (upsert by email). Never run against production. */
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

const USERS: { email: string; name: string; role: Role }[] = [
  { email: "rahul@orbit.local", name: "Rahul", role: "MANAGER" },
  { email: "lead@orbit.local", name: "Priya Lead", role: "TEAM_LEAD" },
  { email: "dev@orbit.local", name: "Arjun Dev", role: "RESOURCE" },
  { email: "admin@orbit.local", name: "Admin", role: "ADMIN" },
];

async function main() {
  const passwordHash = await hashPassword("orbit123");
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, name: u.name, role: u.role, passwordHash, status: "ACTIVE" },
    });
    console.log(`user ${u.email} (${u.role})`);
  }
}

main().finally(() => prisma.$disconnect());
