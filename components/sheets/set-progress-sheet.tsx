"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { useProjectMutations } from "@/lib/hooks/use-projects";
import type { ProjectDTO } from "@/lib/types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * The CEO's own number (owner, 2026-09-04): "How far along?" as a number and
 * a slider. Orbit keeps counting the tasks underneath and says what the count
 * would be; "Count the tasks instead" hands the number back to the count.
 */
export function SetProgressSheet({
  open,
  onClose,
  project,
  done,
  total,
}: {
  open: boolean;
  onClose: () => void;
  project: ProjectDTO;
  /** Root tasks done / in total, for the hint. */
  done: number;
  total: number;
}) {
  const { updateProject } = useProjectMutations();
  const { show: toast } = useToast();
  const [value, setValue] = useState(clamp(project.progress));

  useEffect(() => {
    if (open) setValue(clamp(project.progress));
  }, [open, project.progress]);

  const counted = project.status === "DONE" ? 100 : total === 0 ? 0 : Math.round((done / total) * 100);

  const save = (progress: number | null) => {
    if (updateProject.isPending) return;
    updateProject.mutate(
      { id: project.id, patch: { progress } },
      {
        onSuccess: () => {
          onClose();
          toast({ message: progress === null ? `Counting the tasks again · ${counted}%` : `Set to ${progress}%` });
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="How far along?"
      subtitle={project.name}
      footer={
        <Button variant="primary" full onClick={() => save(clamp(value))} loading={updateProject.isPending}>
          Save
        </Button>
      }
    >
      <div className="space-y-5 pt-1">
        <Field label="Your number" hint={total > 0 ? `Counting the tasks says ${counted}% · ${done} of ${total} done` : "No tasks yet"}>
          <div className="flex items-center gap-3">
            <div className="w-24">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={value}
                onChange={(e) => setValue(clamp(Number(e.target.value) || 0))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    save(clamp(value));
                  }
                }}
                aria-label="Percent done"
                autoFocus
                className={`${inputClass} text-center`}
              />
            </div>
            <span className="text-row text-muted">%</span>
          </div>
        </Field>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value}
          onChange={(e) => setValue(clamp(Number(e.target.value)))}
          aria-label="Percent done slider"
          className="h-11 w-full accent-primary"
        />
        <div className="h-3 overflow-hidden rounded-full bg-hover" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out" style={{ width: `${clamp(value)}%` }} />
        </div>
        {project.progressManual !== null ? (
          <Button variant="secondary" full onClick={() => save(null)} disabled={updateProject.isPending}>
            Count the tasks instead ({counted}%)
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
