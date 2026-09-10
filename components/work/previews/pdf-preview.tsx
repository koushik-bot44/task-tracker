"use client";

import { useEffect, useRef, useState } from "react";
import type { Attached } from "../attachment-viewer";
import { Opening } from "./download-card";

/** Pages drawn at most; a longer document says how many there are. */
const MAX_PAGES = 60;

/**
 * A PDF drawn page by page with pdf.js (2026-09-10), so it reads the same on a
 * phone as on a desktop — an embedded PDF shows nothing on most phones. Script
 * inside a PDF never runs (isEvalSupported off). If pdf.js can't read the file,
 * the browser's own viewer gets a try.
 */
export function PdfPreview({ file, name }: { file: Attached; name: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "fallback">("loading");
  const [pages, setPages] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    let stop: (() => void) | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url).toString();
        const res = await fetch(file.url);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const loading = pdfjs.getDocument({ data: new Uint8Array(await res.arrayBuffer()), isEvalSupported: false });
        stop = () => void loading.destroy();
        const pdf = await loading.promise;
        const host = hostRef.current;
        if (!alive || !host) return;
        host.replaceChildren();
        setPages(pdf.numPages);
        const ratio = window.devicePixelRatio || 1;
        const room = Math.max(280, host.clientWidth - 8);
        for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n++) {
          const page = await pdf.getPage(n);
          if (!alive) return;
          const fit = Math.min(1.6, room / page.getViewport({ scale: 1 }).width);
          const viewport = page.getViewport({ scale: fit * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
          canvas.setAttribute("aria-label", `Page ${n} of ${pdf.numPages}`);
          canvas.className = "mx-auto mb-3 block max-w-full bg-white shadow-e1";
          host.appendChild(canvas);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("no canvas");
          await page.render({ canvasContext: context, viewport }).promise;
          if (!alive) return;
          setState("ready");
        }
      } catch {
        if (alive) setState("fallback");
      }
    })();
    return () => {
      alive = false;
      stop?.();
    };
  }, [file.url]);

  if (state === "fallback") return <iframe src={file.url} title={name} className="block h-full min-h-[calc(100dvh-3.5rem)] w-full bg-surface" />;
  return (
    <div className="min-h-full py-3">
      {state === "loading" ? <Opening /> : null}
      <div ref={hostRef} role="document" aria-label={name} className="px-1 md:px-3" />
      {pages !== null && pages > MAX_PAGES ? <p className="px-4 pb-4 text-center text-micro text-muted">Showing the first {MAX_PAGES} pages of {pages}. Download it for the rest.</p> : null}
    </div>
  );
}
