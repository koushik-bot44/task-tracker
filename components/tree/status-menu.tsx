"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CircleDashed } from "lucide-react";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/cn";
import { STATUS_LABEL, STATUSES, type Status } from "@/lib/types";

export function StatusMenu({
  status,
  onSelect,
}: {
  status: Status;
  onSelect: (next: Status) => void;
}) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <Tooltip content={`Change status — currently ${STATUS_LABEL[status].toLowerCase()}`}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Change status — currently ${STATUS_LABEL[status].toLowerCase()}`}
          className="press grid h-10 w-10 place-items-center rounded-card text-muted hover:text-ink"
        >
          <CircleDashed className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </button>
      </Tooltip>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: reduce ? 0 : 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-11 z-sticky w-40 origin-top-right overflow-hidden rounded-xl border border-line bg-raised p-1 shadow-lift"
          >
            {STATUSES.map((option) => (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={option === status}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(option);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 ease-out hover:bg-hover",
                  option === status ? "text-primary-ink" : "text-ink",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    option === "DONE" && "bg-primary",
                    option === "BLOCKED" && "bg-danger",
                    option === "IN_PROGRESS" && "bg-warn",
                    (option === "BACKLOG" || option === "PLANNED" || option === "CANCELLED") &&
                      "bg-muted",
                  )}
                  aria-hidden
                />
                {STATUS_LABEL[option]}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
