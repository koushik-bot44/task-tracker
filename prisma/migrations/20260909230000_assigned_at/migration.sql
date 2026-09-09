-- When a task was put in somebody's hands (2026-09-09). The list showed only a
-- due date, so there was no way to see how long somebody had been holding it.
ALTER TABLE "Task" ADD COLUMN "assignedAt" TIMESTAMP(3);

-- Backfill: the moment a task was handed over is not recorded anywhere earlier,
-- so a task that has a holder takes its own creation time. That is exact for
-- everything raised straight onto somebody (the usual path) and an
-- underestimate for the few handed over later.
UPDATE "Task" SET "assignedAt" = "createdAt" WHERE "assigneeId" IS NOT NULL;
