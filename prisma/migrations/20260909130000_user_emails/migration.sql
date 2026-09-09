-- One person, several email addresses (2026-09-09).
-- The main address stays on "User"."email"; every extra one is a row here.
-- The unique index keeps two PEOPLE from claiming the same extra address; an
-- extra address clashing with somebody's MAIN address is caught in lib/user-emails.ts,
-- which searches both tables before it writes.
CREATE TABLE "UserEmail" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserEmail_email_key" ON "UserEmail"("email");
CREATE INDEX "UserEmail_userId_idx" ON "UserEmail"("userId");

ALTER TABLE "UserEmail" ADD CONSTRAINT "UserEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
