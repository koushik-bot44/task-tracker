/** Version-independent logical production backup used before additive migrations.
 * The output contains sensitive application rows: write it outside the repo and
 * never commit it. Migration SQL remains the schema reconstruction source. */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

const prisma = new PrismaClient();

function jsonValue(value: unknown): unknown {
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Buffer.isBuffer(value)) return { $bytes: value.toString("base64") };
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item)]));
  }
  return value;
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
  for (const { table_name: table } of tables) {
    const safe = table.replaceAll('"', '""');
    data[table] = await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "public"."${safe}"`);
  }
  const json = JSON.stringify({ createdAt: new Date().toISOString(), tables: jsonValue(data) }, null, 2);
  await writeFile(output, json, "utf8");
  const hash = createHash("sha256").update(json).digest("hex");
  console.log(`tables=${tables.length}`);
  console.log(`rows=${Object.values(data).reduce((sum, rows) => sum + rows.length, 0)}`);
  console.log(`bytes=${Buffer.byteLength(json)}`);
  console.log(`sha256=${hash}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
