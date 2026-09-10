"use client";

import { File as FileIcon, FileAudio, FileSpreadsheet, FileText, FileVideo, Presentation } from "lucide-react";
import { useState } from "react";
import type { Attached } from "@/components/work/attachment-viewer";
import { cn } from "@/lib/cn";
import { fileKind, fileSize, type FileKind } from "@/lib/file-kinds";

/** The small picture for a kind of file. */
export function KindIcon({ kind, className }: { kind: FileKind; className?: string }) {
  const Icon =
    kind === "sheet" || kind === "csv"
      ? FileSpreadsheet
      : kind === "video"
        ? FileVideo
        : kind === "audio"
          ? FileAudio
          : kind === "slides"
            ? Presentation
            : kind === "other"
              ? FileIcon
              : FileText;
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}

/**
 * A note's files as one row (2026-09-10): pictures as thumbnails, everything
 * else as a chip with its name. A tap opens the viewer beside the page at that
 * file, with the others a step away — nothing has to be downloaded to look.
 */
export function NoteFiles({ files, onOpen, tint = false, small = false }: { files: Attached[]; onOpen: (index: number) => void; tint?: boolean; small?: boolean }) {
  if (!files.length) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">
      {files.map((file, i) => (
        <li key={`${file.url}-${i}`} className="min-w-0 max-w-full">
          <FileTile file={file} tint={tint} small={small} onOpen={() => onOpen(i)} />
        </li>
      ))}
    </ul>
  );
}

function FileTile({ file, tint, small, onOpen }: { file: Attached; tint: boolean; small: boolean; onOpen: () => void }) {
  const [broken, setBroken] = useState(false);
  const name = file.name ?? "File";
  const kind = fileKind(file.name, file.type);
  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpen();
  };
  if (kind === "image" && !broken) {
    return (
      <button
        type="button"
        onClick={open}
        aria-label={`Open ${name}`}
        title={name}
        className={cn("press block overflow-hidden rounded-input border", tint ? "border-on-primary/30" : "border-line", small ? "h-12 w-12" : "h-20 w-20")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={file.url} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      aria-label={`Open ${name}`}
      title={name}
      className={cn("press inline-flex h-9 max-w-[16rem] items-center gap-1.5 rounded-chip px-2.5 text-micro font-medium", tint ? "bg-on-primary/15 text-on-primary" : "bg-hover text-ink")}
    >
      <KindIcon kind={kind} className={cn("h-4 w-4 shrink-0", tint ? "text-on-primary/80" : "text-muted")} />
      <span className="min-w-0 truncate">{name}</span>
      {typeof file.size === "number" ? <span className={cn("shrink-0", tint ? "text-on-primary/70" : "text-muted")}>{fileSize(file.size)}</span> : null}
    </button>
  );
}
