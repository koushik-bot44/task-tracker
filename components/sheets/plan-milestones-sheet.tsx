"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { apiPost } from "@/lib/api";
import { dateWord } from "@/lib/dates";
import { planDates, splitCounts } from "@/lib/plan";
import type { MilestoneDTO, ProjectDTO } from "@/lib/types";

type Count = "2" | "3" | "4" | "5" | "6";

/**
 * "Plan into milestones": how many boxes? — then the preview of how the tasks
 * split and when each review lands, then one button. The server does exactly
 * what the preview shows (both use lib/plan).
 */
export function PlanMilestonesSheet({
  open,
  onClose,
  project,
  looseCount,
  lastReviewDate,
}: {
  open: boolean;
  onClose: () => void;
  project: ProjectDTO;
  /** Tasks not in a milestone yet. */
  looseCount: number;
  /** The last box's review date, if any. */
  lastReviewDate: string | null;
}) {
  const qc = useQueryClient();
  const { show: toast } = useToast();
  const [count, setCount] = useState<Count>("3");

  useEffect(() => {
    if (open) setCount("3");
  }, [open]);

  const n = Math.min(Number(count), Math.max(1, looseCount));
  const sizes = useMemo(() => splitCounts(looseCount, n), [looseCount, n]);
  const dates = useMemo(
    () => planDates({ start: lastReviewDate ?? project.startDate ?? project.createdAt, end: project.deadline, count: n }),
    [lastReviewDate, project.startDate, project.createdAt, project.deadline, n],
  );

  const plan = useMutation({
    mutationFn: () => apiPost<MilestoneDTO[]>(`/api/projects/${project.id}/plan`, { count: n }),
    onSuccess: (rows) => {
      void qc.invalidateQueries({ queryKey: ["milestones"] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["calendar"] });
      void qc.invalidateQueries({ queryKey: ["today"] });
      onClose();
      toast({ message: `Planned ${rows.length === 1 ? "1 milestone" : `${n} milestones`} · reviews are on the calendar` });
    },
    onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Plan into milestones"
      subtitle={`${looseCount} ${looseCount === 1 ? "task" : "tasks"} not in a milestone yet`}
      footer={
        <Button variant="primary" full onClick={() => plan.mutate()} loading={plan.isPending} disabled={looseCount === 0}>
          Plan it
        </Button>
      }
    >
      <div className="space-y-5 pt-1">
        <div>
          <span className="mb-1.5 block text-micro font-medium text-muted">How many milestones?</span>
          <Segmented<Count>
            label="How many milestones"
            value={count}
            onChange={setCount}
            options={[
              { value: "2", label: "2" },
              { value: "3", label: "3" },
              { value: "4", label: "4" },
              { value: "5", label: "5" },
              { value: "6", label: "6" },
            ]}
          />
        </div>

        <ol className="space-y-2" aria-label="What you will get">
          {sizes.map((size, i) => (
            <li key={i} className="flex min-h-11 items-center gap-3 rounded-input bg-hover px-3">
              <span className="text-micro font-semibold uppercase tracking-[0.08em] text-muted">Milestone {i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {size} {size === 1 ? "task" : "tasks"}
              </span>
              <span className="text-sm text-muted">Review · {dateWord(dates[i].toISOString())}</span>
            </li>
          ))}
        </ol>

        <p className="text-sm text-muted">
          Each task takes its milestone&apos;s review date. Every review goes on the calendar as a meeting, and everyone invited gets a
          message the evening before.
        </p>
      </div>
    </Sheet>
  );
}
