-- 2026-09-25 (screen time): a daily limit on the person and one row per logged day. Additive.

-- AlterTable
ALTER TABLE "Person" ADD COLUMN "screenLimitMin" INTEGER NOT NULL DEFAULT 90;

-- CreateTable
CREATE TABLE "ScreenTimeEntry" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalMin" INTEGER NOT NULL,
    "apps" JSONB,
    "side" TEXT NOT NULL,
    "addedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreenTimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScreenTimeEntry_personId_date_key" ON "ScreenTimeEntry"("personId", "date");

-- AddForeignKey
ALTER TABLE "ScreenTimeEntry" ADD CONSTRAINT "ScreenTimeEntry_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
