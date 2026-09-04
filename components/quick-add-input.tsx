"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/cn";
import type { Span } from "@/lib/quick-add";

const SPAN_CLASS: Record<Span["kind"], string> = {
  text: "text-ink",
  project: "text-primary-ink bg-primary-soft rounded px-0.5",
  priority: "text-danger bg-danger-soft rounded px-0.5",
  due: "text-warn-ink bg-warn-soft rounded px-0.5",
  tag: "text-muted bg-hover rounded px-0.5",
  assignee: "text-ok-ink bg-ok-soft rounded px-0.5",
  unresolved: "text-danger-ink underline decoration-wavy decoration-danger",
};

/**
 * Token chips are drawn on a mirror layer directly beneath a transparent-text
 * input. Same font, same metrics, same padding — so the colouring lines up
 * with the characters and the real caret keeps working.
 */
export const QuickAddInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    spans: Span[];
    placeholder?: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
  }
>(function QuickAddInput({ value, spans, placeholder, onChange, onSubmit, onCancel }, ref) {
  return (
    <div className="relative h-12 w-full">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre px-4 text-sm"
      >
        {spans.length === 0 ? (
          <span className="text-muted">{value.length === 0 ? placeholder : value}</span>
        ) : (
          renderSpans(value, spans)
        )}
      </div>

      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder={placeholder}
        aria-label="Quick add"
        spellCheck={false}
        className="absolute inset-0 h-12 w-full bg-transparent px-4 text-sm text-transparent caret-[var(--ink)] outline-none placeholder:text-transparent"
      />
    </div>
  );
});

/** Interleaves the coloured token spans with the plain gaps between them. */
function renderSpans(value: string, spans: Span[]) {
  const out: React.ReactNode[] = [];
  let cursor = 0;

  spans.forEach((span, i) => {
    if (span.start > cursor) {
      out.push(<span key={`gap-${i}`}>{value.slice(cursor, span.start)}</span>);
    }
    out.push(
      <span key={`span-${i}`} className={cn(SPAN_CLASS[span.kind])}>
        {value.slice(span.start, span.end)}
      </span>,
    );
    cursor = span.end;
  });

  if (cursor < value.length) out.push(<span key="tail">{value.slice(cursor)}</span>);
  return out;
}
