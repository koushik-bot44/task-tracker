"use client";

import { useId, useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputClass } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useReviewOutcome } from "@/lib/hooks/use-today";
import type { MilestoneOutcome, NeedsOkDTO } from "@/lib/types";

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

/**
 * "Needs your OK": a review whose day has come. Say how far along the project
 * is, add a line if you like, then [On track] or [Needs work]. One card each.
 */
export function NeedsOkCard({ item }: { item: NeedsOkDTO }) {
  const outcome = useReviewOutcome();
  const { show: toast } = useToast();
  const id = useId();
  const [progress, setProgress] = useState(item.progress);
  const [draft, setDraft] = useState(String(item.progress));
  const [note, setNote] = useState("");
  const [sending, setSending] = useState<MilestoneOutcome | null>(null);

  const setBoth = (n: number) => {
    const v = clamp(n);
    setProgress(v);
    setDraft(String(v));
  };

  const send = (choice: MilestoneOutcome) => {
    setSending(choice);
    outcome.mutate(
      { milestoneId: item.milestoneId, outcome: choice, note: note.trim() || undefined, progress },
      {
        onSuccess: () => toast({ message: "Sent to the project" }),
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
        onSettled: () => setSending(null),
      },
    );
  };

  const done =
    item.tasksTotal === 0 ? "No tasks in it yet." : `${item.tasksDone} of ${item.tasksTotal} ${item.tasksTotal === 1 ? "task" : "tasks"} done.`;

  return (
    <Card as="article" className="p-4">
      <p className="text-row font-medium text-ink">
        {item.milestoneName} review · {item.projectName}
      </p>
      <p className="mt-0.5 text-sm text-muted">
        You set {item.progress}%. {done}
      </p>

      <div className="mt-4">
        <label htmlFor={`${id}-number`} className="mb-1.5 block text-micro font-medium text-muted">
          How far along?
        </label>
        <div className="flex items-center gap-3">
          {/* inputClass is full-width; the box around it sets the real width. */}
          <div className="w-24 shrink-0">
            <input
              id={`${id}-number`}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                const n = Number(e.target.value);
                if (e.target.value !== "" && Number.isFinite(n)) setProgress(clamp(n));
              }}
              onBlur={() => setDraft(String(progress))}
              className={cn(inputClass, "text-center tabular-nums")}
            />
          </div>
          <span className="text-sm text-muted" aria-hidden>
            %
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={progress}
            onChange={(e) => setBoth(Number(e.target.value))}
            aria-label="How far along?"
            className="h-11 min-w-0 flex-1 accent-[var(--primary)]"
          />
        </div>
      </div>

      <label className="mt-3 block">
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
