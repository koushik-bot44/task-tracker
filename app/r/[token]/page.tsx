import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { readReplyToken } from "@/lib/meeting-reply";
import { bellUsers } from "@/lib/notify";
import { formatISTDate } from "@/lib/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The reply landing page behind the [I'll be there] / [Can't] links in the
 * evening-before message. Public — the signed token is the authorisation.
 * One tap writes the reply; a second tap just shows it again. A "Can't"
 * tells the organiser so they can reschedule from Today.
 */
export default async function ReplyPage({ params }: { params: { token: string } }) {
  const parsed = await readReplyToken(params.token);
  let state: "invalid" | "gone" | "yes" | "no" = "invalid";
  let meeting: { title: string; date: Date; projectName: string | null } | null = null;

  if (parsed) {
    const row = await prisma.eventAttendee.findUnique({
      where: { id: parsed.attendeeId },
      include: {
        user: { select: { id: true, name: true } },
        event: { select: { id: true, title: true, date: true, createdById: true, project: { select: { name: true } } } },
      },
    });
    if (!row) {
      state = "gone";
    } else {
      meeting = { title: row.event.title, date: row.event.date, projectName: row.event.project?.name ?? null };
      if (row.response !== parsed.response) {
        await prisma.eventAttendee.update({ where: { id: row.id }, data: { response: parsed.response, respondedAt: new Date() } });
        if (parsed.response === "NO" && row.event.createdById !== row.userId) {
          await bellUsers([row.event.createdById], {
            type: "meeting.cant",
            title: `${row.user.name} can't make ${row.event.title}`,
            body: `${formatISTDate(row.event.date)} · ${row.event.project?.name ?? "Everyone"} — reschedule from Today`,
            url: "/",
            data: { eventId: row.event.id },
          });
        }
      }
      state = parsed.response === "YES" ? "yes" : "no";
    }
  }

  const copy = {
    yes: { title: "See you there", body: "Your reply is saved. The organiser can see it on Today." },
    no: { title: "Noted", body: "The organiser has been told and can move the meeting. You'll get a new message if it moves." },
    gone: { title: "That meeting is gone", body: "It was cancelled or moved. Check Today for the latest." },
    invalid: { title: "This link has expired", body: "Open Orbit to reply from Today instead." },
  }[state];

  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-center justify-center gap-2">
          <Image src="/orbit-logo.png" alt="" width={28} height={28} className="h-7 w-7 rounded-lg" />
          <span className="text-row font-semibold text-ink">Orbit</span>
        </div>
        <div className="card p-6 text-center">
          <h1 className="text-section font-semibold text-ink">{copy.title}</h1>
          {meeting ? (
            <p className="mt-2 text-sm text-muted">
              {meeting.title} · {formatISTDate(meeting.date)}
              {meeting.projectName ? ` · ${meeting.projectName}` : ""}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-muted">{copy.body}</p>
          <a href="/" className="press mt-5 inline-flex h-11 items-center rounded-input bg-primary px-5 text-sm font-semibold text-on-primary">
            Open Today
          </a>
        </div>
      </div>
    </main>
  );
}
