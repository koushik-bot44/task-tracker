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
 * Never run against production: the URL guard below refuses it.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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

function literal(v: unknown, kind: "array" | "json" | "plain"): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
  // A Postgres array column takes the {"a","b"} form; a json(b) column takes JSON.
  if (kind === "array" && Array.isArray(v)) {
    return `'{${v.map((x) => `"${String(x).replace(/(["\\])/g, "\\$1")}"`).join(",")}}'`;
  }
  return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
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
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "manifest.json").map((f) => f.replace(/\.json$/, ""));
  const tables = [...ORDER.filter((t) => files.includes(t)), ...files.filter((t) => !ORDER.includes(t))];
  const hash = await hashPassword("orbit123");
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
      for (const t of tables) {
        const rows = JSON.parse(readFileSync(join(dir, `${t}.json`), "utf8")) as Record<string, unknown>[];
        if (!rows.length) { console.log(`${t}: 0`); continue; }
        const cols = Object.keys(rows[0]);
        const types = await tx.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
          `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${t}'`,
        );
        const kindOf = (c: string): "array" | "json" | "plain" => {
          const dt = types.find((x) => x.column_name === c)?.data_type ?? "";
          return dt === "ARRAY" ? "array" : dt === "json" || dt === "jsonb" ? "json" : "plain";
        };
        for (let i = 0; i < rows.length; i += 100) {
          const chunk = rows.slice(i, i + 100);
          const values = chunk.map((r) => `(${cols.map((c) => literal(t === "User" && c === "passwordHash" ? (r[c] === null ? null : hash) : r[c], kindOf(c))).join(", ")})`).join(",\n");
          await tx.$executeRawUnsafe(`INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES ${values}`);
        }
        console.log(`${t}: ${rows.length}`);
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
