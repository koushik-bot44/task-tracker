-- Restructure (2026-09-04). Hand-authored. Every DROP below was dumped first
-- (records/snapshots/restructure-dump-*). Runs in one transaction under
-- `prisma migrate deploy`; scripts/restructure-dryrun.ts runs the same file
-- inside BEGIN…ROLLBACK and prints the audit counts.

-- 1. People: department placement ------------------------------------------
ALTER TABLE "User" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");
CREATE INDEX "Department_hodId_idx" ON "Department"("hodId");

WITH scores AS (
  SELECT d."hodId" AS "userId", d.id AS "departmentId", 1000 AS w FROM "Department" d WHERE d."hodId" IS NOT NULL
  UNION ALL SELECT p."ownerId", p."departmentId", 10 FROM "Project" p WHERE p."ownerId" IS NOT NULL AND p."departmentId" IS NOT NULL
  UNION ALL SELECT p."leadId", p."departmentId", 5 FROM "Project" p WHERE p."leadId" IS NOT NULL AND p."departmentId" IS NOT NULL
  UNION ALL SELECT m."userId", p."departmentId", 2 FROM "ProjectMember" m JOIN "Project" p ON p.id = m."projectId" WHERE p."departmentId" IS NOT NULL
  UNION ALL SELECT t."assigneeId", p."departmentId", 1 FROM "Task" t JOIN "Project" p ON p.id = t."projectId" WHERE t."assigneeId" IS NOT NULL AND t."deletedAt" IS NULL AND p."departmentId" IS NOT NULL
), ranked AS (
  SELECT "userId", "departmentId", SUM(w) AS total,
         ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY SUM(w) DESC, "departmentId") AS rn
  FROM scores GROUP BY "userId", "departmentId"
)
UPDATE "User" u SET "departmentId" = r."departmentId"
FROM ranked r WHERE r."userId" = u.id AND r.rn = 1 AND u.role <> 'PERSON';

-- 2. Milestones ---------------------------------------------------------------
CREATE TYPE "MilestoneOutcome" AS ENUM ('ON_TRACK', 'NEEDS_WORK');
CREATE TABLE "Milestone" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "reviewDate" TIMESTAMP(3) NOT NULL,
  "orderKey" TEXT NOT NULL,
  "reviewEventId" TEXT,
  "outcome" "MilestoneOutcome",
  "outcomeNote" TEXT,
  "outcomeAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Milestone_reviewEventId_key" ON "Milestone"("reviewEventId");
CREATE INDEX "Milestone_projectId_reviewDate_idx" ON "Milestone"("projectId", "reviewDate");
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_reviewEventId_fkey" FOREIGN KEY ("reviewEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD COLUMN "milestoneId" TEXT;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "CalendarEvent_milestoneId_idx" ON "CalendarEvent"("milestoneId");

-- 3. Tasks ------------------------------------------------------------------
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'DOING', 'STUCK', 'DONE');
ALTER TABLE "Task"
  ADD COLUMN "status2" "TaskStatus" NOT NULL DEFAULT 'TODO',
  ADD COLUMN "milestoneId" TEXT,
  ADD COLUMN "important" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "givenById" TEXT;
UPDATE "Task" SET "status2" = CASE "status"
  WHEN 'BACKLOG' THEN 'TODO'::"TaskStatus"
  WHEN 'PLANNED' THEN 'TODO'::"TaskStatus"
  WHEN 'IN_PROGRESS' THEN 'DOING'::"TaskStatus"
  WHEN 'ON_HOLD' THEN 'STUCK'::"TaskStatus"
  WHEN 'BLOCKED' THEN 'STUCK'::"TaskStatus"
  WHEN 'DONE' THEN 'DONE'::"TaskStatus"
  WHEN 'CANCELLED' THEN 'DONE'::"TaskStatus"
END;
UPDATE "Task" SET "archived" = true WHERE "status" = 'CANCELLED';
UPDATE "Task" SET "important" = true WHERE "priority" IN ('P0', 'P1');
ALTER TABLE "Task" DROP COLUMN "status";
ALTER TABLE "Task" RENAME COLUMN "status2" TO "status";
DROP TYPE "Status";
ALTER TABLE "Task" ADD CONSTRAINT "Task_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_givenById_fkey" FOREIGN KEY ("givenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Task_milestoneId_idx" ON "Task"("milestoneId");

-- 4. Projects ---------------------------------------------------------------
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'ACTIVE', 'PAUSED', 'DONE');
ALTER TABLE "Project"
  ADD COLUMN "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "startDate" TIMESTAMP(3),
  ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0;
UPDATE "Project" SET "status" = CASE "health"
  WHEN 'ACTIVE' THEN 'ACTIVE'::"ProjectStatus"
  WHEN 'PAUSED' THEN 'PAUSED'::"ProjectStatus"
  WHEN 'SHIPPED' THEN 'DONE'::"ProjectStatus"
  WHEN 'IDEA' THEN 'PLANNED'::"ProjectStatus"
END;
UPDATE "Project" SET "startDate" = "createdAt";
ALTER TABLE "Project" DROP COLUMN "health";
ALTER TABLE "Project" DROP COLUMN "gateTemplate";
DROP TYPE "Health";

-- 5. Comments <- TaskNote + ProjectNote + project-task descriptions --------------
CREATE TYPE "CommentTarget" AS ENUM ('PROJECT', 'MILESTONE', 'TASK');
CREATE TABLE "Comment" (
  "id" TEXT NOT NULL,
  "targetType" "CommentTarget" NOT NULL,
  "targetId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "attachmentUrl" TEXT,
  "attachmentName" TEXT,
  "attachmentType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Comment_targetType_targetId_createdAt_idx" ON "Comment"("targetType", "targetId", "createdAt");
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
INSERT INTO "Comment" ("id", "targetType", "targetId", "authorId", "body", "createdAt")
  SELECT "id", 'TASK', "taskId", "authorId", "body", "createdAt" FROM "TaskNote";
INSERT INTO "Comment" ("id", "targetType", "targetId", "authorId", "body", "createdAt")
  SELECT "id", 'PROJECT', "projectId", "authorId", "body", "createdAt" FROM "ProjectNote";
-- A project task's description becomes its first note, by the person doing it
-- (else the project owner, else the oldest active project authority).
INSERT INTO "Comment" ("id", "targetType", "targetId", "authorId", "body", "createdAt")
  SELECT t."id" || '-desc', 'TASK', t."id",
         COALESCE(t."assigneeId", p."ownerId",
           (SELECT u.id FROM "User" u WHERE u.role IN ('FOUNDER','DIRECTOR','HOD','MANAGER') AND u."disabledAt" IS NULL ORDER BY u."createdAt" LIMIT 1)),
         t."descriptionMd", t."createdAt"
  FROM "Task" t LEFT JOIN "Project" p ON p.id = t."projectId"
  WHERE t."isPrivate" = false AND length(btrim(t."descriptionMd")) > 0;
UPDATE "Task" SET "descriptionMd" = '' WHERE "isPrivate" = false AND length(btrim("descriptionMd")) > 0;
DROP TABLE "TaskNote";
DROP TABLE "ProjectNote";

-- The dropped task columns (dumped first): gates, tags, links, color,
-- groupColor, pinnedAt, priority.
ALTER TABLE "Task" DROP COLUMN "priority";
ALTER TABLE "Task" DROP COLUMN "gates";
ALTER TABLE "Task" DROP COLUMN "tags";
ALTER TABLE "Task" DROP COLUMN "links";
ALTER TABLE "Task" DROP COLUMN "color";
ALTER TABLE "Task" DROP COLUMN "groupColor";
ALTER TABLE "Task" DROP COLUMN "pinnedAt";
DROP TYPE "Priority";

-- 6. Members <- accepted collaborators; drop ProjectManager -------------------
ALTER TABLE "ProjectMember" ADD COLUMN "canManage" BOOLEAN NOT NULL DEFAULT false;
INSERT INTO "ProjectMember" ("id", "projectId", "userId", "createdAt", "canManage")
  SELECT "id", "projectId", "userId", "createdAt", true FROM "ProjectManager" WHERE "status" = 'ACCEPTED'
  ON CONFLICT ("projectId", "userId") DO UPDATE SET "canManage" = true;
DROP TABLE "ProjectManager";

-- 7. Meeting replies ----------------------------------------------------------
ALTER TABLE "EventAttendee" ADD COLUMN "response" TEXT, ADD COLUMN "respondedAt" TIMESTAMP(3);
