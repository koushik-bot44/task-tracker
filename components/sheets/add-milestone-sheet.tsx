"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { dayInputValue, dateWord, longDate, startOfDay } from "@/lib/dates";
import { useMilestoneMutations } from "@/lib/hooks/use-milestones";

/**
 * "+ Add milestone": Name · Review date. Saving it also creates the review
 * meeting, which the toast says out loud.
 */
export function AddMilestoneSheet({
  open,
  onClose,
  projectId,
  previousReviewDate,
  startDate,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** The review date of the last box, so the new one starts after it. */
  previousReviewDate: string | null;
  startDate: string | null;
}) {
  const { addMilestone } = useMilestoneMutations(projectId);
  const { show: toast } = useToast();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setDate("");
  }, [open]);

  const after = previousReviewDate ? new Date(previousReviewDate) : startDate ? new Date(startDate) : new Date();
  const minDay = startOfDay(after);
  minDay.setDate(minDay.getDate() + 1);
  const startsAfter = previousReviewDate ? dateWord(previousReviewDate) : startDate ? `the project start, ${longDate(startDate)}` : "today";

  const ready = name.trim().length > 0 && date.length > 0;

  const submit = () => {
    if (!ready || addMilestone.isPending) return;
    addMilestone.mutate(
      { name: name.trim(), reviewDate: new Date(`${date}T00:00:00`).toISOString() },
      {
        onSuccess: () => {
          onClose();
          toast({ message: "Milestone added · review meeting created" });
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add milestone"
      footer={
        <Button variant="primary" full onClick={submit} loading={addMilestone.isPending} disabled={!ready}>
          Save
        </Button>
      }
    >
      <div className="space-y-5 pt-1">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="e.g. Development"
            aria-label="Milestone name"
            autoFocus
            maxLength={120}
            className={inputClass}
          />
        </Field>
        <Field label="Review date" hint="The review meeting is booked for this day.">
          <input type="date" value={date} min={dayInputValue(minDay)} onChange={(e) => setDate(e.target.value)} aria-label="Review date" className={inputClass} />
        </Field>
        <p className="text-sm text-muted">Starts after {startsAfter}</p>
      </div>
    </Sheet>
  );
}
