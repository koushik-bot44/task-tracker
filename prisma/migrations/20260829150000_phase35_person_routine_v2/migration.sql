-- Phase 35 — Routine v2: rename child->person (data-preserving) and replace the
-- phase-34 "simple" routine model (RoutineDay/RoutineHabit/RoutineHabitLog) with a
-- SEGMENTED WEEKLY HABIT GRID + NON-NEGOTIABLES + a WEIGHT MONITOR. RoutineTask is
-- kept (childId->personId). All existing rows are preserved through renames; the
-- three superseded tables were dumped to records/snapshots/ before this ran.
--
-- Applied atomically (a single BEGIN/COMMIT) so a failure mid-way rolls the whole
-- thing back rather than leaving a half-migrated PROD schema. ALTER TYPE RENAME
-- VALUE and the table/column RENAMEs are all transaction-safe on PostgreSQL 10+.

-- 1. The walled-off login role: CHILD -> PERSON. A value rename keeps every row
--    that already carries role='CHILD' (it simply reads 'PERSON' afterward).
ALTER TYPE "Role" RENAME VALUE 'CHILD' TO 'PERSON';

-- 2. Child -> Person (table + its indexes and constraints; all rows preserved).
ALTER TABLE "Child" RENAME TO "Person";
ALTER TABLE "Person" RENAME CONSTRAINT "Child_pkey" TO "Person_pkey";
ALTER TABLE "Person" RENAME CONSTRAINT "Child_managerId_fkey" TO "Person_managerId_fkey";
ALTER TABLE "Person" RENAME CONSTRAINT "Child_userId_fkey" TO "Person_userId_fkey";
ALTER INDEX "Child_managerId_key" RENAME TO "Person_managerId_key";
ALTER INDEX "Child_userId_key" RENAME TO "Person_userId_key";

-- 3. RoutineTask (kept): childId -> personId. The FK already follows the renamed
--    Person table by identity; rename the column, index and constraint for clarity.
ALTER TABLE "RoutineTask" RENAME COLUMN "childId" TO "personId";
ALTER TABLE "RoutineTask" RENAME CONSTRAINT "RoutineTask_childId_fkey" TO "RoutineTask_personId_fkey";
ALTER INDEX "RoutineTask_childId_dueDate_idx" RENAME TO "RoutineTask_personId_dueDate_idx";

-- 4. Drop the superseded phase-34 simple model (rows dumped to records/ first).
--    Order respects the FK: logs -> habits, then the independent days table.
DROP TABLE "RoutineHabitLog";
DROP TABLE "RoutineHabit";
DROP TABLE "RoutineDay";

-- 5. The segmented weekly structure.
CREATE TABLE "HabitSegment" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orderKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HabitSegment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HabitSegment_personId_idx" ON "HabitSegment"("personId");

CREATE TABLE "Habit" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetPerWeek" INTEGER NOT NULL DEFAULT 7,
    "orderKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Habit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Habit_segmentId_idx" ON "Habit"("segmentId");

CREATE TABLE "HabitMark" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "HabitMark_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HabitMark_habitId_date_key" ON "HabitMark"("habitId", "date");
CREATE INDEX "HabitMark_habitId_date_idx" ON "HabitMark"("habitId", "date");

CREATE TABLE "NonNegotiable" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orderKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "NonNegotiable_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NonNegotiable_personId_idx" ON "NonNegotiable"("personId");

CREATE TABLE "NonNegotiableMark" (
    "id" TEXT NOT NULL,
    "nonNegotiableId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "crossed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "NonNegotiableMark_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NonNegotiableMark_nonNegotiableId_date_key" ON "NonNegotiableMark"("nonNegotiableId", "date");
CREATE INDEX "NonNegotiableMark_nonNegotiableId_date_idx" ON "NonNegotiableMark"("nonNegotiableId", "date");

CREATE TABLE "WeightEntry" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeightEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WeightEntry_personId_date_idx" ON "WeightEntry"("personId", "date");

-- 6. Foreign keys (all cascade from the owning Person / segment / habit / item).
ALTER TABLE "HabitSegment" ADD CONSTRAINT "HabitSegment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "HabitSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HabitMark" ADD CONSTRAINT "HabitMark_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NonNegotiable" ADD CONSTRAINT "NonNegotiable_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NonNegotiableMark" ADD CONSTRAINT "NonNegotiableMark_nonNegotiableId_fkey" FOREIGN KEY ("nonNegotiableId") REFERENCES "NonNegotiable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeightEntry" ADD CONSTRAINT "WeightEntry_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
