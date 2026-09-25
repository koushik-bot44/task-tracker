-- 2026-09-25: the Family Routine Agreement's non-negotiables are logged only when
-- crossed. Additive: one flag with a default; every existing row keeps its meaning.

-- AlterTable
ALTER TABLE "NonNegotiableMark" ADD COLUMN "crossed" BOOLEAN NOT NULL DEFAULT false;
