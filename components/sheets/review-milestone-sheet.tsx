"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Sheet, inputClass } from "@/components/ui/sheet";
import { useReviewOutcome } from "@/lib/hooks/use-today";
import type { MilestoneDTO, MilestoneOutcome, TaskDTO } from "@/lib/types";

/**
 * The CEO's review of a milestone, from the box itself (owner, 2026-09-08 —
 * it used to be a card on Today). How many tasks are done, an optional line
 * for the team, then On track or Needs work. Whatever he writes shows on the
 * box for everyone who can see the project.
 */
export function ReviewMilestoneSheet({
  open,
  onClose,
  milestone,
  tasks,
  projectName,
}: {
  open: boolean;
  onClose: () => void;
  milestone: MilestoneDTO | null;
  tasks: TaskDTO[];
  projectName: string;
}) {
  const outcome = useReviewOutcome();
  const { show: toast } = useToast();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState<MilestoneOutcome | null>(null);

  useEffect(() => {
    if (open) setNote(milestone?.outcomeNote ?? "");
  }, [open, milestone]);

  const done = tasks.filter((t) => t.status === "DONE").length;
  const send = (choice: MilestoneOutcome) => {
    if (!milestone) return;
    setSending(choice);
    outcome.mutate(
      { milestoneId: milestone.id, outcome: choice, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast({ message: "Everyone on the project has been told" });
          onClose();
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
        onSettled: () => setSending(null),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Review"
      subtitle={milestone ? `${milestone.name} · ${projectName}` : undefined}
      footer={
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" onClick={() => send("ON_TRACK")} loading={sending === "ON_TRACK"} disabled={outcome.isPending}>
            On track
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => send("NEEDS_WORK")} loading={sending === "NEEDS_WORK"} disabled={outcome.isPending}>
            Needs work
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <p className="text-sm text-muted">
          {done} of {tasks.length} {tasks.length === 1 ? "task" : "tasks"} done in this milestone.
        </p>
        <label className="block">
          <span className="mb-1.5 block text-micro font-medium text-muted">A line for the team (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            placeholder="e.g. Good pace, keep going"
            aria-label="A line for the team"
            autoFocus
            className={inputClass}
          />
        </label>
      </div>
    </Sheet>
  );
}
