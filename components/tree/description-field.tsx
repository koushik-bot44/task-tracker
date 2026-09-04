"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";

/**
 * The free-form markdown description editor with an Edit / Preview toggle. Lives
 * in the task detail panel AND, since phase 24, inline in My Space (the per-task
 * "Prompt" box) — so it is shared here rather than private to one screen. It
 * commits on blur, only when the draft actually changed. `rows` lets a caller
 * size it (the panel uses 6; the compact My Space box a little shorter).
 */
export function DescriptionField({
  value,
  onCommit,
  rows = 6,
  placeholder = "Markdown supported",
}: {
  value: string;
  onCommit: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-micro font-medium uppercase tracking-widest text-muted">
          Description
        </p>
        <div className="flex items-center gap-0.5 rounded-lg border border-line p-0.5">
          {(["Edit", "Preview"] as const).map((mode) => {
            const active = (mode === "Preview") === preview;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setPreview(mode === "Preview")}
                aria-pressed={active}
                className={cn(
                  "rounded-md px-2 py-0.5 text-micro transition-colors duration-150 ease-out",
                  active ? "bg-hover text-ink" : "text-muted hover:text-ink",
                )}
              >
                {mode}
              </button>
            );
          })}
        </div>
      </div>

      {preview ? (
        <div className="min-h-[6rem] rounded-lg border border-line bg-bg p-3">
          {draft.trim().length === 0 ? (
            <p className="text-sm text-muted">Nothing written yet.</p>
          ) : (
            <div className="prose-orbit text-sm text-ink">
              {/* No rehype-raw: raw HTML in the source stays inert text. */}
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
            </div>
          )}
        </div>
      ) : (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (draft !== value) onCommit(draft);
          }}
          rows={rows}
          placeholder={placeholder}
          aria-label="Description"
          className="w-full resize-y rounded-lg border border-line bg-bg p-3 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary"
        />
      )}
    </div>
  );
}
