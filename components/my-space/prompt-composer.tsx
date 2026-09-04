"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { OverlayPortal } from "@/components/overlay-portal";
import { Select } from "@/components/select";
import { useToast } from "@/components/toast";
import { usePrompt, type PersonalProjectDTO } from "@/lib/hooks/use-personal";

/**
 * The My Space "Prompt" composer (phase 33) — DEVELOPER-only (the button that
 * opens it is rendered only for developers, and the endpoint it posts to 403s
 * anyone else). A developer types whatever they want in one free-form box and
 * picks which of their personal projects it lands in; the server makes it a
 * private task (first line = title, the rest = notes). All caller-scoped.
 */
export function PromptComposer({
  open,
  onClose,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  projects: PersonalProjectDTO[];
}) {
  const reduce = useReducedMotion();
  const { show: toast } = useToast();
  const prompt = usePrompt();
  const [text, setText] = useState("");
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? "");

  useEffect(() => {
    if (open) {
      setText("");
      setProjectId((prev) => (projects.some((p) => p.id === prev) ? prev : projects[0]?.id ?? ""));
    }
  }, [open, projects]);

  const trimmed = text.trim();
  const ready = trimmed.length > 0 && projectId !== "" && !prompt.isPending;

  const submit = () => {
    if (!ready) return;
    prompt.mutate(
      { personalProjectId: projectId, text: trimmed },
      {
        onSuccess: () => {
          toast({ message: "Added to My Space" });
          onClose();
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
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
                aria-label="Write a prompt"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
                transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="pointer-events-auto flex max-h-[88dvh] w-[min(38rem,94vw)] flex-col overflow-hidden rounded-sheet bg-surface shadow-lift"
              >
                <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-card bg-primary-soft text-primary-ink">
                    <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-display text-section font-semibold text-ink">Prompt</h2>
                    <p className="truncate text-micro text-muted">
                      Write anything — the first line becomes the task, the rest its notes.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="press grid h-9 w-9 place-items-center rounded-card text-muted hover:text-ink"
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
                    }}
                    rows={7}
                    autoFocus
                    placeholder={"e.g.\nMailbox not working for hierarchy\nRepro: open a lead's inbox — child tasks don't appear. Check the notify recipients."}
                    aria-label="Prompt"
                    className="w-full resize-y rounded-input border border-line bg-bg p-3 text-sm leading-relaxed text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary"
                  />
                  <label className="block">
                    <span className="mb-1 block text-micro font-medium uppercase tracking-widest text-muted">
                      Project
                    </span>
                    {projects.length > 0 ? (
                      <Select
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        aria-label="Project"
                        className="w-full"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <p className="text-sm text-muted">
                        Create a department and a project first — a prompt has to land somewhere.
                      </p>
                    )}
                  </label>
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
                    {prompt.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                    Add to My Space
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
