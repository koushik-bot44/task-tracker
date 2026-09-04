/**
 * Promote ONE named account to FOUNDER — the controlled promotion the UI never
 * offers. Refuses if a founder already exists (the cap), if the account is
 * missing, disabled, pending, an ADMIN or a PERSON. Prints before/after.
 *
 *   npx tsx --env-file=.env.local scripts/promote-founder.ts owner@company.com   (local clone)
 *   npx tsx --env-file=.env       scripts/promote-founder.ts owner@company.com   (PRODUCTION — on the owner's word only)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) throw new Error("Usage: promote-founder.ts <email>");
  const existing = await prisma.user.findFirst({ where: { role: "FOUNDER" }, select: { email: true } });
  if (existing) throw new Error(`A founder already exists: ${existing.email}. There can only be one.`);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No account with email ${email}`);
  if (user.disabledAt) throw new Error("That account is disabled.");
  if (user.status !== "ACTIVE") throw new Error("That account has not set a password yet.");
  if (user.role === "ADMIN" || user.role === "PERSON") throw new Error(`A ${user.role} account cannot become the founder.`);
  console.log(`before: ${user.name} <${user.email}> is ${user.role}`);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { role: "FOUNDER" } });
  console.log(`after:  ${updated.name} <${updated.email}> is ${updated.role}`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
