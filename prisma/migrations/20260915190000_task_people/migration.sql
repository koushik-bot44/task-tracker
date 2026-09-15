-- Several people on ONE task, with one chat between them (owner, 2026-09-15:
-- "multiple people to the same task as group chat"). Until now a task given to
-- several people was COPIED once per person and the copies were tied together
-- by Task.siblingKey — so each person had a private chat on their own copy,
-- which is the thing the owner objected to.
--
-- This table only ADDS. No copy is deleted and siblingKey is left alone, so the
-- screens keep working while the code changes over; folding the old groups into
-- one task each is a separate, deliberate step.
CREATE TABLE "TaskPerson" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskPerson_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskPerson_taskId_userId_key" ON "TaskPerson"("taskId", "userId");
CREATE INDEX "TaskPerson_userId_idx" ON "TaskPerson"("userId");

ALTER TABLE "TaskPerson" ADD CONSTRAINT "TaskPerson_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskPerson" ADD CONSTRAINT "TaskPerson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskPerson" ADD CONSTRAINT "TaskPerson_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Whoever holds a task is on it. Every live task with a holder gets its row, so
-- "who is on this task" is one query from the day this runs.
INSERT INTO "TaskPerson" ("id", "taskId", "userId", "addedById", "createdAt")
SELECT 'tp' || md5(t."id" || t."assigneeId"), t."id", t."assigneeId", t."givenById", COALESCE(t."assignedAt", t."createdAt")
FROM "Task" t
WHERE t."assigneeId" IS NOT NULL
  AND t."deletedAt" IS NULL;

-- Everybody already sharing a task through a sibling group joins the OLDEST
-- record of that group, which is the one that survives when the groups are
-- folded up. Without this, the four people on the copies would lose sight of
-- the task the moment the code stops reading siblingKey.
INSERT INTO "TaskPerson" ("id", "taskId", "userId", "addedById", "createdAt")
SELECT 'tp' || md5(oldest."id" || sib."assigneeId"), oldest."id", sib."assigneeId", sib."givenById", COALESCE(sib."assignedAt", sib."createdAt")
FROM "Task" sib
JOIN LATERAL (
    SELECT first."id"
    FROM "Task" first
    WHERE first."siblingKey" = sib."siblingKey"
      AND first."deletedAt" IS NULL
    ORDER BY first."createdAt" ASC, first."id" ASC
    LIMIT 1
) AS oldest ON TRUE
WHERE sib."siblingKey" IS NOT NULL
  AND sib."assigneeId" IS NOT NULL
  AND sib."deletedAt" IS NULL
ON CONFLICT ("taskId", "userId") DO NOTHING;
