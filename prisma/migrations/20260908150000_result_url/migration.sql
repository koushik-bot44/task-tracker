-- The finished thing: a link to what a milestone (or the whole project)
-- produced — the live site, the document, the folder.
ALTER TABLE "Project" ADD COLUMN "resultUrl" TEXT;
ALTER TABLE "Milestone" ADD COLUMN "resultUrl" TEXT;
