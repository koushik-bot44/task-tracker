-- 2026-09-25 (maps): additive. A nullable secret on Person for the phone's
-- location-app link, and one table of positions (check-ins and posted points).

-- AlterTable
ALTER TABLE "Person" ADD COLUMN "feedToken" TEXT;

-- CreateTable
CREATE TABLE "LocationPoint" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "battery" INTEGER,
    "source" TEXT NOT NULL,
    "place" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_feedToken_key" ON "Person"("feedToken");

-- CreateIndex
CREATE INDEX "LocationPoint_personId_at_idx" ON "LocationPoint"("personId", "at");

-- AddForeignKey
ALTER TABLE "LocationPoint" ADD CONSTRAINT "LocationPoint_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
