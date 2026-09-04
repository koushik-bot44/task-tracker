-- Phase 16: rename Folder -> Department. DATA-PRESERVING — every RENAME keeps
-- all rows and every Project relation intact; only names change. The 3 existing
-- Folder rows survive as Departments, and each project's folder link becomes its
-- department link untouched (no row is added, moved, or dropped here).

-- Table + its constraints. Renaming the PK constraint also renames its backing
-- index (they share a name), so "Folder_pkey" -> "Department_pkey" covers both.
ALTER TABLE "Folder" RENAME TO "Department";
ALTER TABLE "Department" RENAME CONSTRAINT "Folder_pkey" TO "Department_pkey";
ALTER TABLE "Department" RENAME CONSTRAINT "Folder_createdById_fkey" TO "Department_createdById_fkey";

-- Project.folderId -> departmentId, plus its FK and index. The FK's target
-- follows the table rename automatically (Postgres tracks it by identity).
ALTER TABLE "Project" RENAME COLUMN "folderId" TO "departmentId";
ALTER TABLE "Project" RENAME CONSTRAINT "Project_folderId_fkey" TO "Project_departmentId_fkey";
ALTER INDEX "Project_folderId_idx" RENAME TO "Project_departmentId_idx";
