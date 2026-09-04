/* Full read-only backup of the database BEFORE the restructure migration
 * runs on it (runbook step 1). Raw SQL, so it works against the OLD schema
 * regardless of what the generated client expects.
 *
 *   npx tsx --env-file=.env scripts/prod-backup.ts
 *
 * Writes records/snapshots/prod-backup-<stamp>/<Table>.json (passwordHash
 * redacted) plus manifest.json with a row count and sha256 per table.
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(process.cwd(), "records", "snapshots", `prod-backup-${stamp}`);
  mkdirSync(dir, { recursive: true });

  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%' ORDER BY tablename`,
  );
  const manifest: Record<string, { rows: number; sha256: string }> = {};
  for (const { tablename } of tables) {
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${tablename}"`);
    const safe =
      tablename === "User"
        ? rows.map((r) => ({ ...r, passwordHash: r.passwordHash ? "<redacted>" : null }))
        : rows;
    const json = JSON.stringify(safe, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 1);
    writeFileSync(join(dir, `${tablename}.json`), json);
    manifest[tablename] = { rows: rows.length, sha256: createHash("sha256").update(json).digest("hex") };
    console.log(`dumped ${tablename}: ${rows.length}`);
  }
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ stamp, tables: manifest }, null, 1));
  console.log(`\nBackup: ${dir}`);
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
