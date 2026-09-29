-- 2026-09-29 (automatic location): enrolled phones, pairing codes, Locate Now
-- requests and the location access log; positions gain the phone that sent them,
-- an idempotency id, the server's receive time and what the phone measured.
-- Additive: new tables, nullable columns and columns with defaults only.

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "locationRetentionDays" INTEGER NOT NULL DEFAULT 90;

-- AlterTable
ALTER TABLE "LocationPoint" ADD COLUMN     "altitude" DOUBLE PRECISION,
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "heading" DOUBLE PRECISION,
ADD COLUMN     "isCharging" BOOLEAN,
ADD COLUMN     "networkType" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "speed" DOUBLE PRECISION,
ADD COLUMN     "trigger" TEXT;

-- CreateTable
CREATE TABLE "ChildDevice" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "name" TEXT,
    "model" TEXT,
    "osVersion" TEXT,
    "appVersion" TEXT,
    "tokenHash" TEXT NOT NULL,
    "tokenIssuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "enrolledById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "permission" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "preciseLocation" BOOLEAN,
    "locationEnabled" BOOLEAN,
    "notificationsAllowed" BOOLEAN,
    "batteryOptimized" BOOLEAN,
    "trackingState" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "batteryLevel" INTEGER,
    "isCharging" BOOLEAN,
    "networkType" TEXT,
    "queueSize" INTEGER,
    "pushProvider" TEXT,
    "pushToken" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastLocationAt" TIMESTAMP(3),
    "lastContactAt" TIMESTAMP(3),
    "lastShutdownAt" TIMESTAMP(3),
    "bootedAt" TIMESTAMP(3),
    "statusAlertState" TEXT,
    "statusAlertedAt" TIMESTAMP(3),
    "rateWindowStart" TIMESTAMP(3),
    "rateWindowCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChildDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePairing" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "deviceId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevicePairing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocateRequest" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pushProvider" TEXT,
    "pushDetail" TEXT,
    "failureReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "locationPointId" TEXT,

    CONSTRAINT "LocateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationAuditEvent" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "deviceId" TEXT,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChildDevice_tokenHash_key" ON "ChildDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "ChildDevice_personId_idx" ON "ChildDevice"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "DevicePairing_codeHash_key" ON "DevicePairing"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "DevicePairing_deviceId_key" ON "DevicePairing"("deviceId");

-- CreateIndex
CREATE INDEX "DevicePairing_personId_idx" ON "DevicePairing"("personId");

-- CreateIndex
CREATE INDEX "LocateRequest_personId_requestedAt_idx" ON "LocateRequest"("personId", "requestedAt");

-- CreateIndex
CREATE INDEX "LocateRequest_deviceId_status_idx" ON "LocateRequest"("deviceId", "status");

-- CreateIndex
CREATE INDEX "LocationAuditEvent_personId_createdAt_idx" ON "LocationAuditEvent"("personId", "createdAt");

-- CreateIndex
CREATE INDEX "LocationAuditEvent_actorUserId_personId_action_createdAt_idx" ON "LocationAuditEvent"("actorUserId", "personId", "action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LocationPoint_deviceId_clientId_key" ON "LocationPoint"("deviceId", "clientId");

-- AddForeignKey
ALTER TABLE "LocationPoint" ADD CONSTRAINT "LocationPoint_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "ChildDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildDevice" ADD CONSTRAINT "ChildDevice_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePairing" ADD CONSTRAINT "DevicePairing_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePairing" ADD CONSTRAINT "DevicePairing_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "ChildDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocateRequest" ADD CONSTRAINT "LocateRequest_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocateRequest" ADD CONSTRAINT "LocateRequest_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "ChildDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocateRequest" ADD CONSTRAINT "LocateRequest_locationPointId_fkey" FOREIGN KEY ("locationPointId") REFERENCES "LocationPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationAuditEvent" ADD CONSTRAINT "LocationAuditEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

