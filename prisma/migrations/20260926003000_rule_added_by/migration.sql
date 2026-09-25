-- 2026-09-25: the person may set a rule of their own; the parent sees whose it is. Additive.

-- AlterTable
ALTER TABLE "NonNegotiable" ADD COLUMN "addedBy" TEXT NOT NULL DEFAULT 'MANAGER';
