"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";
import { OverlayPortal } from "@/components/overlay-portal";

/**
 * The drawer: a right-hand panel on desktop, a bottom sheet on a phone. Used
 * for the task drawer and the note threads. Back/Escape/scrim close it.
 */
export function Drawer({
  open,
  onClose,
  header,
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  header?: React.ReactNode;
  children: React.ReactNode;
  label: string;
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
              key="drawer-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.15 }}
              onClick={onClose}
              className="fixed inset-0 z-drawer bg-black/40"
              aria-hidden
            />
            <motion.aside
              key="drawer"
              role="dialog"
              aria-modal="true"
              aria-label={label}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
              transition={{ duration: reduce ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-x-0 bottom-0 z-drawer flex max-h-[92dvh] flex-col rounded-t-sheet bg-surface shadow-lift md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none md:w-[28rem] md:max-w-[92vw] md:rounded-none md:rounded-l-sheet"
            >
              <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line md:hidden" aria-hidden />
              <div className="flex h-14 shrink-0 items-center gap-2 px-3">
                <div className="min-w-0 flex-1">{header}</div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="press grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:text-ink"
                >
                  <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </OverlayPortal>
  );
}
