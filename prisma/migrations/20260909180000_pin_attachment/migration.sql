-- Pin a file to the top of a task (2026-09-09). The note's own words stay the
-- file's description; this only records that it belongs at the top.
ALTER TABLE "TaskActivity" ADD COLUMN "pinnedAt" TIMESTAMP(3);
CREATE INDEX "TaskActivity_taskId_pinnedAt_idx" ON "TaskActivity"("taskId", "pinnedAt");
