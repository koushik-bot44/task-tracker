-- Phase 5, batch 1: team structure.
--
-- Strictly additive. No DROP, no column narrowing, no NOT NULL without a
-- default, no backfill. Every existing row keeps the values it has; the three
-- tools that predate this migration get description = '' and leadId = NULL,
-- and a manager assigns leads through the UI rather than a data migration.
--
-- ALTER TYPE ... ADD VALUE is safe inside this transaction because neither new
-- value is USED in this migration — no default is changed to ON_HOLD, and no
-- row is written as TEAM_LEAD here. Postgres only forbids using a new enum
-- label in the same transaction that adds it.

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'TEAM_LEAD';

-- AlterEnum
ALTER TYPE "Status" ADD VALUE 'ON_HOLD';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "leadId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "assigneeId" TEXT;

-- CreateTable
CREATE TABLE "ProjectNote" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectNote_projectId_createdAt_idx" ON "ProjectNote"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNote" ADD CONSTRAINT "ProjectNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNote" ADD CONSTRAINT "ProjectNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
