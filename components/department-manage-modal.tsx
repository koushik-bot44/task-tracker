"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { OverlayPortal } from "@/components/overlay-portal";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { useDepartmentMutations } from "@/lib/hooks/use-departments";
import { DEPARTMENT_COLORS, type DepartmentDTO } from "@/lib/types";

const fieldClass =
  "h-10 w-full rounded-input border border-line bg-bg px-3 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary";

/**
 * Create or edit a department (phase 12). Manager-only — the caller only mounts it
 * for a manager, and the API refuses anyone else. `department` present = edit.
 */
export function DepartmentManageModal({
  open,
  department,
  onClose,
  onCreated,
}: {
  open: boolean;
  department?: DepartmentDTO | null;
  onClose: () => void;
  /** Called with the new department after a successful create (edit passes nothing). */
  onCreated?: (department: DepartmentDTO) => void;
}) {
  const reduce = useReducedMotion();
  const { show: toast } = useToast();
  const { createDepartment, updateDepartment } = useDepartmentMutations();
  const editing = Boolean(department);

  const [name, setName] = useState(department?.name ?? "");
  const [color, setColor] = useState(department?.color ?? DEPARTMENT_COLORS[0]);
  const [icon, setIcon] = useState(department?.icon ?? "");

  // Re-seed when the modal opens for a different department (or for a fresh create).
  useEffect(() => {
    if (open) {
      setName(department?.name ?? "");
      setColor(department?.color ?? DEPARTMENT_COLORS[0]);
      setIcon(department?.icon ?? "");
    }
  }, [open, department]);

  const pending = createDepartment.isPending || updateDepartment.isPending;
  const ready = name.trim().length > 0 && !pending;

  const submit = () => {
    if (!ready) return;
    const payload = { name: name.trim(), color, icon: icon.trim() || null };
    if (editing && department) {
      updateDepartment.mutate(
        { id: department.id, patch: payload },
        { onSuccess: () => onClose(), onError: (e) => toast({ message: (e as Error).message, tone: "danger" }) },
      );
    } else {
      createDepartment.mutate(payload, {
        onSuccess: (created) => {
          onCreated?.(created);
          onClose();
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      });
    }
  };

  return (
    <OverlayPortal>
      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.16 }}
              onClick={onClose}
              className="fixed inset-0 z-drawer bg-black/45"
              aria-hidden
            />
            <div className="pointer-events-none fixed inset-0 z-drawer grid place-items-center p-4">
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label={editing ? "Edit department" : "New department"
                }
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
                transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="pointer-events-auto flex max-h-[85dvh] w-[min(28rem,92vw)] flex-col overflow-hidden rounded-sheet bg-surface shadow-lift"
              >
                <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
                  <h2 className="flex-1 font-display text-section font-semibold text-ink">
                    {editing ? "Edit department" : "New department"}
                  </h2>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="press grid h-9 w-9 place-items-center rounded-card text-muted hover:text-ink"
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
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
                      placeholder="e.g. Backend, Growth, Platform"
                      aria-label="Department name"
                      className={fieldClass}
                      autoFocus
                    />
                  </Field>

                  <Field label="Icon (optional)">
                    <input
                      value={icon}
                      onChange={(e) => setIcon(e.target.value)}
                      placeholder="An emoji, e.g. 🚀"
                      aria-label="Department icon"
                      maxLength={8}
                      className={fieldClass}
                    />
                  </Field>

                  <Field label="Colour">
                    <div className="flex flex-wrap gap-1.5">
                      {DEPARTMENT_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColor(c)}
                          aria-label={`Colour ${c}`}
                          aria-pressed={color === c}
                          className={cn(
                            "h-7 w-7 rounded-full transition-transform duration-150 ease-out",
                            color === c && "ring-2 ring-primary ring-offset-2 ring-offset-surface",
                          )}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </Field>
                </div>

                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-4 py-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="press h-9 rounded-card px-3 text-sm text-muted hover:text-ink"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!ready}
                    className="press flex h-9 items-center gap-1.5 rounded-card bg-primary px-3 text-sm font-medium text-on-primary disabled:opacity-40"
                  >
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                    {editing ? "Save" : "Create department"}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        ) : null}
      </AnimatePresence>
    </OverlayPortal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-micro font-medium uppercase tracking-widest text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
