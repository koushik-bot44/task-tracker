"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { dayInputValue } from "@/lib/dates";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useProjectMutations } from "@/lib/hooks/use-projects";
import { useMe, useUsers } from "@/lib/hooks/use-users";
import { canSeeUserListRole, isExecutiveRole, isHodRole } from "@/lib/roles";
import { PROJECT_PRIORITY_CHOICES, PROJECT_PRIORITY_LABEL, type UserDTO } from "@/lib/types";

/** Who may lead a project: an active work account. */
function canLead(u: UserDTO): boolean {
  return u.status === "ACTIVE" && !u.disabledAt && u.role !== "ADMIN" && u.role !== "PERSON";
}

/** A "YYYY-MM-DD" from a date input, as local midnight in ISO. */
function dayToIso(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

type Priority = (typeof PROJECT_PRIORITY_CHOICES)[number];

/**
 * New project: Name · Priority (P1 / P2 / P3, P2 unless said otherwise) ·
 * Lead · Start · Deadline, then Save. The department comes from the screen
 * that was tapped; without one (the empty page's button) the sheet asks for
 * it after the priority. On success: "Project started", and the new project
 * opens so people can be added there.
 */
export function NewProjectSheet({
  open,
  onClose,
  departmentId = null,
  departmentName,
}: {
  open: boolean;
  onClose: () => void;
  departmentId?: string | null;
  departmentName?: string;
}) {
  const router = useRouter();
  const { show: toast } = useToast();
  const { data: me } = useMe();
  const { data: users } = useUsers(open && canSeeUserListRole(me?.role));
  const { data: departments } = useDepartments();
  const { createProject } = useProjectMutations();

  const [name, setName] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [leadId, setLeadId] = useState("");
  const [start, setStart] = useState(() => dayInputValue(new Date()));
  const [deadline, setDeadline] = useState("");
  const [pickedDepartment, setPickedDepartment] = useState("");

  // Fresh every time it opens.
  useEffect(() => {
    if (!open) return;
    setName("");
    setPriority("MEDIUM");
    setLeadId("");
    setStart(dayInputValue(new Date()));
    setDeadline("");
    setPickedDepartment("");
  }, [open]);

  const leads = useMemo(
    () => (users ?? []).filter(canLead).sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  // Where this person may start a project (mirrors the server rule).
  const choices = useMemo(() => {
    const executive = isExecutiveRole(me?.role);
    const hod = isHodRole(me?.role);
    return (departments ?? []).filter((d) => executive || me?.role === "MANAGER" || (hod && d.hodId === me?.id));
  }, [departments, me]);

  const targetDepartment = departmentId ?? pickedDepartment;
  const ready = name.trim().length > 0 && targetDepartment.length > 0 && !createProject.isPending;

  const submit = () => {
    if (!ready) return;
    createProject.mutate(
      {
        name: name.trim(),
        departmentId: targetDepartment,
        priority,
        leadId: leadId || null,
        ...(start ? { startDate: dayToIso(start) } : {}),
        ...(deadline ? { deadline: dayToIso(deadline) } : {}),
      },
      {
        onSuccess: (project) => {
          onClose();
          toast({ message: "Project started" });
          router.push(`/project/${project.slug}`);
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New project"
      subtitle={departmentName}
      footer={
        <Button variant="primary" full onClick={submit} loading={createProject.isPending} disabled={!ready}>
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
            placeholder="e.g. New website"
            aria-label="Project name"
            autoFocus
            className={inputClass}
          />
        </Field>

        <div>
          <span id="new-project-priority" className="mb-1.5 block text-micro font-medium text-muted">
            Priority
          </span>
          <Segmented<Priority>
            label="Priority"
            value={priority}
            onChange={setPriority}
            options={PROJECT_PRIORITY_CHOICES.map((value) => ({ value, label: PROJECT_PRIORITY_LABEL[value] }))}
          />
        </div>

        {!departmentId ? (
          <Field label="Department">
            <select
              value={pickedDepartment}
              onChange={(e) => setPickedDepartment(e.target.value)}
              aria-label="Department"
              className={cn(inputClass, "appearance-none")}
            >
              <option value="">Pick a department…</option>
              {choices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

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
            <input
              type="date"
              value={deadline}
              min={start || undefined}
              onChange={(e) => setDeadline(e.target.value)}
              aria-label="Deadline"
              className={inputClass}
            />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}
