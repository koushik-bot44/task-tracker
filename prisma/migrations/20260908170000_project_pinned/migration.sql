-- Pin a project to the top of its department (owner, 2026-09-08).
ALTER TABLE "Project" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
