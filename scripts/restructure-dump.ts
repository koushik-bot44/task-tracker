/* Dump every table the restructure migration rewrites or drops, BEFORE it runs.
 * Read-only. Usage: npx tsx --env-file=.env.local scripts/restructure-dump.ts */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();
const TABLES = ["task", "project", "taskNote", "projectNote", "projectManager", "projectMember", "eventAttendee", "calendarEvent", "user"] as const;

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(process.cwd(), "records", "snapshots", `restructure-dump-${stamp}`);
  mkdirSync(dir, { recursive: true });
  for (const t of TABLES) {
    // @ts-expect-error dynamic model access
    const rows = await prisma[t].findMany();
    const safe = t === "user" ? rows.map((r: { passwordHash?: string }) => ({ ...r, passwordHash: r.passwordHash ? "<redacted>" : null })) : rows;
    writeFileSync(join(dir, `${t}.json`), JSON.stringify(safe, null, 1));
    console.log(`dumped ${t}: ${rows.length}`);
  }
  console.log(`\nDump: ${dir}`);
}
main().finally(() => prisma.$disconnect());
