-- phase 22: meetings are calendar events (one system). Additive only —
-- CalendarEvent gains nullable startTime/endTime and isMeeting (default false),
-- so every existing event is untouched (isMeeting = false, no attendee rows,
-- old scoped-recipient behaviour intact). EventAttendee is the explicit
-- invitee list for a meeting, cascading with both the event and the user.

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "isMeeting" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startTime" TEXT;

-- CreateTable
CREATE TABLE "EventAttendee" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "EventAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventAttendee_userId_idx" ON "EventAttendee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventAttendee_eventId_userId_key" ON "EventAttendee"("eventId", "userId");

-- AddForeignKey
ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
