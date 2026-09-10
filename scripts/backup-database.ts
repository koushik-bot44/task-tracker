/** Version-independent logical production backup used before additive migrations.
 * The output contains sensitive application rows: write it outside the repo and
 * never commit it. Migration SQL remains the schema reconstruction source.
 * Attached files (StoredFile) go to a JSON-lines file beside it, a row a line,
 * so no single string ever has to hold every file (2026-09-10). */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";

const prisma = new PrismaClient();
/** Tables that hold file bytes, written a row at a time. */
const FILE_TABLES = new Set(["StoredFile"]);

function jsonValue(value: unknown): unknown {
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (value instanceof Date) return { $date: value.toISOString() };
  // Prisma 6 hands bytea back as a plain Uint8Array, not a Buffer (a Buffer is one too).
  if (value instanceof Uint8Array) return { $bytes: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("base64") };
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item)]));
  }
  return value;
}

async function dumpFiles(table: string, path: string): Promise<{ rows: number; sha256: string }> {
  const out = createWriteStream(path);
  const hash = createHash("sha256");
  const put = (line: string) =>
    new Promise<void>((resolve) => {
      hash.update(line);
      if (out.write(line)) resolve();
      else out.once("drain", () => resolve());
    });
  const safe = table.replaceAll('"', '""');
  let rows = 0;
  for (let offset = 0; ; offset += 20) {
    const page = await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "public"."${safe}" ORDER BY "id" LIMIT 20 OFFSET ${offset}`);
    if (!page.length) break;
    for (const row of page) await put(`${JSON.stringify(jsonValue(row))}\n`);
    rows += page.length;
  }
  await new Promise<void>((resolve, reject) => {
    out.once("error", reject);
    out.end(() => resolve());
  });
  return { rows, sha256: hash.digest("hex") };
}

async function main() {
  const output = process.argv[2];
  if (!output) throw new Error("Usage: tsx scripts/backup-database.ts <outside-repo-output.json>");
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  const data: Record<string, unknown[]> = {};
  const files: Record<string, { path: string; rows: number; sha256: string }> = {};
  for (const { table_name: table } of tables) {
    if (FILE_TABLES.has(table)) {
      const path = `${output.replace(/\.json$/, "")}.${table}.jsonl`;
      files[table] = { path, ...(await dumpFiles(table, path)) };
      continue;
    }
    const safe = table.replaceAll('"', '""');
    data[table] = await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "public"."${safe}"`);
  }
  const json = JSON.stringify({ createdAt: new Date().toISOString(), tables: jsonValue(data), files }, null, 2);
  await writeFile(output, json, "utf8");
  const hash = createHash("sha256").update(json).digest("hex");
  console.log(`tables=${tables.length}`);
  console.log(`rows=${Object.values(data).reduce((sum, rows) => sum + rows.length, 0)}`);
  console.log(`bytes=${Buffer.byteLength(json)}`);
  console.log(`sha256=${hash}`);
  for (const [table, f] of Object.entries(files)) console.log(`${table}: rows=${f.rows} sha256=${f.sha256} file=${f.path}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
