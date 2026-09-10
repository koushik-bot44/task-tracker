/* Rebuild the LOCAL CLONE from a records/snapshots/prod-backup-<stamp>/ folder.
 *
 * The backup is raw `SELECT *` JSON per table at whatever schema production had
 * on the day, so the clone must be at THAT schema when this runs. Recipe:
 *
 *   1. npm run db:start
 *   2. npx tsx --env-file=.env.local scripts/dev-restore-backup.ts --recreate
 *      (drops and recreates orbit_clone — the clone only; refuses any other URL)
 *   3. move the migration folders newer than the backup out of prisma/migrations,
 *      `sh scripts/db-deploy.sh`, move them back
 *   4. npx tsx --env-file=.env.local scripts/dev-restore-backup.ts <backup dir>
 *   5. sh scripts/db-deploy.sh   (the newer migrations now backfill the data)
 *   6. npx tsx --env-file=.env.local scripts/dev-seed-org.ts
 *      npx tsx --env-file=.env.local scripts/dev-seed-accounts.ts
 *
 * Every account's password becomes "orbit123" (the backup redacts hashes).
 * A table of file bytes arrives as <Table>.jsonl (a row a line) and is put back
 * a row at a time, the bytes decoded — never stored as their JSON text.
 * Never run against production: the URL guard below refuses it.
 */
import { PrismaClient } from "@prisma/client";
import { createReadStream, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { hashPassword } from "../lib/password";

const URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";
if (!/127\.0\.0\.1|localhost/.test(URL)) {
  console.error(`DATABASE_URL is not the local clone (${URL}). Refusing.`);
  process.exit(1);
}

// FK order for the pre-restructure schema; anything not listed goes last.
const ORDER = [
  "User", "Department", "PersonalDepartment", "PersonalProject", "Project", "ProjectMember", "ProjectManager",
  "PasswordResetRequest", "Invite", "LoginAttempt", "PushSubscription", "CalendarEvent", "EventAttendee",
  "Notification", "EmailLog", "WhatsAppLog", "Person", "RoutineCollaborator", "HabitSegment", "Habit",
  "HabitMark", "NonNegotiable", "NonNegotiableMark", "WeightEntry", "RoutineTask", "Task", "TaskNote", "ProjectNote",
];

type Kind = "array" | "json" | "bytea" | "plain";

function literal(v: unknown, kind: Kind): string {
  if (v === null || v === undefined) return "NULL";
  if (kind === "bytea") {
    // A file: base64 under $bytes. A backup taken before 2026-09-10 wrote the bytes as an index map.
    const bytes = v as { $bytes?: unknown };
    if (typeof v === "object" && typeof bytes.$bytes === "string") return `decode('${bytes.$bytes}', 'base64')`;
    if (typeof v === "object") return `decode('${Buffer.from(Uint8Array.from(Object.values(v as Record<string, number>))).toString("hex")}', 'hex')`;
    throw new Error("A file column in the backup holds neither $bytes nor bytes; refusing to store it as text.");
  }
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
  // A Postgres array column takes the {"a","b"} form; a json(b) column takes JSON.
  if (kind === "array" && Array.isArray(v)) {
    return `'{${v.map((x) => `"${String(x).replace(/(["\\])/g, "\\$1")}"`).join(",")}}'`;
  }
  return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
}

/** A backup file's rows: a JSON array, or JSON lines read one at a time. */
async function* rowsOf(path: string): AsyncGenerator<Record<string, unknown>> {
  if (path.endsWith(".jsonl")) {
    const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    for await (const line of lines) if (line.trim()) yield JSON.parse(line) as Record<string, unknown>;
    return;
  }
  for (const row of JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>[]) yield row;
}

async function recreate() {
  const maint = new PrismaClient({ datasourceUrl: URL.replace(/\/orbit_clone(\?.*)?$/, "/postgres") });
  try {
    await maint.$executeRawUnsafe(`DROP DATABASE IF EXISTS orbit_clone WITH (FORCE)`);
    await maint.$executeRawUnsafe(`CREATE DATABASE orbit_clone`);
    console.log("orbit_clone dropped and recreated (empty, no migrations)");
  } finally {
    await maint.$disconnect();
  }
}

async function restore(dir: string) {
  const prisma = new PrismaClient();
  const found = readdirSync(dir).filter((f) => /\.jsonl?$/.test(f) && f !== "manifest.json");
  const fileOf = new Map(found.map((f) => [f.replace(/\.jsonl?$/, ""), f] as const));
  const names = [...fileOf.keys()];
  const tables = [...ORDER.filter((t) => names.includes(t)), ...names.filter((t) => !ORDER.includes(t))];
  const hash = await hashPassword("orbit123");
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
      for (const t of tables) {
        const types = await tx.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
          `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${t}'`,
        );
        const kindOf = (c: string): Kind => {
          const dt = types.find((x) => x.column_name === c)?.data_type ?? "";
          return dt === "ARRAY" ? "array" : dt === "json" || dt === "jsonb" ? "json" : dt === "bytea" ? "bytea" : "plain";
        };
        // A row holding a file goes in on its own: a hundred of them in one statement could pass the string limit.
        const size = types.some((x) => x.data_type === "bytea") ? 1 : 100;
        let cols: string[] | null = null;
        let chunk: Record<string, unknown>[] = [];
        let count = 0;
        const flush = async () => {
          if (!chunk.length || !cols) return;
          const columns = cols;
          const values = chunk.map((r) => `(${columns.map((c) => literal(t === "User" && c === "passwordHash" ? (r[c] === null ? null : hash) : r[c], kindOf(c))).join(", ")})`).join(",\n");
          await tx.$executeRawUnsafe(`INSERT INTO "${t}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES ${values}`);
          count += chunk.length;
          chunk = [];
        };
        for await (const row of rowsOf(join(dir, fileOf.get(t)!))) {
          cols ??= Object.keys(row);
          chunk.push(row);
          if (chunk.length >= size) await flush();
        }
        await flush();
        console.log(`${t}: ${count}`);
      }
    },
    { timeout: 300_000 },
  );
  await prisma.$disconnect();
  console.log("\nrestored; every password is now orbit123");
}

const arg = process.argv[2];
if (!arg) { console.error("Usage: dev-restore-backup.ts --recreate | <backup dir>"); process.exit(1); }
(arg === "--recreate" ? recreate() : restore(arg)).catch((e) => { console.error(e); process.exit(1); });
