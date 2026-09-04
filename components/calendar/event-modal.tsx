"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { OverlayPortal } from "@/components/overlay-portal";
import { Select } from "@/components/select";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { useEventMutations } from "@/lib/hooks/use-calendar";
import type { CalendarEventDTO, ProjectDTO } from "@/lib/types";

const field =
  "h-10 w-full rounded-input border border-line bg-bg px-3 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary";

/** Manager-only. Create or edit a meeting. Global (all-hands) is the empty
    project value. Delete lives here in edit mode. */
export function EventModal({
  open,
  onClose,
  mode,
  event,
  defaultDate,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  event?: CalendarEventDTO;
  defaultDate: string; // YYYY-MM-DD
  projects: ProjectDTO[];
}) {
  const reduce = useReducedMotion();
  const { show: toast } = useToast();
  const { createEvent, updateEvent, deleteEvent } = useEventMutations();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [projectId, setProjectId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && event) {
      setTitle(event.title);
      setDescription(event.description);
      setDate(event.date.slice(0, 10));
      setProjectId(event.projectId ?? "");
    } else {
      setTitle("");
      setDescription("");
      setDate(defaultDate);
      setProjectId("");
    }
  }, [open, mode, event, defaultDate]);

  const ready = title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const pending = createEvent.isPending || updateEvent.isPending || deleteEvent.isPending;

  const submit = () => {
    if (!ready) return;
    const payload = { title: title.trim(), description: description.trim(), date, projectId: projectId || null };
    const onErr = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });
    if (mode === "edit" && event) {
      updateEvent.mutate(
        { id: event.id, patch: payload },
        { onSuccess: () => { toast({ message: "Event updated" }); onClose(); }, onError: onErr },
      );
    } else {
      createEvent.mutate(payload, {
        onSuccess: () => { toast({ message: "Event created" }); onClose(); },
        onError: onErr,
      });
    }
  };

  const remove = () => {
    if (!event) return;
    deleteEvent.mutate(event.id, {
      onSuccess: () => {
        toast({ message: `Deleted "${event.title}"` });
        onClose();
      },
      onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
    });
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
                aria-label={mode === "edit" ? "Edit event" : "New event"}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
                transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="pointer-events-auto flex max-h-[85dvh] w-[min(32rem,92vw)] flex-col overflow-hidden rounded-sheet bg-surface shadow-lift"
              >
                <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
                  <h2 className="flex-1 font-display text-section font-semibold text-ink">
                    {mode === "edit" ? "Edit event" : "New event"}
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
                  <Labeled label="Title">
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Sprint review, all-hands…"
                      aria-label="Event title"
                      className={field}
                      autoFocus
                    />
                  </Labeled>

                  <Labeled label="Details">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      placeholder="Optional — agenda, link, room…"
                      aria-label="Event description"
                      className="w-full resize-y rounded-input border border-line bg-bg p-3 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary"
                    />
                  </Labeled>

                  <div className="grid grid-cols-2 gap-3">
                    <Labeled label="Date">
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        aria-label="Event date"
                        className={field}
                      />
                    </Labeled>
                    <Labeled label="For">
                      <Select
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        aria-label="Event audience"
                        className="w-full"
                      >
                        <option value="">All-hands (everyone)</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </Labeled>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3">
                  {mode === "edit" ? (
                    <button
                      type="button"
                      onClick={remove}
                      disabled={pending}
                      className="press mr-auto flex h-9 items-center gap-1.5 rounded-card bg-danger-soft px-3 text-sm text-danger-ink disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                      Delete
                    </button>
                  ) : null}
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
                    disabled={!ready || pending}
                    className={cn(
                      "press flex h-9 items-center gap-1.5 rounded-card bg-primary px-3 text-sm font-medium text-on-primary disabled:opacity-40",
                    )}
                  >
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                    {mode === "edit" ? "Save" : "Create event"}
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

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-micro font-medium uppercase tracking-widest text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
