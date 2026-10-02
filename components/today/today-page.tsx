"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToday } from "@/lib/hooks/use-today";
import { useMe } from "@/lib/hooks/use-users";
import { isAdminRole } from "@/lib/roles";
import { MeetingCard } from "./meeting-card";
import { Section } from "./section";
import { SummaryLine } from "./summary-line";
import { TaskRows } from "./task-rows";

/**
 * Today: what is waiting on you, in the order you'd deal with it — your
 * tasks and today's and tomorrow's meetings. A review is recorded on its
 * that need your OK. One button: + gives a task.
 */
export function TodayPage() {
  const { data: me, isLoading: loadingMe, refetch: refetchMe } = useMe();
  const admin = isAdminRole(me?.role);
  // The ADMIN looks after accounts only: no tasks, no meetings, no Today to fetch.
  const { data, isLoading, error, refetch } = useToday(Boolean(me) && !admin);
  const canGive = Boolean(me) && !admin;

  // Bottom padding keeps the last card clear of the floating + button.
  return (
    <div className="mx-auto w-full max-w-content px-4 pb-20 pt-4 md:pb-24">
      {admin ? (
        <EmptyState title="Nothing waiting on you." body="Accounts are looked after from People." />
      ) : data ? (
        /* A failed refresh keeps what is on screen: coming back to the tab without
           signal swapped the tasks and meetings for "Couldn't load this" and left
           it there (2026-10-02). The next refresh runs when the tab is shown again
           or the connection returns. */
        <TodayBody data={data} />
      ) : isLoading || loadingMe ? (
        <div className="space-y-6" aria-busy>
          <Skeleton rows={3} />
          <Skeleton rows={1} />
        </div>
      ) : (
        // Nothing loaded yet. Without the account there is no Today to ask for, so Retry asks for that first.
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void (me ? refetch() : refetchMe())} />
      )}

      {canGive ? (
        /* New opens the record form as a page of its own (owner, 2026-09-15). */
        <Link
          href="/work/new"
          aria-label="Add a task"
          title="Add a task"
          className="press fixed bottom-[calc(80px+env(safe-area-inset-bottom))] right-4 z-sticky grid h-14 w-14 place-items-center rounded-full bg-primary text-on-primary shadow-e2 md:bottom-6 md:right-6"
        >
          <Plus className="h-7 w-7" strokeWidth={2.25} aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

function TodayBody({ data }: { data: NonNullable<ReturnType<typeof useToday>["data"]> }) {
  const hasTasks = data.tasks.length > 0;
  const hasMeetings = data.meetings.length > 0;
  const nothing = !hasTasks && !hasMeetings;

  return (
    <div className="space-y-6">
      {data.summary ? <SummaryLine summary={data.summary} /> : null}

      {nothing ? (
        <EmptyState title="Nothing waiting on you." />
      ) : (
        <>
          <Section title="Your tasks">
            <TaskRows tasks={data.tasks} />
          </Section>

          <Section title="Meetings">
            {hasMeetings ? (
              <div className="space-y-3">
                {data.meetings.map((m) => (
                  <MeetingCard key={m.id} meeting={m} />
                ))}
              </div>
            ) : (
              <EmptyState title="No meetings today or tomorrow." />
            )}
          </Section>
        </>
      )}
    </div>
  );
}
