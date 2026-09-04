"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { dayInputValue } from "@/lib/dates";
import { useMilestoneMutations } from "@/lib/hooks/use-milestones";
import type { MilestoneDTO } from "@/lib/types";

/**
 * Tap the date block on a box: move its review (the meeting follows), fix
 * the name, or — quietly, at the bottom — delete the milestone.
 */
export function MoveReviewSheet({
  open,
  onClose,
  projectId,
  milestone,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  milestone: MilestoneDTO | null;
}) {
  const { updateMilestone, deleteMilestone } = useMilestoneMutations(projectId);
  const { show: toast } = useToast();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (!open || !milestone) return;
    setName(milestone.name);
    setDate(dayInputValue(new Date(milestone.reviewDate)));
  }, [open, milestone]);

  const ready = Boolean(milestone) && name.trim().length > 0 && date.length > 0;
  const busy = updateMilestone.isPending || deleteMilestone.isPending;

  const submit = () => {
    if (!ready || !milestone || busy) return;
    const patch: { name?: string; reviewDate?: string } = {};
    if (name.trim() !== milestone.name) patch.name = name.trim();
    const nextIso = new Date(`${date}T00:00:00`).toISOString();
    if (dayInputValue(new Date(milestone.reviewDate)) !== date) patch.reviewDate = nextIso;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    updateMilestone.mutate(
      { id: milestone.id, patch },
      {
        onSuccess: () => {
          onClose();
          toast({ message: patch.reviewDate ? "Review moved · meeting moved too" : "Milestone renamed" });
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
  };

  const remove = () => {
    if (!milestone || busy) return;
    if (!window.confirm(`Delete "${milestone.name}"? Its tasks move to Not in a milestone yet.`)) return;
    deleteMilestone.mutate(milestone.id, {
      onSuccess: () => {
        onClose();
        toast({ message: "Milestone deleted · its tasks are in Not in a milestone yet" });
      },
      onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Move the review"
      subtitle={milestone?.name}
      footer={
        <Button variant="primary" full onClick={submit} loading={updateMilestone.isPending} disabled={!ready || busy}>
          Save
        </Button>
      }
    >
      <div className="space-y-5 pt-1">
        <Field label="Review date" hint="This moves the review meeting too.">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Review date" autoFocus className={inputClass} />
        </Field>
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
            aria-label="Milestone name"
            maxLength={120}
            className={inputClass}
          />
        </Field>
        <div className="pt-2">
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="press h-11 rounded-input px-2 text-sm font-medium text-danger-ink disabled:opacity-40"
          >
            Delete milestone
          </button>
        </div>
      </div>
    </Sheet>
  );
}
