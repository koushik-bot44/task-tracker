-- There is one person at the top and he is the CEO (owner, repeatedly). The
-- Director rung never held an account in either database, so the enum loses it.
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('FOUNDER', 'HOD', 'MANAGER', 'TEAM_LEAD', 'RESOURCE', 'ADMIN', 'PERSON');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
DROP TYPE "Role_old";
