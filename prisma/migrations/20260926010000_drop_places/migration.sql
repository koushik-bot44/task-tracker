-- 2026-09-26: the family's own place names are out ("remove this option completely");
-- the log carries the map's own names instead.

-- DropForeignKey
ALTER TABLE "Place" DROP CONSTRAINT "Place_personId_fkey";

-- DropTable
DROP TABLE "Place";
