"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";
import { OverlayPortal } from "@/components/overlay-portal";
import { cn } from "@/lib/cn";

/**
 * The sheet: a bottom sheet on a phone, a centred card on a desktop. One
 * element, two shapes, decided by CSS. Escape and the scrim close it. Every
 * form in Orbit (Give a task, New project, Add milestone, Set progress…) is a
 * sheet, so they all open, breathe and close the same way.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  label,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  label?: string;
  wide?: boolean;
}) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <OverlayPortal>
      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              key="sheet-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.15 }}
              onClick={onClose}
              className="fixed inset-0 z-drawer bg-black/40"
              aria-hidden
            />
            <div className="pointer-events-none fixed inset-0 z-drawer flex items-end justify-center md:items-center md:p-4">
              <motion.div
                key="sheet"
                role="dialog"
                aria-modal="true"
                aria-label={label ?? title}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
                transition={{ duration: reduce ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "pointer-events-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-sheet bg-surface shadow-lift md:max-h-[86dvh] md:rounded-sheet",
                  wide ? "md:w-[min(40rem,94vw)]" : "md:w-[min(30rem,94vw)]",
                )}
              >
                <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line md:hidden" aria-hidden />
                <div className="flex shrink-0 items-start gap-2 px-4 pb-2 pt-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-section font-semibold text-ink">{title}</h2>
                    {subtitle ? <p className="truncate text-micro text-muted">{subtitle}</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="press -mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:text-ink"
                  >
                    <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
                {footer ? (
                  <div className="shrink-0 border-t border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">{footer}</div>
                ) : (
                  <div className="h-[env(safe-area-inset-bottom)] shrink-0" aria-hidden />
                )}
              </motion.div>
            </div>
          </>
        ) : null}
      </AnimatePresence>
    </OverlayPortal>
  );
}

/** A labelled field inside a sheet: 13px label, 44px control. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-micro font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-micro text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-input border border-line bg-surface px-3 text-row text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary";
