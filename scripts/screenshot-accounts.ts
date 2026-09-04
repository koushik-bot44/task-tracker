/**
 * Creates (or resets) two throwaway accounts used only by the screenshot rig,
 * and prints credentials for .env. Run with `--remove` to delete them again.
 *
 * These exist because the real manager account is in active use and its
 * password is the owner's — borrowing it would break their sign-in for the
 * length of a screenshot run.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../lib/password";

const prisma = new PrismaClient();

const ACCOUNTS = [
  { email: "screenshot-manager@orbit.local", name: "Priya Raman", role: "MANAGER" as const },
  { email: "screenshot-dev@orbit.local", name: "Arun Menon", role: "RESOURCE" as const },
];

async function main() {
  const remove = process.argv.includes("--remove");

  if (remove) {
    for (const account of ACCOUNTS) {
      const user = await prisma.user.findUnique({ where: { email: account.email } });
      if (!user) {
        console.log(`already gone: ${account.email}`);
        continue;
      }
      // Notes hold a RESTRICT foreign key; clear any this account wrote.
      const notes = await prisma.taskNote.deleteMany({ where: { authorId: user.id } });
      // Completion credit is SET NULL on delete, but be explicit about it.
      const credited = await prisma.task.updateMany({
        where: { completedById: user.id },
        data: { completedById: null },
      });
      await prisma.user.delete({ where: { id: user.id } });
      console.log(
        `removed ${account.email} (notes deleted: ${notes.count}, completions uncredited: ${credited.count})`,
      );
    }
    await prisma.$disconnect();
    return;
  }

  const made: { email: string; password: string }[] = [];
  for (const account of ACCOUNTS) {
    const password = generateTempPassword(16);
    const passwordHash = await hashPassword(password);
    await prisma.user.upsert({
      where: { email: account.email },
      update: { passwordHash, disabledAt: null, role: account.role, name: account.name },
      create: { ...account, passwordHash },
    });
    made.push({ email: account.email, password });
    console.log(`${account.email}\t${password}`);
  }

  // Write straight into .env so the rig can sign in without the password
  // travelling through a shell command line or a second console line.
  // fs, never PowerShell: Set-Content wrote a UTF-8 BOM here once and Prisma
  // then parsed the first key as "﻿DATABASE_URL" and failed to start.
  if (process.argv.includes("--env")) {
    const manager = made.find((m) => m.email.includes("manager"));
    if (manager) {
      const path = ".env";
      const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
      const stripped = existing
        .split(/\r?\n/)
        .filter((l) => !/^SCREEN_(EMAIL|PASSWORD)=/.test(l))
        .join("\n")
        .replace(/\n+$/, "");
      const next =
        `${stripped}\nSCREEN_EMAIL=${manager.email}\nSCREEN_PASSWORD=${manager.password}\n`;
      writeFileSync(path, next, { encoding: "utf8" });
      console.log("SCREEN_EMAIL / SCREEN_PASSWORD written to .env");
    }
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
