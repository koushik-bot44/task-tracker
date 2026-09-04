"use client";

import { Check } from "lucide-react";
import { useToast } from "@/components/toast";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useProjectMutations } from "@/lib/hooks/use-projects";
import { PROJECT_PRIORITY_CHOICES, PROJECT_PRIORITY_LABEL, type ProjectDTO } from "@/lib/types";

type Priority = (typeof PROJECT_PRIORITY_CHOICES)[number];

const MEANING: Record<Priority, string> = {
  HIGH: "Do first",
  MEDIUM: "Normal",
  LOW: "When there is time",
};

/**
 * Priority: three tall rows — P1 "Do first", P2 "Normal", P3 "When there is
 * time" — the current one ticked. Tapping one saves it straight away (the
 * list re-arranges itself), closes the sheet and says "Priority set to P1".
 */
export function PrioritySheet({ open, onClose, project }: { open: boolean; onClose: () => void; project: ProjectDTO }) {
  const { show: toast } = useToast();
  const { updateProject } = useProjectMutations();
  const current = PROJECT_PRIORITY_LABEL[project.priority];

  const pick = (priority: Priority) => {
    onClose();
    if (PROJECT_PRIORITY_LABEL[priority] === current) return;
    updateProject.mutate(
      { id: project.id, patch: { priority } },
      {
        onSuccess: () => toast({ message: `Priority set to ${PROJECT_PRIORITY_LABEL[priority]}` }),
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Priority" subtitle={project.name}>
      <div role="radiogroup" aria-label="Priority" className="-mx-1 pt-1">
        {PROJECT_PRIORITY_CHOICES.map((value) => {
          const active = PROJECT_PRIORITY_LABEL[value] === current;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => pick(value)}
              className={cn("press flex min-h-[64px] w-full items-center gap-3 rounded-card px-3 text-left", active && "bg-hover")}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-row font-semibold text-ink">{PROJECT_PRIORITY_LABEL[value]}</span>
                <span className="block text-sm text-muted">{MEANING[value]}</span>
              </span>
              {active ? <Check className="h-5 w-5 shrink-0 text-primary" strokeWidth={2.25} aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
