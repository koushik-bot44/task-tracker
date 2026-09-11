"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { OverlayPortal } from "@/components/overlay-portal";
import { cn } from "@/lib/cn";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const panelRef = useRef<HTMLDivElement>(null);
  // The latest onClose, so the keyboard handling below is set up once per
  // opening rather than again on every render of the page behind.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Keyboard (2026-09-11): focus moves into the sheet when it opens, Tab and
  // Shift+Tab stay inside it, Escape closes it, and focus goes back to whatever
  // opened it. With a sheet over a sheet, only the top one answers.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let tries = 0;
    let frame = requestAnimationFrame(function settle() {
      const panel = panelRef.current;
      if (!panel) {
        if (++tries < 30) frame = requestAnimationFrame(settle);
        return;
      }
      if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      const panel = panelRef.current;
      if (panel) {
        const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
        if (dialogs[dialogs.length - 1] !== panel) return;
      }
      if (e.key === "Escape") {
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const list = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
      const active = document.activeElement;
      if (list.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && (!panel.contains(active) || active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!panel.contains(active) || active === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

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
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={label ?? title}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
                transition={{ duration: reduce ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "pointer-events-auto flex max-h-[92dvh] w-full outline-none flex-col overflow-hidden rounded-t-sheet bg-surface shadow-lift md:max-h-[86dvh] md:rounded-sheet",
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
