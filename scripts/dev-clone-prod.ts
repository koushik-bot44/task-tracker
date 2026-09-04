/* Clone the production DB (DATABASE_URL_UNPOOLED in .env) into the local
 * embedded Postgres, and write a JSON snapshot of every table first.
 * Read-only against the source; the local clone database is wiped and rebuilt.
 * Usage: npx tsx --env-file=.env scripts/dev-clone-prod.ts */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC_URL = process.env.DATABASE_URL_UNPOOLED!;
const CLONE_URL = "postgresql://postgres:orbit@127.0.0.1:5433/orbit_clone";
const MAINT_URL = "postgresql://postgres:orbit@127.0.0.1:5433/postgres";

const src = new PrismaClient({ datasourceUrl: SRC_URL });

// Insert order respects FKs; Task is handled in parent-first waves.
const TABLES = [
  "user", "department", "personalDepartment", "personalProject", "project",
  "projectMember", "projectManager", "passwordResetRequest", "invite",
  "loginAttempt", "pushSubscription", "calendarEvent", "eventAttendee",
  "notification", "emailLog", "whatsAppLog", "person", "routineCollaborator",
  "habitSegment", "habit", "habitMark", "nonNegotiable", "nonNegotiableMark",
  "weightEntry", "routineTask", "task", "taskNote", "projectNote",
] as const;

async function ensureCloneDb() {
  const maint = new PrismaClient({ datasourceUrl: MAINT_URL });
  try {
    await maint.$executeRawUnsafe(`CREATE DATABASE orbit_clone`);
    console.log("created orbit_clone");
  } catch {
    console.log("orbit_clone already exists");
  } finally {
    await maint.$disconnect();
  }
}

async function main() {
  await ensureCloneDb();

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dumpDir = join(process.cwd(), "records", "snapshots", `prod-dump-${stamp}`);
  mkdirSync(dumpDir, { recursive: true });

  // 1. Dump everything from source.
  const data: Record<string, any[]> = {};
  for (const t of TABLES) {
    // @ts-expect-error dynamic model access
    data[t] = await src[t].findMany();
    writeFileSync(join(dumpDir, `${t}.json`), JSON.stringify(data[t], null, 1));
    console.log(`dumped ${t}: ${data[t].length}`);
  }
  await src.$disconnect();

  // 2. Wipe clone (reverse order) and insert.
  const dst = new PrismaClient({ datasourceUrl: CLONE_URL });
  for (const t of [...TABLES].reverse()) {
    // @ts-expect-error dynamic model access
    await dst[t].deleteMany();
  }
  for (const t of TABLES) {
    const rows = data[t];
    if (!rows.length) continue;
    if (t === "task") {
      // parent-first waves for the self-referencing tree
      const pending = new Map(rows.map((r: any) => [r.id, r]));
      const inserted = new Set<string>();
      while (pending.size) {
        const wave = [...pending.values()].filter(
          (r: any) => r.parentId === null || inserted.has(r.parentId),
        );
        if (!wave.length) throw new Error("task wave stuck — orphaned parentId");
        await dst.task.createMany({ data: wave });
        for (const r of wave) { inserted.add(r.id); pending.delete(r.id); }
      }
    } else {
      // @ts-expect-error dynamic model access
      await dst[t].createMany({ data: rows });
    }
    console.log(`cloned ${t}: ${rows.length}`);
  }
  await dst.$disconnect();
  console.log(`\nSnapshot: ${dumpDir}`);
  console.log(`Clone ready at ${CLONE_URL}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
