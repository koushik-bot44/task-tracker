"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { GiveTaskSheet } from "@/components/sheets/give-task-sheet";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToday } from "@/lib/hooks/use-today";
import { useMe } from "@/lib/hooks/use-users";
import { isAdminRole } from "@/lib/roles";
import { MeetingCard } from "./meeting-card";
import { NeedsOkCard } from "./needs-ok-card";
import { Section } from "./section";
import { SummaryLine } from "./summary-line";
import { TaskRows } from "./task-rows";

/**
 * Today: what is waiting on you, in the order you'd deal with it — your
 * tasks, today's and tomorrow's meetings, and (founder/director) the reviews
 * that need your OK. One button: + gives a task.
 */
export function TodayPage() {
  const { data, isLoading, isError, error, refetch } = useToday();
  const { data: me } = useMe();
  const [giving, setGiving] = useState(false);
  const canGive = Boolean(me) && !isAdminRole(me?.role);

  return (
    {/* Bottom padding keeps the last card clear of the floating + button. */}
    <div className="mx-auto w-full max-w-content px-4 pb-20 pt-4 md:pb-24">
      {isLoading ? (
        <div className="space-y-6" aria-busy>
          <Skeleton rows={3} />
          <Skeleton rows={1} />
        </div>
      ) : isError || !data ? (
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
      ) : (
        <TodayBody data={data} />
      )}

      {canGive ? (
        <>
          <button
            type="button"
            onClick={() => setGiving(true)}
            aria-label="Give a task"
            title="Give a task"
            className="press fixed bottom-[calc(80px+env(safe-area-inset-bottom))] right-4 z-sticky grid h-14 w-14 place-items-center rounded-full bg-primary text-on-primary shadow-e2 md:bottom-6 md:right-6"
          >
            <Plus className="h-7 w-7" strokeWidth={2.25} aria-hidden />
          </button>
          <GiveTaskSheet open={giving} onClose={() => setGiving(false)} projectId={null} />
        </>
      ) : null}
    </div>
  );
}

function TodayBody({ data }: { data: NonNullable<ReturnType<typeof useToday>["data"]> }) {
  const hasTasks = data.tasks.length > 0;
  const hasMeetings = data.meetings.length > 0;
  const hasNeedsOk = data.needsOk.length > 0;
  const nothing = !hasTasks && !hasMeetings && !hasNeedsOk;

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

          {hasNeedsOk ? (
            <Section title="Needs your OK">
              <div className="space-y-3">
                {data.needsOk.map((item) => (
                  <NeedsOkCard key={item.milestoneId} item={item} />
                ))}
              </div>
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}
