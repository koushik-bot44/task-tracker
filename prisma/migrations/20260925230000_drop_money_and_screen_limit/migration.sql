-- 2026-09-25, later the same day: pocket money is out ("remove the money
-- management completely") and screen time is only looked at, never limited.

-- DropForeignKey
ALTER TABLE "MoneyEntry" DROP CONSTRAINT "MoneyEntry_personId_fkey";

-- DropTable
DROP TABLE "MoneyEntry";

-- AlterTable
ALTER TABLE "Person" DROP COLUMN "screenLimitMin";
