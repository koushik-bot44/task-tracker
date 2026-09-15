-- A task that comes round again (owner, 2026-09-15: "recursion option task for
-- every month ...like stuff may occur").
--
-- The next one is raised ON THE DAY IT FALLS DUE by the daily job, not when the
-- last one is ticked off: a monthly task should appear in September whether or
-- not August's was ever finished, and spawning on completion would silently
-- skip a month somebody fell behind on.
--
-- `repeatedFromId` is what stops a double run raising two: the job only raises a
-- repeat when no task already points back at that one.
--
-- Only ADDS. Every existing task has repeats NULL and repeats nothing, so
-- nothing changes for work already in the system.
CREATE TYPE "Repeats" AS ENUM ('DAY', 'WEEK', 'MONTH');

ALTER TABLE "Task" ADD COLUMN "repeats" "Repeats";
ALTER TABLE "Task" ADD COLUMN "repeatedFromId" TEXT;

-- Finding "has this one already been repeated?" is the job's hot path.
CREATE INDEX "Task_repeatedFromId_idx" ON "Task"("repeatedFromId");
-- And finding what is due to come round at all.
CREATE INDEX "Task_repeats_dueDate_idx" ON "Task"("repeats", "dueDate");
