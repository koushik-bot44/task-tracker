-- AlterTable (phase 15): Task gains private-personal-task columns plus a group
-- tint. projectId is relaxed to nullable so a PRIVATE task can belong to no
-- project (isPrivate=true, projectId NULL, ownerId set). This changes NO data —
-- every existing task keeps its projectId; the FK (Task_projectId_fkey, ON
-- DELETE CASCADE) is untouched, only the NOT NULL is dropped.
ALTER TABLE "Task" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "Task" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Task" ADD COLUMN "labelId" TEXT;
ALTER TABLE "Task" ADD COLUMN "groupColor" TEXT;

-- CreateTable (a user's personal label — a grouping in their private space)
CREATE TABLE "Label" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "orderKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Label_ownerId_idx" ON "Label"("ownerId");

-- CreateIndex
CREATE INDEX "Task_ownerId_isPrivate_idx" ON "Task"("ownerId", "isPrivate");

-- CreateIndex
CREATE INDEX "Task_labelId_idx" ON "Task"("labelId");

-- AddForeignKey
ALTER TABLE "Label" ADD CONSTRAINT "Label_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (private-task owner; SetNull so removing a user never hits a wall)
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (a private task's label; SetNull so deleting a label unfiles, never deletes, its tasks)
ALTER TABLE "Task" ADD CONSTRAINT "Task_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE SET NULL ON UPDATE CASCADE;
