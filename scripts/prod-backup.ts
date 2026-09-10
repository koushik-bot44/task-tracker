/* Full read-only backup of the database BEFORE the restructure migration
 * runs on it (runbook step 1). Raw SQL, so it works against the OLD schema
 * regardless of what the generated client expects.
 *
 *   npx tsx --env-file=.env scripts/prod-backup.ts
 *
 * Writes records/snapshots/prod-backup-<stamp>/<Table>.json (passwordHash
 * redacted) plus manifest.json with a row count and sha256 per table. A table
 * that holds file bytes (StoredFile) is written as <Table>.jsonl instead — a
 * row a line, 20 rows a query, bytes as base64 under $bytes — so no single
 * string has to hold every file (2026-09-10). dev-restore-backup.ts reads both.
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

/** A raw row as JSON: bigint as text; bytea — a plain Uint8Array from Prisma 6 — as base64. */
const replacer = (_k: string, v: unknown) =>
  typeof v === "bigint" ? v.toString() : v instanceof Uint8Array ? { $bytes: Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64") } : v;

async function dumpLines(tablename: string, path: string): Promise<{ rows: number; sha256: string }> {
  const out = createWriteStream(path);
  const hash = createHash("sha256");
  const put = (line: string) =>
    new Promise<void>((resolve) => {
      hash.update(line);
      if (out.write(line)) resolve();
      else out.once("drain", () => resolve());
    });
  let rows = 0;
  for (let offset = 0; ; offset += 20) {
    const page = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${tablename}" ORDER BY "id" LIMIT 20 OFFSET ${offset}`);
    if (!page.length) break;
    for (const row of page) await put(`${JSON.stringify(row, replacer)}\n`);
    rows += page.length;
  }
  await new Promise<void>((resolve, reject) => {
    out.once("error", reject);
    out.end(() => resolve());
  });
  return { rows, sha256: hash.digest("hex") };
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(process.cwd(), "records", "snapshots", `prod-backup-${stamp}`);
  mkdirSync(dir, { recursive: true });

  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%' ORDER BY tablename`,
  );
  const withBytes = new Set(
    (await prisma.$queryRawUnsafe<{ table_name: string }[]>(`SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'bytea'`)).map((r) => r.table_name),
  );
  const manifest: Record<string, { rows: number; sha256: string }> = {};
  for (const { tablename } of tables) {
    if (withBytes.has(tablename)) {
      manifest[tablename] = await dumpLines(tablename, join(dir, `${tablename}.jsonl`));
      console.log(`dumped ${tablename}: ${manifest[tablename].rows} (a row a line)`);
      continue;
    }
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${tablename}"`);
    const safe =
      tablename === "User"
        ? rows.map((r) => ({ ...r, passwordHash: r.passwordHash ? "<redacted>" : null }))
        : rows;
    const json = JSON.stringify(safe, replacer, 1);
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
