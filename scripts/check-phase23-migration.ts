/**
 * Phase 23 additive-migration audit. Proves against the LIVE database that the
 * snooze migration only ADDED a nullable Notification.snoozedUntil column (no
 * default, so every existing row is NULL = "not snoozed") plus its index — and
 * that no existing notification was touched (zero rows carry a snoozedUntil).
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
let ok = true;
const rec = (n: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${n}`); if (!cond) ok = false; };

async function main() {
  const cols = await prisma.$queryRawUnsafe<{ column_name: string; is_nullable: string; column_default: string | null; data_type: string }[]>(`
    SELECT column_name, is_nullable, column_default, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='Notification' AND column_name='snoozedUntil'`);
  console.log("Notification added column:");
  for (const c of cols) console.log(`  ${c.column_name}  type=${c.data_type}  nullable=${c.is_nullable}  default=${c.column_default ?? "none"}`);

  const idx = await prisma.$queryRawUnsafe<{ indexname: string }[]>(`
    SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='Notification' AND indexname='Notification_snoozedUntil_idx'`);

  const total = await prisma.notification.count();
  const snoozed = await prisma.notification.count({ where: { snoozedUntil: { not: null } } });
  console.log(`\nNotification rows: ${total}  ·  with a snoozedUntil set: ${snoozed}\n`);

  const col = cols[0];
  rec("snoozedUntil column exists", cols.length === 1);
  rec("snoozedUntil is a timestamp", (col?.data_type ?? "").startsWith("timestamp"));
  rec("snoozedUntil is nullable, no default (existing rows = NULL)", col?.is_nullable === "YES" && !col?.column_default);
  rec("snoozedUntil index exists (cron scan)", idx.length === 1);
  rec("no existing notification was touched (0 snoozed)", snoozed === 0);
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
