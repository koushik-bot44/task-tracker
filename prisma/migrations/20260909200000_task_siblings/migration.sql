-- The same task given to several people is one record each (2026-09-09).
-- They now share a key, so a record can name everyone on it and more people can
-- be added later.
ALTER TABLE "Task" ADD COLUMN "siblingKey" TEXT;
CREATE INDEX "Task_siblingKey_idx" ON "Task"("siblingKey");

-- Backfill: records already raised together — same words, same person asking,
-- within the same minute, more than one of them — are one group.
WITH grouped AS (
  SELECT "title", "requesterId", date_trunc('minute', "createdAt") AS minute, gen_random_uuid()::text AS key
  FROM "Task"
  WHERE "deletedAt" IS NULL AND "requesterId" IS NOT NULL AND "assigneeId" IS NOT NULL
  GROUP BY "title", "requesterId", date_trunc('minute', "createdAt")
  HAVING count(DISTINCT "assigneeId") > 1
)
UPDATE "Task" t
SET "siblingKey" = g.key
FROM grouped g
WHERE t."title" = g."title"
  AND t."requesterId" = g."requesterId"
  AND date_trunc('minute', t."createdAt") = g.minute
  AND t."deletedAt" IS NULL
  AND t."assigneeId" IS NOT NULL;
