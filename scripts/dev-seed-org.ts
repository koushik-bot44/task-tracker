/* Phase 48 org bootstrap (idempotent). Seeds the company's 8 departments from
 * the owner's whiteboard — matching EXISTING departments by name/alias so
 * nothing is duplicated or deleted — and creates local test accounts for the
 * new chain roles (founder/director/HOD) so every view is reachable in dev.
 * Existing departments that match nothing (e.g. "Development") are left alone.
 * Usage: npx tsx --env-file=.env.local scripts/dev-seed-org.ts */
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

/** Whiteboard list. `aliases` are matched case-insensitively against existing
    department names so "Research and Development" satisfies "R&D". */
const CANON: { name: string; aliases: string[]; color: string; description: string }[] = [
  { name: "Administration", aliases: ["administration", "admin", "adm"], color: "#475569", description: "Company administration — the paperwork, approvals and day-to-day running of the office." },
  { name: "Accounts", aliases: ["accounts", "accounting", "finance"], color: "#a16207", description: "Money in and money out — billing, payments, payroll and the books." },
  { name: "Operations", aliases: ["operations", "ops"], color: "#0369a1", description: "Keeping the company's day-to-day work running smoothly." },
  { name: "ERM", aliases: ["erm"], color: "#be123c", description: "Enterprise risk management — spotting and handling risks before they become problems." },
  { name: "HR", aliases: ["hr", "human resources"], color: "#7c3aed", description: "People — hiring, onboarding, leave and everything about the team itself." },
  { name: "Network Admins", aliases: ["network admins", "network admin", "nt admins", "it"], color: "#0d9488", description: "The systems and network the company runs on — uptime, access and security." },
  { name: "R&D", aliases: ["r&d", "rnd", "research and development", "research & development"], color: "#c2410c", description: "Research and development — building and trying new things." },
  { name: "Self", aliases: ["self"], color: "#4d7c0f", description: "Personal growth and internal initiatives." },
];

const CHAIN_USERS = [
  { email: "founder@orbit.local", name: "Rahul (Director)", role: "DIRECTOR" as const },
  { email: "director@orbit.local", name: "Director", role: "DIRECTOR" as const },
  { email: "hod-ops@orbit.local", name: "Ops Head", role: "HOD" as const, heads: "Operations" },
  { email: "hod-rnd@orbit.local", name: "R&D Head", role: "HOD" as const, heads: "R&D" },
];

async function main() {
  // 1. Departments: match by alias, create the missing ones at the end of the order.
  const existing = await prisma.department.findMany({ orderBy: { orderKey: "asc" } });
  let lastKey = existing.length ? existing[existing.length - 1].orderKey : null;
  const byCanon = new Map<string, string>(); // canon name -> department id

  for (const canon of CANON) {
    const match = existing.find((d) => canon.aliases.includes(d.name.trim().toLowerCase()));
    if (match) {
      byCanon.set(canon.name, match.id);
      if (!match.description) {
        await prisma.department.update({ where: { id: match.id }, data: { description: canon.description } });
      }
      console.log(`matched  ${canon.name} -> existing "${match.name}"`);
    } else {
      lastKey = generateKeyBetween(lastKey, null);
      const created = await prisma.department.create({
        data: { name: canon.name, color: canon.color, orderKey: lastKey, description: canon.description },
      });
      byCanon.set(canon.name, created.id);
      console.log(`created  ${canon.name}`);
    }
  }

  // 2. Chain test accounts (local dev only).
  const passwordHash = await hashPassword("orbit123");
  for (const u of CHAIN_USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role },
      create: { email: u.email, name: u.name, role: u.role, passwordHash, status: "ACTIVE" },
    });
    if ("heads" in u && u.heads) {
      const deptId = byCanon.get(u.heads);
      if (deptId) {
        await prisma.department.update({ where: { id: deptId }, data: { hodId: user.id } });
        console.log(`user     ${u.email} (${u.role}) heads ${u.heads}`);
        continue;
      }
    }
    console.log(`user     ${u.email} (${u.role})`);
  }

  const total = await prisma.department.count();
  console.log(`\ndepartments now: ${total}`);
}

main().finally(() => prisma.$disconnect());
