"use client";

import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { OverlayPortal } from "@/components/overlay-portal";
import { fileKind, fileSize, previewable, type FileKind } from "@/lib/file-kinds";
import { DownloadCard, Opening } from "./previews/download-card";

export type Attached = { url: string; name: string | null; type: string | null; size?: number | null };

// Each reader loads only when a file of its kind is opened.
const PdfPreview = dynamic(() => import("./previews/pdf-preview").then((m) => m.PdfPreview), { ssr: false, loading: () => <Opening /> });
const DocxPreview = dynamic(() => import("./previews/docx-preview").then((m) => m.DocxPreview), { ssr: false, loading: () => <Opening /> });
const SheetPreview = dynamic(() => import("./previews/sheet-preview").then((m) => m.SheetPreview), { ssr: false, loading: () => <Opening /> });
const TextPreview = dynamic(() => import("./previews/text-preview").then((m) => m.TextPreview), { ssr: false, loading: () => <Opening /> });

/**
 * Open files beside the page without downloading them (2026-09-10): a
 * full-screen sheet on a phone, a panel on the right on a wider screen.
 * Pictures, PDFs, recordings, text, Markdown, CSV, Word documents and Excel
 * workbooks show in place; slides and older Office files offer the download.
 * Several files step with the arrows or the ← → keys; Esc closes the viewer —
 * only the viewer, not the drawer or sheet it was opened from.
 */
export function AttachmentViewer({ files, index, onIndex, onClose }: { files: Attached[]; index: number | null; onIndex: (index: number) => void; onClose: () => void }) {
  const open = index !== null && files.length > 0;
  const count = files.length;
  const at = open ? Math.min(Math.max(index, 0), count - 1) : 0;
  const { file, resolving } = useKnownFile(open ? files[at] : null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return;
      const by = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (e.key !== "Escape" && !(by && count > 1)) return;
      // Caught on the way down, before a drawer or sheet underneath hears it.
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") onClose();
      else onIndex((at + by + count) % count);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, at, count, onClose, onIndex]);

  // Focus moves into the panel when it opens and back where it was when it closes.
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => before?.focus?.();
  }, [open]);

  if (!file) return null;
  const name = file.name ?? "File";
  const kind = fileKind(file.name, file.type);
  const step = (by: number) => onIndex((at + by + count) % count);
  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-drawer bg-black/40" onClick={onClose} aria-hidden />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={count > 1 ? `${name}, file ${at + 1} of ${count}` : name}
        className="fixed inset-0 z-drawer flex flex-col bg-surface shadow-lift outline-none md:left-auto md:w-[min(56rem,92vw)]"
      >
        <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2 md:px-3">
          {count > 1 ? (
            <button type="button" onClick={() => step(-1)} aria-label="Previous file" className="press grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-hover hover:text-ink">
              <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
          ) : null}
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-[13px] font-semibold text-ink">{name}</p>
            <p className="truncate text-micro text-muted">
              {count > 1 ? `${at + 1} of ${count}` : "1 file"}
              {typeof file.size === "number" ? ` · ${fileSize(file.size)}` : ""}
            </p>
          </div>
          {count > 1 ? (
            <button type="button" onClick={() => step(1)} aria-label="Next file" className="press grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-hover hover:text-ink">
              <ChevronRight className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
          ) : null}
          <a href={file.url} download={name} className="press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-medium text-ink hover:bg-hover">
            <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
            <span className="hidden sm:inline">Download</span>
            <span className="sr-only sm:hidden">Download</span>
          </a>
          <button type="button" onClick={onClose} aria-label="Close" className="press grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-hover hover:text-ink">
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto bg-bg">{resolving ? <Opening /> : <FilePreview key={file.url} file={file} name={name} kind={kind} />}</div>
      </aside>
    </OverlayPortal>
  );
}

/**
 * A file handed over as only its address — a task's result, say — asks the
 * server for its name and type before choosing how to show it. The headers
 * are all it reads; the body is left behind.
 */
function useKnownFile(listed: Attached | null): { file: Attached | null; resolving: boolean } {
  const [learned, setLearned] = useState<{ url: string; name: string | null; type: string | null } | null>(null);
  const url = listed && !listed.type && previewable(listed.url) && fileKind(listed.name, null) === "other" ? listed.url : null;

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((res) => {
        const encoded = /filename\*=UTF-8''([^;]+)/i.exec(res.headers.get("content-disposition") ?? "")?.[1];
        let name: string | null = null;
        try {
          name = encoded ? decodeURIComponent(encoded) : null;
        } catch {
          name = null;
        }
        setLearned({ url, name, type: res.ok ? (res.headers.get("content-type") ?? "").split(";")[0] || null : null });
        controller.abort();
      })
      .catch(() => {
        if (!controller.signal.aborted) setLearned({ url, name: null, type: null });
      });
    return () => controller.abort();
  }, [url]);

  if (!listed) return { file: null, resolving: false };
  if (!url) return { file: listed, resolving: false };
  if (learned?.url !== url) return { file: listed, resolving: true };
  return { file: { ...listed, name: listed.name ?? learned.name, type: learned.type }, resolving: false };
}

function FilePreview({ file, name, kind }: { file: Attached; name: string; kind: FileKind }) {
  const [broken, setBroken] = useState(false);
  if (!previewable(file.url)) return <DownloadCard file={file} name={name} reason="This file lives outside Orbit, so it can't be shown here." />;
  switch (kind) {
    case "image":
      return broken ? (
        <DownloadCard file={file} name={name} reason="This picture can't be shown in this browser." />
      ) : (
        <div className="grid min-h-full place-items-center p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={file.url} alt={name} onError={() => setBroken(true)} className="max-h-[calc(100dvh-4.5rem)] max-w-full object-contain" />
        </div>
      );
    case "pdf":
      return <PdfPreview file={file} name={name} />;
    case "video":
      return (
        <div className="grid min-h-full place-items-center bg-black">
          <video src={file.url} controls playsInline className="max-h-[calc(100dvh-3.5rem)] max-w-full" />
        </div>
      );
    case "audio":
      return (
        <div className="p-6">
          <audio src={file.url} controls className="w-full" />
        </div>
      );
    case "text":
    case "markdown":
    case "csv":
      return <TextPreview file={file} name={name} kind={kind} />;
    case "sheet":
      return <SheetPreview file={file} name={name} />;
    case "docx":
      return <DocxPreview file={file} name={name} />;
    case "slides":
      return <DownloadCard file={file} name={name} reason="Preview not available for slides. Download to open them." />;
    case "office":
      return <DownloadCard file={file} name={name} reason="Preview not available for this kind of document. Download to open it." />;
    default:
      return <DownloadCard file={file} name={name} reason="Preview not available for this kind of file." />;
  }
}
