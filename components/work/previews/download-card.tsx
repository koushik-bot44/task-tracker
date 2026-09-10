"use client";

import { Download, Loader2 } from "lucide-react";
import { KindIcon } from "@/components/notes/note-files";
import { fileKind, fileSize } from "@/lib/file-kinds";
import type { Attached } from "../attachment-viewer";

/** While a preview is being put together. */
export function Opening() {
  return (
    <div className="grid min-h-[40vh] place-items-center text-sm text-muted">
      <span className="inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Opening…
      </span>
    </div>
  );
}

/** When a file can't be shown here: say so plainly, and offer the download. */
export function DownloadCard({ file, name, reason }: { file: Attached; name: string; reason: string }) {
  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-hover">
          <KindIcon kind={fileKind(file.name, file.type)} className="h-5 w-5 text-muted" />
        </span>
        <p className="mt-3 truncate text-sm font-semibold text-ink">{name}</p>
        {typeof file.size === "number" ? <p className="text-micro text-muted">{fileSize(file.size)}</p> : null}
        <p className="mt-2 text-sm text-muted">{reason}</p>
        <a href={file.url} download={name} className="press mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-on-primary">
          <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
          Download
        </a>
      </div>
    </div>
  );
}
