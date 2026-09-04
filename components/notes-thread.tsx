"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { useState } from "react";
import { RoleChip } from "@/components/role-chip";
import { Tooltip } from "@/components/tooltip";
import { formatDMY } from "@/lib/dates";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useMe } from "@/lib/hooks/use-users";
import type { NoteDTO } from "@/lib/types";

const notesKey = (taskId: string) => ["notes", taskId] as const;

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDMY(iso);
}

/**
 * Plain text on purpose. Notes are conversation, not documentation — the
 * description field is where markdown belongs.
 */
export function NotesThread({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const { data: me } = useMe();
  const [draft, setDraft] = useState("");

  const { data: notes, isLoading } = useQuery({
    queryKey: notesKey(taskId),
    queryFn: () => apiGet<NoteDTO[]>(`/api/tasks/${taskId}/notes`),
  });

  const addNote = useMutation({
    mutationFn: (body: string) =>
      apiPost<NoteDTO>(`/api/tasks/${taskId}/notes`, { body }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: notesKey(taskId) });
      const previous = qc.getQueryData<NoteDTO[]>(notesKey(taskId)) ?? [];
      if (me) {
        const optimistic: NoteDTO = {
          id: `pending-${Date.now()}`,
          taskId,
          body,
          createdAt: new Date().toISOString(),
          author: { id: me.id, name: me.name, role: me.role },
        };
        qc.setQueryData<NoteDTO[]>(notesKey(taskId), [...previous, optimistic]);
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(notesKey(taskId), ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: notesKey(taskId) });
    },
  });

  const removeNote = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/notes/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: notesKey(taskId) });
      const previous = qc.getQueryData<NoteDTO[]>(notesKey(taskId)) ?? [];
      qc.setQueryData<NoteDTO[]>(
        notesKey(taskId),
        previous.filter((n) => n.id !== id),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(notesKey(taskId), ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: notesKey(taskId) });
    },
  });

  const submit = () => {
    const body = draft.trim();
    if (body.length === 0) return;
    setDraft("");
    addNote.mutate(body);
  };

  return (
    <div className="space-y-2">
      {isLoading ? (
        <div className="h-12 animate-pulse rounded-lg bg-hover" aria-hidden />
      ) : (notes ?? []).length === 0 ? (
        <p className="text-sm text-muted">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {(notes ?? []).map((note) => (
              <motion.li
                key={note.id}
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                transition={{ duration: reduce ? 0 : 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="group rounded-lg border border-line bg-bg p-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">
                    {note.author.name}
                  </span>
                  <RoleChip role={note.author.role} />
                  <span className="ml-auto shrink-0 text-micro text-muted">
                    {relativeTime(note.createdAt)}
                  </span>
                  {me?.id === note.author.id ? (
                    <Tooltip content="Delete your note">
                      <button
                        type="button"
                        onClick={() => removeNote.mutate(note.id)}
                        aria-label="Delete your note"
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-chip text-muted opacity-0 transition-opacity duration-150 ease-out focus-visible:opacity-100 group-hover:opacity-100 hover:text-danger"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      </button>
                    </Tooltip>
                  ) : null}
                </div>
                {/* Line breaks preserved; no markdown, so nothing is interpreted. */}
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">
                  {note.body}
                </p>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <div className="flex items-end gap-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder="Add a note…"
          aria-label="Add a note"
          className="min-w-0 flex-1 resize-y rounded-lg border border-line bg-bg p-2 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary"
        />
        <button
          type="button"
          onClick={submit}
          disabled={draft.trim().length === 0}
          className={cn(
            "h-9 shrink-0 rounded-lg bg-primary px-3 text-sm font-medium text-on-primary transition-opacity duration-150 ease-out hover:opacity-90 disabled:opacity-40",
          )}
        >
          {addNote.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            "Add"
          )}
        </button>
      </div>
    </div>
  );
}
