-- Phase 48: the company hierarchy.
-- ADDITIVE + data-preserving renames only. No rows are deleted or rewritten;
-- every DEVELOPER row simply becomes RESOURCE via the enum-value rename.

-- 1. Three roles above MANAGER. (Postgres >= 12 allows ADD VALUE inside a
--    transaction as long as the new value is not USED in the same transaction —
--    and nothing below inserts rows with these values.)
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FOUNDER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DIRECTOR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'HOD';

-- 2. DEVELOPER -> RESOURCE, in place: every existing row keeps its meaning.
ALTER TYPE "Role" RENAME VALUE 'DEVELOPER' TO 'RESOURCE';

-- 3. Project-level priority + deadline.
CREATE TYPE "ProjectPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
ALTER TABLE "Project" ADD COLUMN "priority" "ProjectPriority" NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "Project" ADD COLUMN "deadline" TIMESTAMP(3);

-- 4. Departments become company-wide: a description, an optional HOD, and a
--    creator that is attribution only (nullable + SET NULL so removing a user
--    never removes a shared department).
ALTER TABLE "Department" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Department" ADD COLUMN "hodId" TEXT;
ALTER TABLE "Department" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "Department" DROP CONSTRAINT "Department_createdById_fkey";
ALTER TABLE "Department" ADD CONSTRAINT "Department_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Department" ADD CONSTRAINT "Department_hodId_fkey"
  FOREIGN KEY ("hodId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
