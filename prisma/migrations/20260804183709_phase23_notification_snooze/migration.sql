-- Phase 23 — notification snooze. PURELY ADDITIVE and backward-compatible:
-- a new nullable column defaults to NULL for every existing row, meaning
-- "not snoozed", so the active bell list and unread counts are unchanged for
-- all current notifications. No data is rewritten. The index supports the
-- cron wake scan (Notification WHERE snoozedUntil <= now across all users).

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "snoozedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_snoozedUntil_idx" ON "Notification"("snoozedUntil");
