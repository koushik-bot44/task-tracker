-- 2026-09-25: a task may run from one day to another. Additive, nullable.

-- AlterTable
ALTER TABLE "RoutineTask" ADD COLUMN "startDate" DATE;
