"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "quiet" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:opacity-95",
  secondary: "bg-hover text-ink",
  quiet: "bg-transparent text-muted hover:text-ink",
  danger: "bg-danger-soft text-danger-ink",
};

/** 44px tall, radius 12, one primary per screen. */
export function Button({
  variant = "secondary",
  full = false,
  loading = false,
  icon,
  className,
  children,
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  full?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type={type}
      className={cn(
        "press inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-input px-4 text-sm font-semibold disabled:opacity-40",
        VARIANT[variant],
        full && "w-full",
        className,
      )}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/** A 44px round icon button. */
export function IconButton({
  label,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("press grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:text-ink disabled:opacity-40", className)}
      {...rest}
    >
      {children}
    </button>
  );
}
