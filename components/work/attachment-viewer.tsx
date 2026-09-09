"use client";

import { Download, ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import { OverlayPortal } from "@/components/overlay-portal";

export type Attached = { url: string; name: string | null; type: string | null };

const isImage = (t: string | null) => Boolean(t && t.startsWith("image/"));
const isPdf = (t: string | null, n: string | null) => t === "application/pdf" || /\.pdf$/i.test(n ?? "");
const isVideo = (t: string | null) => Boolean(t && t.startsWith("video/"));
const isAudio = (t: string | null) => Boolean(t && t.startsWith("audio/"));
const isText = (t: string | null, n: string | null) => Boolean((t && (t.startsWith("text/") || t === "application/json" || t === "application/xml")) || /\.(txt|log|csv|md|json|xml)$/i.test(n ?? ""));

/**
 * Open a file beside the record without downloading it: pictures, PDFs,
 * recordings and text show in place; anything else offers a download.
 */
export function AttachmentViewer({ file, onClose }: { file: Attached | null; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(null);
    if (!file || !isText(file.type, file.name)) return;
    let alive = true;
    fetch(file.url)
      .then((r) => r.text())
      .then((t) => { if (alive) setText(t.slice(0, 200_000)); })
      .catch(() => { if (alive) setText("Could not read this file."); });
    return () => { alive = false; };
  }, [file]);
  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [file, onClose]);
  if (!file) return null;
  const name = file.name ?? "File";
  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-drawer bg-black/40" onClick={onClose} aria-hidden />
      <aside role="dialog" aria-modal="true" aria-label={name} className="fixed inset-y-0 right-0 z-drawer flex w-full flex-col bg-surface shadow-lift md:w-[min(56rem,92vw)]">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{name}</span>
          <a href={file.url} target="_blank" rel="noopener noreferrer" className="press inline-flex h-8 items-center gap-1 rounded-[3px] border border-line px-2 text-[13px] text-ink">
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Open
          </a>
          <a href={file.url} download={name} className="press inline-flex h-8 items-center gap-1 rounded-[3px] border border-line px-2 text-[13px] text-ink">
            <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Download
          </a>
          <button type="button" onClick={onClose} aria-label="Close" className="press grid h-9 w-9 place-items-center rounded-full text-muted hover:text-ink">
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-bg">
          {isImage(file.type) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file.url} alt={name} className="mx-auto max-h-full max-w-full object-contain" />
          ) : isPdf(file.type, file.name) ? (
            <iframe src={file.url} title={name} className="h-full w-full" />
          ) : isVideo(file.type) ? (
            <video src={file.url} controls className="mx-auto max-h-full max-w-full" />
          ) : isAudio(file.type) ? (
            <div className="p-6"><audio src={file.url} controls className="w-full" /></div>
          ) : isText(file.type, file.name) ? (
            <pre className="whitespace-pre-wrap break-words p-4 font-mono text-[12px] leading-5 text-ink">{text ?? "Loading…"}</pre>
          ) : (
            <div className="p-8 text-center text-[13px] text-muted">
              <p>This kind of file has no preview here.</p>
              <a href={file.url} download={name} className="mt-3 inline-flex h-8 items-center gap-1 rounded-[3px] bg-primary px-3 text-[13px] font-medium text-on-primary">
                <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Download {name}
              </a>
            </div>
          )}
        </div>
      </aside>
    </OverlayPortal>
  );
}
