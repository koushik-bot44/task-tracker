-- Phase 39 — routine collaborators: invite ANOTHER manager to monitor a person's
-- routine (READ_ONLY | EDITABLE), mirroring the per-project manager collaboration.
--
-- Purely ADDITIVE: one new table + its indexes + FKs to existing tables (Person,
-- User). No existing table, column, or row is touched, so the integrity fingerprint
-- (tasks/projects/notes) is byte-identical afterward. Applied atomically.

CREATE TABLE "RoutineCollaborator" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoutineCollaborator_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoutineCollaborator_personId_managerId_key" ON "RoutineCollaborator"("personId", "managerId");
CREATE INDEX "RoutineCollaborator_managerId_status_idx" ON "RoutineCollaborator"("managerId", "status");
CREATE INDEX "RoutineCollaborator_personId_idx" ON "RoutineCollaborator"("personId");

ALTER TABLE "RoutineCollaborator" ADD CONSTRAINT "RoutineCollaborator_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutineCollaborator" ADD CONSTRAINT "RoutineCollaborator_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutineCollaborator" ADD CONSTRAINT "RoutineCollaborator_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
