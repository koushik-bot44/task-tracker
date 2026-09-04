-- The CEO may set a project's percentage by hand; null means "count the tasks".
ALTER TABLE "Project" ADD COLUMN "progressManual" INTEGER;
