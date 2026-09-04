/**
 * Phase 22 additive-migration audit. Proves against the LIVE database that the
 * meetings migration only ADDED to CalendarEvent (nullable startTime/endTime +
 * isMeeting default false) and a new EventAttendee table — and that no existing
 * event was touched (nothing became a meeting, no attendee rows exist yet).
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
let ok = true;
const rec = (n: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${n}`); if (!cond) ok = false; };

async function main() {
  const cols = await prisma.$queryRawUnsafe<{ column_name: string; is_nullable: string; column_default: string | null }[]>(`
    SELECT column_name, is_nullable, column_default FROM information_schema.columns
    WHERE table_schema='public' AND table_name='CalendarEvent'
      AND column_name IN ('startTime','endTime','isMeeting') ORDER BY column_name`);
  console.log("CalendarEvent added columns:");
  for (const c of cols) console.log(`  ${c.column_name}  nullable=${c.is_nullable}  default=${c.column_default ?? "none"}`);
  const tbl = await prisma.$queryRawUnsafe<{ table_name: string }[]>(`
    SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='EventAttendee'`);
  const events = await prisma.calendarEvent.count();
  const meetings = await prisma.calendarEvent.count({ where: { isMeeting: true } });
  const attendees = await prisma.eventAttendee.count();
  console.log(`\nCalendarEvent rows: ${events}  ·  isMeeting=true: ${meetings}  ·  EventAttendee rows: ${attendees}\n`);

  const col = (n: string) => cols.find((c) => c.column_name === n);
  rec("startTime is nullable, no default", col("startTime")?.is_nullable === "YES" && !col("startTime")?.column_default);
  rec("endTime is nullable, no default", col("endTime")?.is_nullable === "YES" && !col("endTime")?.column_default);
  rec("isMeeting NOT NULL default false", col("isMeeting")?.is_nullable === "NO" && (col("isMeeting")?.column_default ?? "").includes("false"));
  rec("EventAttendee table exists", tbl.length === 1);
  rec("no existing event became a meeting (isMeeting=true == 0)", meetings === 0);
  rec("no attendee rows yet (0)", attendees === 0);
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
