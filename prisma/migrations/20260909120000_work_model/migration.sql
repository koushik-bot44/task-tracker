-- Work model (2026-09-09). Hand-authored, ADDITIVE: nothing is dropped. Runs in
-- one transaction under `prisma migrate deploy`; scripts/work-model-dryrun.ts
-- runs the same file inside BEGIN…ROLLBACK and prints the audit counts.
-- Plan: records/plans/work-model-plan.md §10.

-- 1. Enums ----------------------------------------------------------------------
CREATE TYPE "WorkType" AS ENUM ('GENERAL', 'ISSUE', 'REQUEST', 'PROJECT_TASK', 'APPROVAL', 'SUPPORT');
CREATE TYPE "WorkState" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED', 'CANCELLED', 'ESCALATED', 'REOPENED');
CREATE TYPE "WorkPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "WaitingReason" AS ENUM ('REQUESTER', 'APPROVAL', 'OTHER_TEAM', 'VENDOR', 'PARTS', 'OTHER');
CREATE TYPE "ResolutionCode" AS ENUM ('FIXED', 'COMPLETED', 'WORKAROUND', 'CANNOT_REPRODUCE', 'DUPLICATE', 'NOT_NEEDED');
CREATE TYPE "ActivityType" AS ENUM ('COMMENT', 'WORK_NOTE', 'FIELD_CHANGE', 'SYSTEM', 'ATTACHMENT', 'EMAIL', 'MENTION');
CREATE TYPE "ActivityVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

-- 2. Teams, categories, rules ----------------------------------------------------
CREATE TABLE "AssignmentGroup" (
  "id" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "leadId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "orderKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssignmentGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssignmentGroup_departmentId_name_key" ON "AssignmentGroup"("departmentId", "name");
CREATE INDEX "AssignmentGroup_leadId_idx" ON "AssignmentGroup"("leadId");
ALTER TABLE "AssignmentGroup" ADD CONSTRAINT "AssignmentGroup_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentGroup" ADD CONSTRAINT "AssignmentGroup_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AssignmentGroupMember" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssignmentGroupMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssignmentGroupMember_groupId_userId_key" ON "AssignmentGroupMember"("groupId", "userId");
CREATE INDEX "AssignmentGroupMember_userId_idx" ON "AssignmentGroupMember"("userId");
ALTER TABLE "AssignmentGroupMember" ADD CONSTRAINT "AssignmentGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AssignmentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentGroupMember" ADD CONSTRAINT "AssignmentGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TaskCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parentId" TEXT,
  "departmentId" TEXT,
  "assignmentGroupId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "orderKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskCategory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaskCategory_parentId_idx" ON "TaskCategory"("parentId");
CREATE INDEX "TaskCategory_departmentId_idx" ON "TaskCategory"("departmentId");
ALTER TABLE "TaskCategory" ADD CONSTRAINT "TaskCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TaskCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskCategory" ADD CONSTRAINT "TaskCategory_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskCategory" ADD CONSTRAINT "TaskCategory_assignmentGroupId_fkey" FOREIGN KEY ("assignmentGroupId") REFERENCES "AssignmentGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AssignmentRule" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "match" JSONB NOT NULL DEFAULT '{}',
  "set" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssignmentRule_pkey" PRIMARY KEY ("id")
);

-- 3. The activity stream ---------------------------------------------------------
CREATE TABLE "TaskActivity" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "authorId" TEXT,
  "type" "ActivityType" NOT NULL,
  "visibility" "ActivityVisibility" NOT NULL DEFAULT 'PUBLIC',
  "body" TEXT NOT NULL DEFAULT '',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "attachmentUrl" TEXT,
  "attachmentName" TEXT,
  "attachmentType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaskActivity_taskId_createdAt_idx" ON "TaskActivity"("taskId", "createdAt");
CREATE INDEX "TaskActivity_taskId_type_idx" ON "TaskActivity"("taskId", "type");
CREATE INDEX "TaskActivity_authorId_idx" ON "TaskActivity"("authorId");
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Task: the record --------------------------------------------------------------
ALTER TABLE "Task"
  ADD COLUMN "number" INTEGER,
  ADD COLUMN "type" "WorkType" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "state" "WorkState" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "priority" "WorkPriority" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "requesterId" TEXT,
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "assignmentGroupId" TEXT,
  ADD COLUMN "waitingReason" "WaitingReason",
  ADD COLUMN "waitingNote" TEXT,
  ADD COLUMN "resolutionCode" "ResolutionCode",
  ADD COLUMN "resolutionNotes" TEXT,
  ADD COLUMN "rootCause" TEXT,
  ADD COLUMN "resolvedById" TEXT,
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "closedById" TEXT,
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "escalatedAt" TIMESTAMP(3);

-- 4a. Numbers, oldest first, then a sequence for everything after.
CREATE SEQUENCE "Task_number_seq";
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS n FROM "Task"
)
UPDATE "Task" t SET "number" = o.n FROM ordered o WHERE o.id = t.id;
SELECT setval('"Task_number_seq"', GREATEST((SELECT COALESCE(MAX("number"), 0) FROM "Task"), 1));
ALTER TABLE "Task" ALTER COLUMN "number" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "number" SET DEFAULT nextval('"Task_number_seq"');
ALTER SEQUENCE "Task_number_seq" OWNED BY "Task"."number";
CREATE UNIQUE INDEX "Task_number_key" ON "Task"("number");

-- 4b. Type and priority from what exists.
UPDATE "Task" SET "type" = 'PROJECT_TASK' WHERE "projectId" IS NOT NULL AND "isPrivate" = false;
UPDATE "Task" SET "priority" = 'HIGH' WHERE "important" = true;

-- 4c. State from the four statuses. DONE + archived was CANCELLED before the
--     restructure mapped it; it goes back to CANCELLED.
UPDATE "Task" SET "state" = CASE
  WHEN "status" = 'DONE' AND "archived" = true THEN 'CANCELLED'::"WorkState"
  WHEN "status" = 'DONE' THEN 'CLOSED'::"WorkState"
  WHEN "status" = 'DOING' THEN 'IN_PROGRESS'::"WorkState"
  WHEN "status" = 'STUCK' THEN 'WAITING'::"WorkState"
  WHEN "assigneeId" IS NOT NULL THEN 'ASSIGNED'::"WorkState"
  ELSE 'NEW'::"WorkState"
END;
UPDATE "Task" SET "waitingReason" = 'OTHER' WHERE "state" = 'WAITING';
UPDATE "Task" SET
  "resolutionCode" = 'COMPLETED',
  "resolvedAt" = COALESCE("completedAt", "updatedAt"),
  "resolvedById" = "completedById",
  "closedAt" = COALESCE("completedAt", "updatedAt"),
  "closedById" = "completedById"
WHERE "state" = 'CLOSED';
UPDATE "Task" SET "closedAt" = COALESCE("completedAt", "updatedAt") WHERE "state" = 'CANCELLED';

-- 4d. Requester: who gave it, else who holds it, else the project's owner.
UPDATE "Task" t SET "requesterId" = COALESCE(t."givenById", t."assigneeId", p."ownerId")
FROM (SELECT id, "ownerId" FROM "Project") p
WHERE t."isPrivate" = false AND t."projectId" = p.id;
UPDATE "Task" SET "requesterId" = COALESCE("givenById", "assigneeId")
WHERE "isPrivate" = false AND "requesterId" IS NULL;

-- 4e. Department: the project's, else the holder's.
UPDATE "Task" t SET "departmentId" = p."departmentId" FROM "Project" p WHERE t."projectId" = p.id AND p."departmentId" IS NOT NULL;
UPDATE "Task" t SET "departmentId" = u."departmentId" FROM "User" u
WHERE t."departmentId" IS NULL AND t."isPrivate" = false AND t."assigneeId" = u.id AND u."departmentId" IS NOT NULL;

-- 4f. Keys, indexes, and the one check the walk relies on.
ALTER TABLE "Task" ADD CONSTRAINT "Task_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TaskCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignmentGroupId_fkey" FOREIGN KEY ("assignmentGroupId") REFERENCES "AssignmentGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_parent_not_self" CHECK ("parentId" IS NULL OR "parentId" <> "id");
CREATE INDEX "Task_state_idx" ON "Task"("state");
CREATE INDEX "Task_departmentId_state_idx" ON "Task"("departmentId", "state");
CREATE INDEX "Task_assignmentGroupId_state_idx" ON "Task"("assignmentGroupId", "state");
CREATE INDEX "Task_assigneeId_state_idx" ON "Task"("assigneeId", "state");
CREATE INDEX "Task_requesterId_idx" ON "Task"("requesterId");
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");

-- 5. Task notes become the first activity rows (project and milestone notes stay). --
INSERT INTO "TaskActivity" ("id", "taskId", "authorId", "type", "visibility", "body", "metadata", "attachmentUrl", "attachmentName", "attachmentType", "createdAt")
SELECT c."id", c."targetId", c."authorId", 'COMMENT', 'PUBLIC', c."body", '{}', c."attachmentUrl", c."attachmentName", c."attachmentType", c."createdAt"
FROM "Comment" c JOIN "Task" t ON t."id" = c."targetId"
WHERE c."targetType" = 'TASK';
DELETE FROM "Comment" c USING "Task" t WHERE c."targetType" = 'TASK' AND c."targetId" = t."id";

-- 6. Notes and meetings outlive their author (a deleted account no longer takes them). --
ALTER TABLE "Comment" DROP CONSTRAINT IF EXISTS "Comment_authorId_fkey";
ALTER TABLE "Comment" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Bell rows know their task; the same event never writes twice. ---------------
ALTER TABLE "Notification"
  ADD COLUMN "taskId" TEXT,
  ADD COLUMN "eventId" TEXT,
  ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX "Notification_taskId_idx" ON "Notification"("taskId");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE "Notification" n SET "taskId" = t."id"
FROM "Task" t
WHERE n."taskId" IS NULL AND (n."data" ->> 'url') LIKE ('%task=' || t."id" || '%');
UPDATE "Notification" SET "eventId" = "data" ->> 'eventId' WHERE "eventId" IS NULL AND ("data" ->> 'eventId') IS NOT NULL;

-- 8. Sessions can be revoked. ---------------------------------------------------------
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
