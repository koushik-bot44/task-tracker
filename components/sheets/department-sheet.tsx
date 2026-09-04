"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { useDepartmentMutations, useDepartments } from "@/lib/hooks/use-departments";
import { useMe, useUsers } from "@/lib/hooks/use-users";
import { canSeeUserListRole, isExecutiveRole, isHodRole } from "@/lib/roles";
import { DEPARTMENT_COLORS, type DepartmentDTO } from "@/lib/types";

/**
 * A department: Name · What it does · Head of department. Without a
 * `department` it creates one (founder/director only); with one it edits.
 * A head of department editing their own department sees only "What it
 * does" — the same rule the server enforces.
 */
export function DepartmentSheet({
  open,
  onClose,
  department = null,
}: {
  open: boolean;
  onClose: () => void;
  department?: DepartmentDTO | null;
}) {
  const { show: toast } = useToast();
  const { data: me } = useMe();
  const { data: users } = useUsers(open && canSeeUserListRole(me?.role));
  const { data: departments } = useDepartments();
  const { createDepartment, updateDepartment } = useDepartmentMutations();

  const executive = isExecutiveRole(me?.role);
  const headsIt = isHodRole(me?.role) && Boolean(department) && department?.hodId === me?.id;
  const descriptionOnly = !executive && headsIt;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hodId, setHodId] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(department?.name ?? "");
    setDescription(department?.description ?? "");
    setHodId(department?.hodId ?? "");
  }, [open, department]);

  const heads = useMemo(
    () =>
      (users ?? [])
        .filter((u) => u.role === "HOD" && u.status === "ACTIVE" && !u.disabledAt)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );
  // Keep the current head selectable even before the people list arrives.
  const currentHeadMissing = Boolean(hodId) && !heads.some((h) => h.id === hodId);

  const pending = createDepartment.isPending || updateDepartment.isPending;
  const ready = (descriptionOnly || name.trim().length > 0) && !pending;

  const submit = () => {
    if (!ready) return;
    const done = () => {
      onClose();
      toast({ message: department ? "Saved" : "Department added" });
    };
    const fail = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });

    if (department) {
      const patch = descriptionOnly
        ? { description: description.trim() }
        : { name: name.trim(), description: description.trim(), hodId: hodId || null };
      updateDepartment.mutate({ id: department.id, patch }, { onSuccess: done, onError: fail });
      return;
    }
    const n = departments?.length ?? 0;
    createDepartment.mutate(
      {
        name: name.trim(),
        color: DEPARTMENT_COLORS[n % DEPARTMENT_COLORS.length],
        description: description.trim(),
        hodId: hodId || null,
      },
      { onSuccess: done, onError: fail },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={department ? "Edit department" : "New department"}
      subtitle={department?.name}
      footer={
        <Button variant="primary" full onClick={submit} loading={pending} disabled={!ready}>
          Save
        </Button>
      }
    >
      <div className="space-y-5 pt-1">
        {!descriptionOnly ? (
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
              placeholder="e.g. Marketing"
              aria-label="Department name"
              autoFocus
              className={inputClass}
            />
          </Field>
        ) : null}

        <Field label="What it does">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="One or two lines, in plain words"
            aria-label="What it does"
            autoFocus={descriptionOnly}
            className={cn(inputClass, "h-auto min-h-[88px] resize-none py-2.5")}
          />
        </Field>

        {!descriptionOnly ? (
          <Field label="Head of department">
            <select value={hodId} onChange={(e) => setHodId(e.target.value)} aria-label="Head of department" className={cn(inputClass, "appearance-none")}>
              <option value="">No head yet</option>
              {currentHeadMissing ? <option value={hodId}>{department?.hodName ?? "Current head"}</option> : null}
              {heads.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
    </Sheet>
  );
}
