"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A native <select> wearing the app's input chrome.
 *
 * Deliberately not a hand-rolled listbox. The native control already ships
 * keyboard navigation, type-ahead, screen-reader semantics and — the part
 * custom widgets never match — the platform picker on touch devices. All this
 * does is strip the OS appearance and supply our own chevron, so the trigger
 * belongs to the design while the behaviour stays the browser's.
 *
 * The chevron is pointer-events-none so clicks fall through to the select.
 */
export function Select({
  className,
  size = "md",
  children,
  ...props
  /* `size` is omitted from the native attributes on purpose: HTMLSelectElement
     already declares it as a row count, and intersecting that with our union
     collapses to never. */
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  size?: "sm" | "md";
}) {
  return (
    <span className={cn("relative inline-flex min-w-0", className)}>
      <select
        {...props}
        className={cn(
          /* bg-bg, not bg-surface: every other field in the app is a slightly
             tinted inset on a white card, and a select sitting in the same
             grid as an input has to match it. */
          "w-full min-w-0 appearance-none rounded-input border border-line bg-bg text-ink outline-none transition-colors duration-150 ease-out focus:border-primary",
          size === "sm" ? "h-8 pl-2 pr-7 text-micro" : "h-9 pl-2.5 pr-8 text-sm",
        )}
      >
        {children}
      </select>
      <ChevronDown
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted",
          size === "sm" ? "right-1.5 h-3.5 w-3.5" : "right-2 h-4 w-4",
        )}
        strokeWidth={2}
        aria-hidden
      />
    </span>
  );
}
