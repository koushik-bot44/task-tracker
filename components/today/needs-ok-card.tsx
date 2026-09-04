"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputClass } from "@/components/ui/sheet";
import { useReviewOutcome } from "@/lib/hooks/use-today";
import type { MilestoneOutcome, NeedsOkDTO } from "@/lib/types";

/**
 * "Needs your OK": a review whose day has come. The percentage is how many of
 * the project's tasks are done — worked out, never typed (owner, 2026-09-04).
 * Add a line if you like, then [On track] or [Needs work]. One card each.
 */
export function NeedsOkCard({ item }: { item: NeedsOkDTO }) {
  const outcome = useReviewOutcome();
  const { show: toast } = useToast();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState<MilestoneOutcome | null>(null);

  const send = (choice: MilestoneOutcome) => {
    setSending(choice);
    outcome.mutate(
      { milestoneId: item.milestoneId, outcome: choice, note: note.trim() || undefined },
      {
        onSuccess: () => toast({ message: "Sent to the project" }),
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
        onSettled: () => setSending(null),
      },
    );
  };

  const tasks = `${item.tasksDone} of ${item.tasksTotal} ${item.tasksTotal === 1 ? "task" : "tasks"}`;

  return (
    <Card as="article" className="p-4">
      <p className="text-row font-medium text-ink">
        {item.milestoneName} review · {item.projectName}
      </p>
      <p className="mt-0.5 text-sm text-muted">
        {item.progress}% of tasks done · {tasks}
      </p>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-micro font-medium text-muted">A line for the team (optional)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          placeholder="e.g. Good pace, keep going"
          className={inputClass}
        />
      </label>

      <div className="mt-4 flex gap-2">
        <Button variant="primary" className="flex-1" onClick={() => send("ON_TRACK")} loading={sending === "ON_TRACK"} disabled={outcome.isPending}>
          On track
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => send("NEEDS_WORK")} loading={sending === "NEEDS_WORK"} disabled={outcome.isPending}>
          Needs work
        </Button>
      </div>
    </Card>
  );
}
