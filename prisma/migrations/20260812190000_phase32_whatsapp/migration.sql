-- Phase 32: WhatsApp meeting notifications (Twilio). ADDITIVE ONLY — no existing
-- row is touched: User gains a nullable phone + a whatsappOptIn (default true,
-- harmless while phone is null), and a new WhatsAppLog table mirrors EmailLog for
-- send-dedup + auditing.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "whatsappOptIn" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "WhatsAppLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppLog_dedupeKey_key" ON "WhatsAppLog"("dedupeKey");

-- CreateIndex
CREATE INDEX "WhatsAppLog_userId_sentAt_idx" ON "WhatsAppLog"("userId", "sentAt");

-- AddForeignKey
ALTER TABLE "WhatsAppLog" ADD CONSTRAINT "WhatsAppLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
