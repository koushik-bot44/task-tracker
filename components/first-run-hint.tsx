"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Lightbulb, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Tooltip } from "@/components/tooltip";

/**
 * One sentence, once. Dismissal is remembered forever, and the card animates
 * its own height away so nothing below it jumps.
 */
export function FirstRunHint({
  id,
  children,
}: {
  /** localStorage key suffix: hint-home, hint-tree, hint-review. */
  /* One list, so a new hint cannot be dismissed under a key nobody stores.
     Phase 5 added a landing per role plus the tool overview. */
  id:
    | "home"
    | "tree"
    | "review"
    | "portfolio"
    | "lead-home"
    | "my-work"
    | "tool-overview"
    | "calendar";
  children: React.ReactNode;
}) {
  const key = `hint-${id}`;
  const reduce = useReducedMotion();
  // Starts hidden so a dismissed hint never flashes before localStorage reads.
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(key) !== "dismissed") setShow(true);
    } catch {
      setShow(true);
    }
  }, [key]);

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(key, "dismissed");
    } catch {
      /* private mode: it will simply return next visit */
    }
  };

  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className="mb-4 flex items-start gap-2.5 rounded-card bg-primary-soft px-3 py-2.5">
            <Lightbulb
              className="mt-0.5 h-4 w-4 shrink-0 text-primary-ink"
              strokeWidth={2}
              aria-hidden
            />
            <p className="min-w-0 flex-1 text-sm text-ink">{children}</p>
            <Tooltip content="Got it — don’t show this again">
              <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss this tip"
                className="press -mr-1 -mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-chip text-muted hover:text-ink"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
            </Tooltip>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
