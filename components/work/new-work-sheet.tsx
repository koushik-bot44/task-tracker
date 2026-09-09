"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useGroups, useRaiseWork } from "@/lib/hooks/use-work";
import { useMe } from "@/lib/hooks/use-users";
import { WORK_PRIORITIES, WORK_PRIORITY_LABEL, WORK_TYPES, WORK_TYPE_LABEL, type WorkPriority, type WorkType } from "@/lib/types";

/**
 * Raise a task with no project: what, what kind, which team. Everything else
 * is under "More" so the two-tap path stays (owner: the simplest screen wins).
 */
export function NewWorkSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: groups } = useGroups(open);
  const { data: departments } = useDepartments();
  const raise = useRaiseWork();
  const { show: toast } = useToast();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<WorkType>("GENERAL");
  const [groupId, setGroupId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [more, setMore] = useState(false);
  const [describe, setDescribe] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<WorkPriority>("MEDIUM");

  const reset = () => {
    setTitle("");
    setType("GENERAL");
    setGroupId("");
    setDepartmentId("");
    setMore(false);
    setDescribe("");
    setDue("");
    setPriority("MEDIUM");
  };

  const submit = () => {
    const what = title.trim();
    if (!what) return;
    raise.mutate(
      {
        title: what,
        type,
        assignmentGroupId: groupId || null,
        departmentId: departmentId || undefined,
        descriptionMd: describe.trim(),
        dueDate: due ? new Date(`${due}T00:00:00`).toISOString() : null,
        priority,
      },
      {
        onSuccess: (t) => {
          reset();
          onClose();
          router.push(`/work/${t.number}`);
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
  };

  const types = WORK_TYPES.filter((t) => t !== "PROJECT_TASK");

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New task"
      footer={
        <Button variant="primary" full loading={raise.isPending} disabled={!title.trim()} onClick={submit}>
          Open it
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="What needs doing?">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="Laptop Wi-Fi is not working" aria-label="What needs doing" autoFocus className={inputClass} />
        </Field>
        <Field label="What kind of thing is it?">
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} aria-pressed={type === t} className={cn("press h-9 rounded-chip px-3 text-micro font-medium", type === t ? "bg-primary text-on-primary" : "bg-hover text-ink")}>
                {WORK_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </Field>
        {(groups ?? []).length ? (
          <Field label="Which team should look at it?" hint="Leave it and it goes to your own department.">
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputClass} aria-label="Team">
              <option value="">Not sure yet</option>
              {(groups ?? []).filter((g) => g.active).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.departmentName} · {g.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (departments ?? []).length ? (
          <Field label="Which department is it for?">
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={inputClass} aria-label="Department">
              <option value="">My own</option>
              {(departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {!more ? (
          <button type="button" onClick={() => setMore(true)} className="press text-sm font-medium text-primary-ink">
            More…
          </button>
        ) : (
          <>
            <Field label="Say more (optional)">
              <textarea value={describe} onChange={(e) => setDescribe(e.target.value)} rows={3} className={cn(inputClass, "h-auto py-2.5")} placeholder="What happens, since when, what you tried." />
            </Field>
            <Field label="By when (optional)">
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputClass} aria-label="By when" />
            </Field>
            <Field label="How urgent">
              <div className="flex flex-wrap gap-2">
                {WORK_PRIORITIES.map((p) => (
                  <button key={p} type="button" onClick={() => setPriority(p)} aria-pressed={priority === p} className={cn("press h-9 rounded-chip px-3 text-micro font-medium", priority === p ? "bg-primary text-on-primary" : "bg-hover text-ink")}>
                    {WORK_PRIORITY_LABEL[p]}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}
        {me ? <p className="text-micro text-muted">Asked for by {me.name}.</p> : null}
      </div>
    </Sheet>
  );
}
