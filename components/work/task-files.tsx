"use client";

import { ChevronDown, Loader2, Paperclip, Pin, PinOff } from "lucide-react";
import { useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { apiPatch, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";
import { uploadFile, useUploadsEnabled } from "@/lib/hooks/use-comments";
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
 * A file can be added here with the words that explain it, instead of being
 * buried in a note; the important ones are pinned to the top. A row shows only
 * its name until you point at it (or open it on a phone), and then it lays out
 * the description underneath — so a list of ten files stays a list, and the
 * detail is one movement away.
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
  onOpen: (f: Attached) => void;
  onChanged: () => void;
}) {
  const { data: uploads } = useUploadsEnabled();
  const { show: toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<{ url: string; name: string; type: string } | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const fail = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      setPicked(await uploadFile(file));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      await apiPost(`/api/tasks/${taskId}/attachments`, {
        body: description.trim(),
        attachmentUrl: picked.url,
        attachmentName: picked.name,
        attachmentType: picked.type,
      });
      setPicked(null);
      setDescription("");
      onChanged();
      toast({ message: "File added" });
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
      {uploads?.enabled ? (
        <div className="space-y-2 rounded-input border border-line p-3">
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => void choose(e.target.files?.[0])} />
          {picked ? (
            <>
              <p className="flex items-center gap-2 text-[13px] text-ink">
                <Paperclip className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                <span className="min-w-0 truncate font-medium">{picked.name}</span>
              </p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What is this file? Requirements, what to look at, what is expected."
                aria-label="Description for this file"
                className={cn(snInput, "h-auto py-2")}
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void add()} disabled={busy} className={snPrimary}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                  Add the file
                </button>
                <button type="button" onClick={() => { setPicked(null); setDescription(""); }} className={snButton}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={cn(snButton, "gap-1")}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Paperclip className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
              Attach a file with its description
            </button>
          )}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-[13px] text-muted">No files yet. Attach one here with what it is, or send one in a note.</p>
      ) : (
        <ul className="divide-y divide-line rounded-input border border-line">
          {rows.map((a) => {
            const showing = open === a.id || hover === a.id;
            return (
              <li
                key={a.id}
                onMouseEnter={() => setHover(a.id)}
                onMouseLeave={() => setHover((h) => (h === a.id ? null : h))}
                className={cn(a.pinnedAt && "bg-hover/50")}
              >
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpen((o) => (o === a.id ? null : a.id))}
                    aria-expanded={showing}
                    className="press grid h-9 w-7 shrink-0 place-items-center rounded-full text-muted hover:text-ink"
                    aria-label={showing ? "Hide what this file is" : "Show what this file is"}
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform duration-150", showing && "rotate-180")} strokeWidth={2} aria-hidden />
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpen({ url: a.attachmentUrl!, name: a.attachmentName, type: a.attachmentType })}
                    className="min-h-[36px] min-w-0 flex-1 truncate text-left text-[13px] font-medium text-primary-ink hover:underline"
                  >
                    {a.attachmentName ?? "File"}
                  </button>

                  {a.pinnedAt ? <span className="shrink-0 rounded-chip bg-primary/10 px-1.5 py-0.5 text-micro font-medium text-primary-ink">Pinned</span> : null}

                  {canPin ? (
                    <button
                      type="button"
                      onClick={() => void pin(a.id, !a.pinnedAt)}
                      aria-label={a.pinnedAt ? `Unpin ${a.attachmentName ?? "this file"}` : `Pin ${a.attachmentName ?? "this file"} to the top`}
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
                        <p className="text-muted">No description was written for this file.</p>
                      )}
                      <p className="mt-1 text-micro text-muted">
                        {a.attachmentType ?? "file"} · {stamp(a.createdAt)} · {a.author?.name ?? "Someone who left"}
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
