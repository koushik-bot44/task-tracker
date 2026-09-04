-- Phase 34: family 'Routine' feature + a walled-off CHILD login role.
-- Fully ADDITIVE: a new Role enum value + 5 new tables. No existing table or
-- row is touched; existing accounts unaffected (CHILD is created only via the
-- Routine flow).

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CHILD';

-- CreateTable
CREATE TABLE "Child" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineDay" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "bedtime" TEXT,
    "wakeTime" TEXT,
    "wentToSchool" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutineDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineHabit" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orderKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RoutineHabit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineHabitLog" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RoutineHabitLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineTask" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" DATE,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutineTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Child_managerId_key" ON "Child"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "Child_userId_key" ON "Child"("userId");

-- CreateIndex
CREATE INDEX "RoutineDay_childId_date_idx" ON "RoutineDay"("childId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineDay_childId_date_key" ON "RoutineDay"("childId", "date");

-- CreateIndex
CREATE INDEX "RoutineHabit_childId_idx" ON "RoutineHabit"("childId");

-- CreateIndex
CREATE INDEX "RoutineHabitLog_habitId_date_idx" ON "RoutineHabitLog"("habitId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineHabitLog_habitId_date_key" ON "RoutineHabitLog"("habitId", "date");

-- CreateIndex
CREATE INDEX "RoutineTask_childId_dueDate_idx" ON "RoutineTask"("childId", "dueDate");

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineDay" ADD CONSTRAINT "RoutineDay_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineHabit" ADD CONSTRAINT "RoutineHabit_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineHabitLog" ADD CONSTRAINT "RoutineHabitLog_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "RoutineHabit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineTask" ADD CONSTRAINT "RoutineTask_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

