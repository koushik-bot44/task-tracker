-- 2026-09-25, last thing: screen time typed in by hand is out ("remove screen time").

-- DropForeignKey
ALTER TABLE "ScreenTimeEntry" DROP CONSTRAINT "ScreenTimeEntry_personId_fkey";

-- DropTable
DROP TABLE "ScreenTimeEntry";
