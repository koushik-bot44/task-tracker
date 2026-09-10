-- The upload limits count a person's files from the last hour (2026-09-10).
CREATE INDEX "StoredFile_createdById_createdAt_idx" ON "StoredFile"("createdById", "createdAt");
