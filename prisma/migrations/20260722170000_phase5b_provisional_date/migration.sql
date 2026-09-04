-- Phase 5 batch 2: persist whether an estimated completion date was guessed.
--
-- Additive. One nullable-by-default boolean with a server default, so every
-- existing row reads `false` — which is the honest answer for them: the two
-- rows the owner dated by hand were chosen, and the legacy rows have no date
-- at all. No DROP, no narrowing, no backfill.

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "dueProvisional" BOOLEAN NOT NULL DEFAULT false;
