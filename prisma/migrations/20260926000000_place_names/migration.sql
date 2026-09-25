-- 2026-09-25: positions carry the map's own name for the spot; a small cache keeps
-- the free lookup to once per spot. Additive.

-- AlterTable
ALTER TABLE "LocationPoint" ADD COLUMN "placeName" TEXT;

-- CreateTable
CREATE TABLE "GeoName" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoName_pkey" PRIMARY KEY ("key")
);
