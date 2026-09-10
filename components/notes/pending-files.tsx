"use client";

import { Loader2, RotateCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { fileKind, fileSize } from "@/lib/file-kinds";
import { uploadFileWithProgress, useUploadsEnabled, type UploadedFile } from "@/lib/hooks/use-comments";
import { MAX_FILES_PER_NOTE } from "@/lib/note-files";
import { KindIcon } from "./note-files";

export type PendingFile = {
  key: string;
  file: File;
  name: string;
  type: string;
  size: number;
  /** A picture shown straight from the device while it uploads. */
  preview: string | null;
  progress: number;
  status: "uploading" | "done" | "error";
  error: string | null;
  result: UploadedFile | null;
};

/**
 * Files waiting to go with a note (2026-09-10): picked several at once or one
 * after another, each uploading straight away and on its own, so one slow or
 * refused file never holds up the rest.
 */
export function usePendingFiles() {
  const { data: uploads } = useUploadsEnabled();
  const [items, setItems] = useState<PendingFile[]>([]);
  // The list as it is right now, for uploads that finish after a render.
  const current = useRef<PendingFile[]>([]);
  const alive = useRef(true);

  const commit = useCallback((next: PendingFile[]) => {
    current.current = next;
    if (alive.current) setItems(next);
  }, []);

  const change = useCallback(
    (key: string, patch: Partial<PendingFile>) => commit(current.current.map((p) => (p.key === key ? { ...p, ...patch } : p))),
    [commit],
  );

  const start = useCallback(
    (item: PendingFile) => {
      uploadFileWithProgress(item.file, uploads?.maxBytes, (fraction) => change(item.key, { progress: fraction }))
        .then((result) => change(item.key, { status: "done", progress: 1, result, error: null }))
        .catch((e: Error) => change(item.key, { status: "error", error: e.message }));
    },
    [uploads?.maxBytes, change],
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const p of current.current) if (p.preview) URL.revokeObjectURL(p.preview);
    };
  }, []);

  /** Adds files and starts them. Returns what to tell the person when some didn't fit. */
  const add = useCallback(
    (picked: FileList | File[] | null | undefined): string | null => {
      const list = Array.from(picked ?? []);
      if (!list.length) return null;
      const room = Math.max(0, MAX_FILES_PER_NOTE - current.current.length);
      const taken = list.slice(0, room);
      const fresh: PendingFile[] = taken.map((file, i) => ({
        key: `${Date.now()}-${i}-${file.name}`,
        file,
        name: file.name || "photo.jpg",
        type: file.type,
        size: file.size,
        preview: fileKind(file.name, file.type) === "image" ? URL.createObjectURL(file) : null,
        progress: 0,
        status: "uploading",
        error: null,
        result: null,
      }));
      commit([...current.current, ...fresh]);
      fresh.forEach(start);
      const left = list.length - taken.length;
      return left > 0 ? `A note carries up to ${MAX_FILES_PER_NOTE} files, so ${left === 1 ? "one was" : `${left} were`} left out.` : null;
    },
    [commit, start],
  );

  const remove = useCallback(
    (key: string) => {
      const gone = current.current.find((p) => p.key === key);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      commit(current.current.filter((p) => p.key !== key));
    },
    [commit],
  );

  const retry = useCallback(
    (key: string) => {
      const item = current.current.find((p) => p.key === key);
      if (!item) return;
      change(key, { status: "uploading", progress: 0, error: null });
      start(item);
    },
    [change, start],
  );

  const clear = useCallback(() => {
    for (const p of current.current) if (p.preview) URL.revokeObjectURL(p.preview);
    commit([]);
  }, [commit]);

  return {
    items,
    add,
    remove,
    retry,
    clear,
    uploading: items.some((p) => p.status === "uploading"),
    failed: items.some((p) => p.status === "error"),
    ready: items.flatMap((p) => (p.status === "done" && p.result ? [p.result] : [])),
  };
}

/** The files waiting to be sent, each with its progress, its error and a way to take it off. */
export function PendingFileChips({ items, onRemove, onRetry }: { items: PendingFile[]; onRemove: (key: string) => void; onRetry: (key: string) => void }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label={items.length === 1 ? "A file to send" : `${items.length} files to send`}>
      {items.map((p) => (
        <li key={p.key} className="relative flex w-48 max-w-full items-center gap-2 overflow-hidden rounded-input border border-line bg-surface py-1.5 pl-1.5 pr-1">
          {p.preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.preview} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-hover">
              <KindIcon kind={fileKind(p.name, p.type)} className="h-4 w-4 text-muted" />
            </span>
          )}
          <span className="min-w-0 flex-1 text-micro">
            <span className="block truncate font-medium text-ink">{p.name}</span>
            <span className={cn("block truncate", p.status === "error" ? "text-danger-ink" : "text-muted")}>
              {p.status === "error" ? p.error : p.status === "done" ? fileSize(p.size) : `Uploading · ${Math.round(p.progress * 100)}%`}
            </span>
          </span>
          {p.status === "uploading" ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted" aria-hidden /> : null}
          {p.status === "error" ? (
            <button type="button" onClick={() => onRetry(p.key)} aria-label={`Try ${p.name} again`} className="press grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:text-ink">
              <RotateCw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </button>
          ) : null}
          <button type="button" onClick={() => onRemove(p.key)} aria-label={`Remove ${p.name}`} className="press grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:text-danger-ink">
            <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </button>
          {p.status === "uploading" ? (
            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-hover" role="progressbar" aria-label={`Uploading ${p.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.progress * 100)}>
              <span className="block h-full bg-primary transition-[width] duration-150" style={{ width: `${Math.max(4, Math.round(p.progress * 100))}%` }} />
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
