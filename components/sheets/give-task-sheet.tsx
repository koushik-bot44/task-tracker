"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Face } from "@/components/ui/face";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { dayInputValue, dateWord, isoDaysFromNow, startOfDay } from "@/lib/dates";
import { useMilestones } from "@/lib/hooks/use-milestones";
import { usePanelParams } from "@/lib/hooks/use-panel";
import { useProjectPeople, useProjects } from "@/lib/hooks/use-projects";
import { newTaskId, useTaskMutations, useTasks } from "@/lib/hooks/use-tasks";
import { useMe } from "@/lib/hooks/use-users";
import { keyAtEnd } from "@/lib/order";
import type { TaskDTO } from "@/lib/types";

type DateChoice = "today" | "tomorrow" | "review" | "pick";

/**
 * Give a task: "What needs doing?" · "Who?" (faces, you first) · "By when?"
 * (the box's review date by default; Today / Tomorrow / Pick). Save → toast
 * "Sent to <name>" → "Add steps?". Three taps when opened from a box.
 * Opened from Today's + it first asks which project, then which box.
 */
export function GiveTaskSheet({
  open,
  onClose,
  projectId: presetProjectId = null,
  milestoneId: presetMilestoneId = null,
  reviewDate = null,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string | null;
  milestoneId?: string | null;
  /** The box's review date (ISO) — the default "By when?". */
  reviewDate?: string | null;
  onCreated?: (task: TaskDTO) => void;
}) {
  const { data: me } = useMe();
  const { data: projects } = useProjects();
  const { show: toast } = useToast();
  const { openTask } = usePanelParams();

  const [projectId, setProjectId] = useState<string | null>(presetProjectId);
  const [milestoneId, setMilestoneId] = useState<string | null>(presetMilestoneId);
  const [title, setTitle] = useState("");
  const [who, setWho] = useState<string | null>(null);
  const [choice, setChoice] = useState<DateChoice>("review");
  const [picked, setPicked] = useState("");

  const { data: people, isLoading: loadingPeople } = useProjectPeople(projectId, open);
  const { data: milestones } = useMilestones(open ? projectId : null);
  const { data: tasks } = useTasks(open ? projectId : null);
  const { createTask } = useTaskMutations({ kind: "project", projectId: projectId ?? "" });

  // Fresh every time it opens; the presets win.
  useEffect(() => {
    if (!open) return;
    setProjectId(presetProjectId);
    setMilestoneId(presetMilestoneId);
    setTitle("");
    setWho(null);
    setChoice(presetMilestoneId || reviewDate ? "review" : "tomorrow");
    setPicked("");
  }, [open, presetProjectId, presetMilestoneId, reviewDate]);

  const milestone = useMemo(() => (milestones ?? []).find((m) => m.id === milestoneId) ?? null, [milestones, milestoneId]);
  const boxDate = reviewDate ?? milestone?.reviewDate ?? null;
  const faces = useMemo(() => {
    const list = people ?? [];
    const meFirst = me ? [...list].sort((a, b) => Number(b.id === me.id) - Number(a.id === me.id)) : list;
    // You can always give a task to yourself, even before you're listed.
    if (me && !meFirst.some((p) => p.id === me.id) && me.role !== "ADMIN") {
      return [{ id: me.id, name: me.name, role: me.role, isLead: false, isOwner: false, isMember: false, canManage: false, taskCount: 0 }, ...meFirst];
    }
    return meFirst;
  }, [people, me]);

  useEffect(() => {
    if (open && who === null && me) setWho(me.id);
  }, [open, who, me]);

  const dueIso = (): string | null => {
    if (choice === "today") return isoDaysFromNow(0);
    if (choice === "tomorrow") return isoDaysFromNow(1);
    if (choice === "review") return boxDate ? startOfDay(new Date(boxDate)).toISOString() : isoDaysFromNow(1);
    if (picked) return new Date(`${picked}T00:00:00`).toISOString();
    return null;
  };

  const ready = Boolean(projectId) && title.trim().length > 0 && Boolean(who) && (choice !== "pick" || Boolean(picked));

  const submit = () => {
    if (!ready || !projectId) return;
    const id = newTaskId();
    const whoName = faces.find((p) => p.id === who)?.name ?? "them";
    createTask.mutate(
      {
        id,
        parentId: null,
        orderKey: keyAtEnd(tasks ?? [], null),
        title: title.trim(),
        dueDate: dueIso(),
        dueProvisional: choice === "review",
        assigneeId: who,
        milestoneId,
      },
      {
        onSuccess: (task) => {
          onClose();
          onCreated?.(task);
          toast({
            message: who === me?.id ? "Added to your list" : `Sent to ${whoName}`,
            action: { label: "Add steps?", onAction: () => openTask(task.id) },
          });
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
  };

  const projectName = (projects ?? []).find((p) => p.id === projectId)?.name;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Give a task"
      subtitle={projectName ? `${projectName}${milestone ? ` · ${milestone.name}` : ""}` : undefined}
      footer={
        <Button variant="primary" full onClick={submit} loading={createTask.isPending} disabled={!ready}>
          Save
        </Button>
      }
    >
      <div className="space-y-5 pt-1">
        {!presetProjectId ? (
          <Field label="Which project?">
            <select value={projectId ?? ""} onChange={(e) => { setProjectId(e.target.value || null); setMilestoneId(null); }} aria-label="Project" className={cn(inputClass, "appearance-none")}>
              <option value="">Pick a project…</option>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {!presetMilestoneId && projectId && (milestones ?? []).length > 0 ? (
          <Field label="Which milestone?">
            <select value={milestoneId ?? ""} onChange={(e) => setMilestoneId(e.target.value || null)} aria-label="Milestone" className={cn(inputClass, "appearance-none")}>
              <option value="">Not in a milestone yet</option>
              {(milestones ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {dateWord(m.reviewDate)}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="What needs doing?">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="e.g. Build the login page"
            aria-label="What needs doing"
            autoFocus
            className={inputClass}
          />
        </Field>

        <div>
          <span className="mb-1.5 block text-micro font-medium text-muted">Who?</span>
          {loadingPeople && faces.length === 0 ? (
            <div className="h-14 animate-pulse rounded-card bg-hover" aria-hidden />
          ) : (
            <div role="radiogroup" aria-label="Who" className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {faces.map((p) => {
                const active = who === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setWho(p.id)}
                    className={cn(
                      "press flex w-[72px] shrink-0 flex-col items-center gap-1 rounded-card px-1 py-2",
                      active ? "bg-primary-soft ring-2 ring-primary" : "bg-hover",
                    )}
                  >
                    <Face name={p.name} size="lg" />
                    <span className="w-full truncate text-center text-micro font-medium text-ink">{p.id === me?.id ? "Me" : p.name.split(" ")[0]}</span>
                  </button>
                );
              })}
              {faces.length === 0 ? <p className="text-sm text-muted">Nobody is on this project yet.</p> : null}
            </div>
          )}
        </div>

        <div>
          <span className="mb-1.5 block text-micro font-medium text-muted">By when?</span>
          <div role="radiogroup" aria-label="By when" className="flex flex-wrap gap-2">
            {boxDate ? <DateOption active={choice === "review"} onClick={() => setChoice("review")} label={`Review · ${dateWord(boxDate)}`} /> : null}
            <DateOption active={choice === "today"} onClick={() => setChoice("today")} label="Today" />
            <DateOption active={choice === "tomorrow"} onClick={() => setChoice("tomorrow")} label="Tomorrow" />
            <DateOption active={choice === "pick"} onClick={() => setChoice("pick")} label="Pick a day" />
          </div>
          {choice === "pick" ? (
            <input type="date" value={picked} min={dayInputValue(new Date())} onChange={(e) => setPicked(e.target.value)} aria-label="Pick a day" className={cn(inputClass, "mt-2")} />
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}

function DateOption({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn("press h-11 rounded-chip px-4 text-sm font-medium", active ? "bg-primary text-on-primary" : "bg-hover text-ink")}
    >
      {label}
    </button>
  );
}
