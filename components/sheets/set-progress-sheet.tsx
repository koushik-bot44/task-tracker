"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { useProjectMutations } from "@/lib/hooks/use-projects";
import type { ProjectDTO } from "@/lib/types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * The founder/director sets the project's % by hand. The hint shows how the
 * tasks are going, but the number is theirs to call.
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

  const submit = () => {
    if (updateProject.isPending) return;
    updateProject.mutate(
      { id: project.id, patch: { progress: clamp(value) } },
      {
        onSuccess: () => {
          onClose();
          toast({ message: `Progress set to ${clamp(value)}%` });
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Set progress"
      subtitle={project.name}
      footer={
        <Button variant="primary" full onClick={submit} loading={updateProject.isPending}>
          Save
        </Button>
      }
    >
      <div className="space-y-5 pt-1">
        <Field label="Progress" hint={total > 0 ? `${done} of ${total} tasks done` : "No tasks yet"}>
          <div className="flex items-center gap-3">
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
                  submit();
                }
              }}
              aria-label="Progress percent"
              autoFocus
              className={`${inputClass} w-24 text-center`}
            />
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
          aria-label="Progress slider"
          className="h-11 w-full accent-primary"
        />
        <div className="h-3 overflow-hidden rounded-full bg-hover" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out" style={{ width: `${clamp(value)}%` }} />
        </div>
      </div>
    </Sheet>
  );
}
