"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Attached } from "../attachment-viewer";
import { DownloadCard, Opening } from "./download-card";
import { SheetTable } from "./sheet-table";

/** Enough of a text file to read; the rest is a download away. */
const MAX_CHARS = 1_000_000;

/** CSV or TSV into rows — quotes, doubled quotes and line breaks inside quotes included. */
function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Plain text, Markdown laid out, or a CSV as a table (2026-09-10). */
export function TextPreview({ file, name, kind }: { file: Attached; name: string; kind: "text" | "markdown" | "csv" }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(file.url)
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.text();
      })
      .then((t) => {
        if (alive) setText(t.slice(0, MAX_CHARS));
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [file.url]);

  if (failed) return <DownloadCard file={file} name={name} reason="This file couldn't be read here." />;
  if (text === null) return <Opening />;
  if (kind === "csv") return <SheetTable rows={parseDelimited(text, /\.tsv$/i.test(name) ? "\t" : ",")} />;
  if (kind === "markdown") {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-5 text-sm leading-6 text-ink [&_a]:text-primary-ink [&_a]:underline [&_code]:font-mono [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_pre]:overflow-auto [&_pre]:rounded-input [&_pre]:bg-hover [&_pre]:p-3 [&_td]:border [&_td]:border-line [&_td]:px-2 [&_th]:border [&_th]:border-line [&_th]:px-2 [&_ul]:list-disc">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: (props) => {
              const { node, ...rest } = props;
              void node;
              return <a {...rest} target="_blank" rel="noopener noreferrer" />;
            },
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    );
  }
  return <pre className="whitespace-pre-wrap break-words p-4 font-mono text-[12px] leading-5 text-ink">{text}</pre>;
}
