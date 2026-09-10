"use client";

import { ChevronDown, Loader2, Paperclip, Pin, PinOff } from "lucide-react";
import { useRef, useState } from "react";
import { PendingFileChips, usePendingFiles } from "@/components/notes/pending-files";
import { useToast } from "@/components/toast";
import { apiPatch, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { ActivityDTO } from "@/lib/types";
import type { Attached } from "./attachment-viewer";
import { snButton, snInput, snPrimary } from "./sn";

/** "12 Sep, 14:30" — the same stamp the stream uses. */
function stamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * A task's files, away from the chat.
 *
 * Files can be added here with the words that explain them, instead of being
 * buried in a note — several at once (2026-09-10); the important ones are
 * pinned to the top. A row shows only its file names until you point at it (or
 * open it on a phone), and then it lays out the description underneath — so a
 * list of ten stays a list, and the detail is one movement away. A name opens
 * the file beside the page.
 */
export function TaskFiles({
  taskId,
  files,
  canPin,
  onOpen,
  onChanged,
}: {
  taskId: string;
  files: ActivityDTO[];
  canPin: boolean;
  onOpen: (files: Attached[], index: number) => void;
  onChanged: () => void;
}) {
  const { show: toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const picked = usePendingFiles();
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const fail = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });

  const add = async () => {
    const ready = picked.ready;
    if (!ready.length || picked.uploading) return;
    setBusy(true);
    try {
      await apiPost(`/api/tasks/${taskId}/attachments`, { body: description.trim(), attachments: ready });
      picked.clear();
      setDescription("");
      onChanged();
      toast({ message: ready.length > 1 ? "Files added" : "File added" });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const pin = async (id: string, pinned: boolean) => {
    try {
      await apiPatch(`/api/tasks/${taskId}/attachments/${id}`, { pinned });
      onChanged();
    } catch (e) {
      fail(e);
    }
  };

  // Pinned first, newest next — the order somebody curated, then time.
  const rows = [...files].sort((a, b) => {
    if (Boolean(a.pinnedAt) !== Boolean(b.pinnedAt)) return a.pinnedAt ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return (
    <div className="space-y-3">
      {/* Always offered (2026-09-10): without a Blob store, files go to the database. */}
      <div className="space-y-2 rounded-input border border-line p-3">
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const leftOut = picked.add(e.target.files);
            if (leftOut) fail(new Error(leftOut));
            e.target.value = "";
          }}
        />
        {picked.items.length ? (
          <>
            <PendingFileChips items={picked.items} onRemove={picked.remove} onRetry={picked.retry} />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What are these files? Requirements, what to look at, what is expected."
              aria-label="Description for this file"
              className={cn(snInput, "h-auto py-2")}
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void add()} disabled={busy || picked.uploading || !picked.ready.length} className={snPrimary}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                {picked.items.length > 1 ? "Add the files" : "Add the file"}
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} className={snButton}>
                Add another
              </button>
              <button type="button" onClick={() => { picked.clear(); setDescription(""); }} className={snButton}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className={cn(snButton, "gap-1")}>
            <Paperclip className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Attach a file with its description
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-[13px] text-muted">No files yet. Attach some here with what they are, or send them in a note.</p>
      ) : (
        <ul className="divide-y divide-line rounded-input border border-line">
          {rows.map((a) => {
            const showing = open === a.id || hover === a.id;
            const first = a.attachments[0]?.name ?? "this file";
            return (
              <li
                key={a.id}
                onMouseEnter={() => setHover(a.id)}
                onMouseLeave={() => setHover((h) => (h === a.id ? null : h))}
                className={cn(a.pinnedAt && "bg-hover/50")}
              >
                <div className="flex items-start gap-2 px-3 py-1">
                  <button
                    type="button"
                    onClick={() => setOpen((o) => (o === a.id ? null : a.id))}
                    aria-expanded={showing}
                    className="press grid h-9 w-7 shrink-0 place-items-center rounded-full text-muted hover:text-ink"
                    aria-label={showing ? "Hide what these files are" : "Show what these files are"}
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform duration-150", showing && "rotate-180")} strokeWidth={2} aria-hidden />
                  </button>

                  <div className="flex min-w-0 flex-1 flex-wrap gap-x-3">
                    {a.attachments.map((f, i) => (
                      <button
                        key={`${f.url}-${i}`}
                        type="button"
                        onClick={() => onOpen(a.attachments, i)}
                        className="min-h-[36px] max-w-full truncate text-left text-[13px] font-medium text-primary-ink hover:underline"
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>

                  {a.pinnedAt ? <span className="mt-2 shrink-0 rounded-chip bg-primary/10 px-1.5 py-0.5 text-micro font-medium text-primary-ink">Pinned</span> : null}

                  {canPin ? (
                    <button
                      type="button"
                      onClick={() => void pin(a.id, !a.pinnedAt)}
                      aria-label={a.pinnedAt ? `Unpin ${first}` : `Pin ${first} to the top`}
                      className="press grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:text-ink"
                    >
                      {a.pinnedAt ? <PinOff className="h-4 w-4" strokeWidth={2} aria-hidden /> : <Pin className="h-4 w-4" strokeWidth={2} aria-hidden />}
                    </button>
                  ) : null}
                </div>

                {/* The detail, laid out only when it is wanted. */}
                <div className={cn("grid transition-all duration-200 ease-out", showing ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                  <div className="overflow-hidden">
                    <div className="px-3 pb-3 pl-12 text-[13px] text-ink">
                      {a.body.trim() ? (
                        <p className="whitespace-pre-wrap">{a.body}</p>
                      ) : (
                        <p className="text-muted">No description was written for {a.attachments.length > 1 ? "these files" : "this file"}.</p>
                      )}
                      <p className="mt-1 text-micro text-muted">
                        {a.attachments.length > 1 ? `${a.attachments.length} files` : a.attachments[0]?.type || "file"} · {stamp(a.createdAt)} · {a.author?.name ?? "Someone who left"}
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
