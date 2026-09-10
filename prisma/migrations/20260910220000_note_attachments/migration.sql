-- A note can carry several files (2026-09-10). A project's or a milestone's note
-- is a Comment, a task's is a TaskActivity; exactly one of the two ids is set.
-- The notes' own attachmentUrl/Name/Type columns stay and keep the first file.
CREATE TABLE "CommentAttachment" (
    "id" TEXT NOT NULL,
    "commentId" TEXT,
    "activityId" TEXT,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "size" INTEGER,
    "orderKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommentAttachment_commentId_orderKey_idx" ON "CommentAttachment"("commentId", "orderKey");
CREATE INDEX "CommentAttachment_activityId_orderKey_idx" ON "CommentAttachment"("activityId", "orderKey");
CREATE INDEX "CommentAttachment_url_idx" ON "CommentAttachment"("url");

ALTER TABLE "CommentAttachment" ADD CONSTRAINT "CommentAttachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommentAttachment" ADD CONSTRAINT "CommentAttachment_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "TaskActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every note that already carries a file gets it as its first attachment.
INSERT INTO "CommentAttachment" ("id", "commentId", "url", "name", "type", "orderKey", "createdAt")
SELECT 'ca' || md5(random()::text || c."id"), c."id", c."attachmentUrl", COALESCE(c."attachmentName", 'File'), COALESCE(c."attachmentType", 'application/octet-stream'), '0000', c."createdAt"
FROM "Comment" c
WHERE c."attachmentUrl" IS NOT NULL;

INSERT INTO "CommentAttachment" ("id", "activityId", "url", "name", "type", "orderKey", "createdAt")
SELECT 'ca' || md5(random()::text || a."id"), a."id", a."attachmentUrl", COALESCE(a."attachmentName", 'File'), COALESCE(a."attachmentType", 'application/octet-stream'), '0000', a."createdAt"
FROM "TaskActivity" a
WHERE a."attachmentUrl" IS NOT NULL;
