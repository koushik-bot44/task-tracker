-- A task's own progress, marked by hand like a project's number (owner, 2026-09-11). Null = not marked.
ALTER TABLE "Task" ADD COLUMN "progress" INTEGER;

-- A meeting can belong to a task: scheduled from the task's record and shown on it.
ALTER TABLE "CalendarEvent" ADD COLUMN "taskId" TEXT;
CREATE INDEX "CalendarEvent_taskId_date_idx" ON "CalendarEvent"("taskId", "date");
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A task given to someone is work in progress straight away (owner, 2026-09-11):
-- the ones still waiting at "Assigned" move on. Nothing is started for a task nobody holds.
UPDATE "Task" SET "state" = 'IN_PROGRESS', "status" = 'DOING' WHERE "state" = 'ASSIGNED' AND "assigneeId" IS NOT NULL;
