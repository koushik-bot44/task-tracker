/* Staff every department on the clone (2026-09-09), so the People page, the
 * pickers and the assignment rules all have something real to work with.
 *   npx tsx --env-file=.env.local scripts/dev-seed-people.ts
 *
 * Each department gets a head, a manager, a lead and two team members, with
 * ordinary names and the password "orbit123". Idempotent — an account that is
 * already there keeps its place. Undo with --undo (removes only staff-* rows).
 * Never run against production.
 */
import { PrismaClient, type Role } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const PREFIX = "staff-";

/** Ordinary names, so a demo screen reads like a company and not a test fixture. */
const NAMES = [
  "Ananya Rao", "Vikram Nair", "Sneha Patil", "Rohit Menon", "Kavya Iyer",
  "Aditya Bose", "Meera Shetty", "Karthik Reddy", "Divya Pillai", "Nikhil Joshi",
  "Ishita Sharma", "Varun Kulkarni", "Pooja Desai", "Sanjay Verma", "Ritu Malhotra",
  "Harsh Gupta", "Neha Krishnan", "Manoj Bhat", "Lakshmi Menon", "Tarun Saxena",
  "Priyanka Ghosh", "Akash Kamat", "Shreya Naik", "Rahul Chandra", "Gita Prasad",
  "Imran Sheikh", "Deepa Rangan", "Suresh Babu", "Anjali Fernandes", "Yash Agarwal",
  "Farhan Qureshi", "Bhavna Chopra", "Ravi Subramanian", "Tanvi Deshmukh", "Ajay Thomas",
  "Nandini Rao", "Vivek Anand", "Swati Mishra", "Girish Hegde", "Renuka Salvi",
];

/** The shape of a department: who it needs, in order. */
const SHAPE: { role: Role; slug: string }[] = [
  { role: "HOD", slug: "head" },
  { role: "MANAGER", slug: "manager" },
  { role: "TEAM_LEAD", slug: "lead" },
  { role: "RESOURCE", slug: "member-1" },
  { role: "RESOURCE", slug: "member-2" },
];

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function undo() {
  const rows = await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return console.log("nothing to remove");
  await prisma.department.updateMany({ where: { hodId: { in: ids } }, data: { hodId: null } });
  await prisma.task.updateMany({ where: { assigneeId: { in: ids } }, data: { assigneeId: null } });
  await prisma.invite.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdById: { in: ids } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`removed ${ids.length} seeded staff`);
}

async function main() {
  if (process.argv.includes("--undo")) return undo();

  const passwordHash = await hashPassword("orbit123");
  // "Self" is the personal space, not a place people are staffed into.
  const departments = await prisma.department.findMany({ where: { name: { not: "Self" } }, orderBy: { orderKey: "asc" } });

  let made = 0;
  let placedHeads = 0;
  let n = 0;

  for (const dept of departments) {
    const headOf = await prisma.department.findUnique({ where: { id: dept.id }, select: { hodId: true } });

    // Every department gets the same five, whoever else is already in it: a
    // department with a known head, lead and two people is what the rigs and a
    // demo both need, and the accounts are named so they are never mistaken for
    // real ones.
    for (const slot of SHAPE) {
      // A department already has one head; a second would wear the same chip and
      // mean nothing. That slot becomes another manager instead.
      const role = slot.role === "HOD" && headOf?.hodId ? "MANAGER" : slot.role;
      const email = `${PREFIX}${slugify(dept.name)}-${slot.slug}@orbit.local`;
      const name = NAMES[n % NAMES.length];
      n++;
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      const user = await prisma.user.upsert({
        where: { email },
        update: { role, passwordHash, status: "ACTIVE", disabledAt: null, departmentId: dept.id },
        create: { email, name, role, passwordHash, status: "ACTIVE", departmentId: dept.id },
      });
      if (!existing) made++;
      // A department with no head gets the one just made.
      if (role === "HOD" && !headOf?.hodId) {
        await prisma.department.update({ where: { id: dept.id }, data: { hodId: user.id } });
        placedHeads++;
      }
    }
  }

  const counts = await prisma.user.groupBy({ by: ["departmentId"], where: { disabledAt: null, role: { notIn: ["PERSON", "ADMIN"] } }, _count: { _all: true } });
  console.log(`\n${made} accounts made, ${placedHeads} departments given a head. Password: orbit123\n`);
  for (const d of departments) {
    const c = counts.find((x) => x.departmentId === d.id)?._count._all ?? 0;
    console.log(`  ${d.name.padEnd(26)} ${c} people`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
