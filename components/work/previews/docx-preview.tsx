"use client";

import { useEffect, useRef, useState } from "react";
import type { Attached } from "../attachment-viewer";
import { DownloadCard, Opening } from "./download-card";

/**
 * A Word .docx laid out in the page (2026-09-10), drawn in the browser — no
 * online viewer, which would need the private file on a public address. The
 * renderer loads only when a document is opened. Embedded HTML chunks are not
 * rendered, and a document's links only ever open web or mail addresses.
 */
export function DocxPreview({ file, name }: { file: Attached; name: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [res, lib] = await Promise.all([fetch(file.url), import("docx-preview")]);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.arrayBuffer();
        const host = hostRef.current;
        if (!alive || !host) return;
        host.replaceChildren();
        await lib.renderAsync(data, host, undefined, { className: "docx", inWrapper: true, breakPages: true, renderAltChunks: false });
        host.querySelectorAll("a[href]").forEach((a) => {
          const href = a.getAttribute("href") ?? "";
          if (/^(https?:|mailto:)/i.test(href)) {
            a.setAttribute("target", "_blank");
            a.setAttribute("rel", "noopener noreferrer");
          } else if (!href.startsWith("#")) {
            a.removeAttribute("href");
          }
        });
        if (alive) setState("ready");
      } catch {
        if (alive) setState("failed");
      }
    })();
    return () => {
      alive = false;
    };
  }, [file.url]);

  if (state === "failed") return <DownloadCard file={file} name={name} reason="This document couldn't be shown here." />;
  return (
    <div className="min-h-full">
      {state === "loading" ? <Opening /> : null}
      <div ref={hostRef} role="document" aria-label={name} className="overflow-auto [&_.docx-wrapper]:bg-bg [&_.docx-wrapper]:p-3 md:[&_.docx-wrapper]:p-6" />
    </div>
  );
}
