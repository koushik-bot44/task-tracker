-- Phase 42: the non-negotiable model flips from "crossed" (a violation the manager
-- records) to "required + done" (the manager schedules a day, the person completes it).
-- A NonNegotiableMark row now exists ONLY on days the manager marked required; its
-- `done` flag is set by the person. Existing rows (old "crossed" days) are kept and
-- become "required, not done" (done defaults to false) — the owner can re-tap.
ALTER TABLE "NonNegotiableMark" DROP COLUMN "crossed";
ALTER TABLE "NonNegotiableMark" ADD COLUMN "done" BOOLEAN NOT NULL DEFAULT false;
