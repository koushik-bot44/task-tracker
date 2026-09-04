-- Phase 33: rebuild My Space as a private Department>Project>Task hierarchy.
-- The old flat "labels" grouping is REMOVED. Its rows (5 Labels + 41 private
-- Tasks) were DUMPED to records/snapshots/ and DELETED first (owner-approved
-- discard, scripts/phase33-discard-labels.ts) — so the DROP COLUMN / DROP TABLE
-- below touch only already-empty/null structures. Shared project data is
-- untouched (project-task count 131 -> 131, asserted). ADDITIVE otherwise:
-- two new caller-scoped personal tables + Task.personalProjectId.

-- DropForeignKey
ALTER TABLE "Label" DROP CONSTRAINT "Label_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_labelId_fkey";

-- DropIndex
DROP INDEX "Task_labelId_idx";

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "labelId",
ADD COLUMN     "personalProjectId" TEXT;

-- DropTable
DROP TABLE "Label";

-- CreateTable
CREATE TABLE "PersonalDepartment" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orderKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalProject" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orderKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonalDepartment_ownerId_idx" ON "PersonalDepartment"("ownerId");

-- CreateIndex
CREATE INDEX "PersonalProject_ownerId_departmentId_idx" ON "PersonalProject"("ownerId", "departmentId");

-- CreateIndex
CREATE INDEX "Task_personalProjectId_idx" ON "Task"("personalProjectId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_personalProjectId_fkey" FOREIGN KEY ("personalProjectId") REFERENCES "PersonalProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalDepartment" ADD CONSTRAINT "PersonalDepartment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalProject" ADD CONSTRAINT "PersonalProject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalProject" ADD CONSTRAINT "PersonalProject_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "PersonalDepartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
