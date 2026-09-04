"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { dayInputValue } from "@/lib/dates";
import { useProjectMutations } from "@/lib/hooks/use-projects";
import { useMe, useUsers } from "@/lib/hooks/use-users";
import { canSeeUserListRole } from "@/lib/roles";
import type { ProjectDTO, ProjectPersonDTO, UserDTO } from "@/lib/types";

/** Who may lead a project: an active work account (the same rule as New project). */
function canLead(u: { status: string; disabledAt: string | null; role: string }): boolean {
  return u.status === "ACTIVE" && !u.disabledAt && u.role !== "ADMIN" && u.role !== "PERSON";
}

/** A "YYYY-MM-DD" from a date input, as local midnight in ISO. */
function dayToIso(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

/**
 * Project details (owner, 2026-09-04: "we set the deadline when creating the
 * project — make sure we can change that too"). The same fields as New
 * project — Name · Lead · Start · Deadline — plus Finished, and a way to
 * delete the project for the people who run it.
 */
export function ProjectDetailsSheet({
  open,
  onClose,
  project,
  people,
}: {
  open: boolean;
  onClose: () => void;
  project: ProjectDTO;
  people: ProjectPersonDTO[];
}) {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: users } = useUsers(open && canSeeUserListRole(me?.role));
  const { updateProject, deleteProject } = useProjectMutations();
  const { show: toast } = useToast();

  const [name, setName] = useState(project.name);
  const [leadId, setLeadId] = useState(project.leadId ?? "");
  const [start, setStart] = useState(project.startDate ? dayInputValue(new Date(project.startDate)) : "");
  const [deadline, setDeadline] = useState(project.deadline ? dayInputValue(new Date(project.deadline)) : "");
  const [finished, setFinished] = useState(project.status === "DONE");

  useEffect(() => {
    if (!open) return;
    setName(project.name);
    setLeadId(project.leadId ?? "");
    setStart(project.startDate ? dayInputValue(new Date(project.startDate)) : "");
    setDeadline(project.deadline ? dayInputValue(new Date(project.deadline)) : "");
    setFinished(project.status === "DONE");
  }, [open, project]);

  // Lead candidates: everyone this person may see, else the people already on the project.
  const leads = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const p of people) if (canLead({ status: "ACTIVE", disabledAt: null, role: p.role })) seen.set(p.id, { id: p.id, name: p.name });
    for (const u of (users ?? []) as UserDTO[]) if (canLead(u)) seen.set(u.id, { id: u.id, name: u.name });
    if (project.leadId && project.leadName && !seen.has(project.leadId)) seen.set(project.leadId, { id: project.leadId, name: project.leadName });
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [people, users, project.leadId, project.leadName]);

  const ready = name.trim().length > 0 && !updateProject.isPending && !deleteProject.isPending;

  const submit = () => {
    if (!ready) return;
    updateProject.mutate(
      {
        id: project.id,
        patch: {
          name: name.trim(),
          leadId: leadId || null,
          startDate: start ? dayToIso(start) : null,
          deadline: deadline ? dayToIso(deadline) : null,
          status: finished ? "DONE" : project.status === "DONE" ? "ACTIVE" : project.status,
        },
      },
      {
        onSuccess: () => {
          onClose();
          toast({ message: "Project updated" });
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
  };

  const remove = () => {
    if (!window.confirm(`Delete "${project.name}"? Its milestones, tasks, notes and meetings go with it. This cannot be undone.`)) return;
    deleteProject.mutate(project.id, {
      onSuccess: () => {
        onClose();
        toast({ message: `Deleted "${project.name}"` });
        router.push(project.departmentId ? `/projects?d=${encodeURIComponent(project.departmentId)}` : "/projects");
      },
      onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Project details"
      subtitle={project.name}
      footer={
        <Button variant="primary" full onClick={submit} loading={updateProject.isPending} disabled={!ready}>
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
            aria-label="Project name"
            className={inputClass}
          />
        </Field>

        <Field label="Lead">
          <select value={leadId} onChange={(e) => setLeadId(e.target.value)} aria-label="Lead" className={cn(inputClass, "appearance-none")}>
            <option value="">No lead yet</option>
            {leads.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start" className={inputClass} />
          </Field>
          <Field label="Deadline" hint="Optional">
            <input type="date" value={deadline} min={start || undefined} onChange={(e) => setDeadline(e.target.value)} aria-label="Deadline" className={inputClass} />
          </Field>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={finished}
          onClick={() => setFinished((v) => !v)}
          className="press flex min-h-[56px] w-full items-center gap-3 rounded-card bg-hover px-4 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-row text-ink">Finished</span>
            <span className="block text-sm text-muted">{finished ? "Sits at the bottom of the list, reads 100%." : "Still going."}</span>
          </span>
          <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150", finished ? "bg-ok" : "bg-line")} aria-hidden>
            <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-surface transition-transform duration-150", finished ? "translate-x-[22px]" : "translate-x-0.5")} />
          </span>
        </button>

        <div className="pt-1">
          <button
            type="button"
            onClick={remove}
            disabled={deleteProject.isPending}
            className="press h-11 rounded-input px-2 text-sm font-medium text-danger-ink disabled:opacity-40"
          >
            Delete project
          </button>
        </div>
      </div>
    </Sheet>
  );
}
