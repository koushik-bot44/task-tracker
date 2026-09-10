"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { Attached } from "../attachment-viewer";
import { DownloadCard, Opening } from "./download-card";
import { SheetTable } from "./sheet-table";

/**
 * An .xlsx workbook as tables, a tab per sheet (2026-09-10). The reader loads
 * only when a spreadsheet is opened; nothing leaves the browser to show it.
 */
export function SheetPreview({ file, name }: { file: Attached; name: string }) {
  const [book, setBook] = useState<{ name: string; rows: unknown[][] }[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [res, lib] = await Promise.all([fetch(file.url), import("read-excel-file/browser")]);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const sheets = await lib.default(await res.arrayBuffer());
        if (alive) setBook(sheets.map((s) => ({ name: s.sheet, rows: s.data as unknown[][] })));
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [file.url]);

  if (failed) return <DownloadCard file={file} name={name} reason="This spreadsheet couldn't be shown here." />;
  if (!book) return <Opening />;
  const sheet = book[Math.min(active, book.length - 1)];
  return (
    <div className="flex min-h-full flex-col">
      {book.length > 1 ? (
        <div role="tablist" aria-label="Sheets" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-surface px-2">
          {book.map((s, i) => (
            <button
              key={`${s.name}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={cn("press -mb-px h-9 shrink-0 px-3 text-[13px] font-medium", i === active ? "border-b-2 border-primary text-ink" : "text-muted hover:text-ink")}
            >
              {s.name}
            </button>
          ))}
        </div>
      ) : null}
      {sheet && sheet.rows.length ? <SheetTable rows={sheet.rows} /> : <p className="p-6 text-center text-sm text-muted">This sheet is empty.</p>}
    </div>
  );
}
