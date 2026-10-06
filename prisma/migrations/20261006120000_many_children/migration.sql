-- 2026-10-06: a parent may run several children (Person.managerId no longer unique).
-- DropIndex
DROP INDEX "Person_managerId_key";

-- CreateIndex
CREATE INDEX "Person_managerId_idx" ON "Person"("managerId");

