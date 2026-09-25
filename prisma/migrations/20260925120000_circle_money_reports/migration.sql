-- 2026-09-25: the circle around the tracked person. Fully ADDITIVE — two
-- columns with defaults, one nullable column, two new tables. No existing row
-- changes meaning: every collaborator so far is a co-parent-style monitor
-- (kind FAMILY), every task so far was set by the parent side (MANAGER).

-- AlterTable
ALTER TABLE "RoutineCollaborator" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'FAMILY';
ALTER TABLE "RoutineCollaborator" ADD COLUMN "subject" TEXT;

-- AlterTable
ALTER TABLE "RoutineTask" ADD COLUMN "addedBy" TEXT NOT NULL DEFAULT 'MANAGER';

-- CreateTable
CREATE TABLE "MoneyEntry" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "addedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentorReport" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "subject" TEXT NOT NULL,
    "covered" TEXT NOT NULL,
    "homework" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MentorReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MoneyEntry_personId_date_idx" ON "MoneyEntry"("personId", "date");

-- CreateIndex
CREATE INDEX "MentorReport_personId_date_idx" ON "MentorReport"("personId", "date");

-- CreateIndex
CREATE INDEX "MentorReport_collaboratorId_date_idx" ON "MentorReport"("collaboratorId", "date");

-- AddForeignKey
ALTER TABLE "MoneyEntry" ADD CONSTRAINT "MoneyEntry_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorReport" ADD CONSTRAINT "MentorReport_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorReport" ADD CONSTRAINT "MentorReport_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "RoutineCollaborator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
