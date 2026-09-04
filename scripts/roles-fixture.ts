/**
 * Throwaway accounts, one per role, so the precision loop can photograph each
 * role's home. Created and deleted by this script only; it never writes to a
 * user it did not create.
 *
 *   npx tsx scripts/roles-fixture.ts create --env
 *   npx tsx scripts/roles-fixture.ts remove
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const PREFIX = "shot-";

const ACCOUNTS = [
  { key: "MANAGER", email: `${PREFIX}manager@orbit.local`, name: "Priya Raman" },
  { key: "TEAM_LEAD", email: `${PREFIX}lead@orbit.local`, name: "Anita Rao" },
  { key: "RESOURCE", email: `${PREFIX}dev@orbit.local`, name: "Arun Menon" },
] as const;

async function main() {
  const remove = process.argv.includes("remove");

  if (remove) {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: PREFIX } },
      select: { id: true, email: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length > 0) {
      const notes = await prisma.comment.deleteMany({ where: { authorId: { in: ids } } });
      const credited = await prisma.task.updateMany({
        where: { completedById: { in: ids } },
        data: { completedById: null },
      });
      const assigned = await prisma.task.updateMany({
        where: { assigneeId: { in: ids } },
        data: { assigneeId: null },
      });
      const led = await prisma.project.updateMany({
        where: { leadId: { in: ids } },
        data: { leadId: null },
      });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      console.log(
        `removed ${ids.length} shot accounts (notes ${notes.count}, ` +
          `uncredited ${credited.count}, unassigned ${assigned.count}, unled ${led.count})`,
      );
    } else {
      console.log("already gone");
    }
    console.log(
      `remaining shot accounts: ${await prisma.user.count({ where: { email: { startsWith: PREFIX } } })}`,
    );
    return;
  }

  const creds: Record<string, { email: string; password: string }> = {};
  for (const a of ACCOUNTS) {
    const password = generateTempPassword(16);
    await prisma.user.upsert({
      where: { email: a.email },
      update: { passwordHash: await hashPassword(password), role: a.key, disabledAt: null, name: a.name },
      create: { email: a.email, name: a.name, role: a.key, passwordHash: await hashPassword(password) },
    });
    creds[a.key] = { email: a.email, password };
    console.log(`${a.key.padEnd(10)} ${a.email}`);
  }

  if (process.argv.includes("--env")) {
    // fs, never PowerShell — Set-Content wrote a BOM into .env once and Prisma
    // then failed to parse the first key.
    const path = ".env";
    const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
    const stripped = existing
      .split(/\r?\n/)
      .filter((l) => !/^SHOT_[A-Z_]+=/.test(l))
      .join("\n")
      .replace(/\n+$/, "");
    const lines = Object.entries(creds).flatMap(([role, c]) => [
      `SHOT_${role}_EMAIL=${c.email}`,
      `SHOT_${role}_PASSWORD=${c.password}`,
    ]);
    writeFileSync(path, `${stripped}\n${lines.join("\n")}\n`, { encoding: "utf8" });
    console.log("SHOT_* written to .env");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
