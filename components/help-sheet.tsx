"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { HelpCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { OverlayPortal } from "@/components/overlay-portal";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/cn";

const SHORTCUTS: Array<[string, string]> = [
  ["Enter", "Add a task below this one"],
  ["Tab", "Make it a subtask of the one above"],
  ["Shift + Tab", "Move it back out one level"],
  ["↑ ↓", "Move between tasks"],
  ["Alt + ↑ ↓", "Move this task up or down"],
  ["← →", "Fold or unfold, when the cursor is at the edge of the title"],
  ["Ctrl / ⌘ + Enter", "Mark done, or undo that"],
  ["Backspace", "Delete an empty task"],
  ["Ctrl / ⌘ + K", "Search, jump, or add a task from anywhere"],
  ["?", "Open this sheet"],
];

/**
 * The one place the model is explained in plain words. Two tabs so someone
 * looking for a key does not have to read the concepts, and someone confused
 * about gates does not have to read a key map.
 */
export function HelpButton() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"shortcuts" | "how">("shortcuts");
  const reduce = useReducedMotion();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (event.key === "?" && !typing) {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Tooltip content="How Orbit works, and every shortcut">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Help"
          className="press grid h-10 w-10 shrink-0 place-items-center rounded-card text-muted hover:text-ink"
        >
          <HelpCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </button>
      </Tooltip>

      {/* Portalled to the body. The app bar carries `backdrop-blur-md`, and a
          backdrop-filter creates a containing block for position:fixed
          descendants — so `fixed inset-0` resolved to the 64px header rather
          than the viewport, and this sheet was centred inside it: measured top
          -191px at 390 and -174px at 1440, i.e. (64 - height) / 2 exactly. Its
          header and tabs were off-screen at EVERY viewport. The other two
          modals were portalled in phase 5 batch 1; this one was missed because
          only the tool-create modal was measured. */}
      <OverlayPortal>
      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.16 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-drawer bg-black/45"
              aria-hidden
            />
            {/* Same trap as the tool modal: Framer's inline transform for
                y/scale overrides -translate-y-1/2, so this was hanging from
                its top edge at 50% rather than being centred. Centring belongs
                on a wrapper the animation does not touch. */}
            <div className="pointer-events-none fixed inset-0 z-drawer grid place-items-center p-4">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Help"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
              transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto flex max-h-[85dvh] w-[min(38rem,92vw)] flex-col overflow-hidden rounded-sheet border border-line bg-surface shadow-lift"
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
                <div
                  role="tablist"
                  aria-label="Help sections"
                  className="flex items-center gap-0.5 rounded-card border border-line p-0.5"
                >
                  {(
                    [
                      ["shortcuts", "Shortcuts"],
                      ["how", "How Orbit works"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={tab === key}
                      onClick={() => setTab(key)}
                      className={cn(
                        "press rounded-chip px-3 py-1.5 text-sm",
                        tab === key ? "bg-hover text-ink" : "text-muted hover:text-ink",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="press grid h-9 w-9 place-items-center rounded-card text-muted hover:text-ink"
                >
                  <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {tab === "shortcuts" ? (
                  <ul className="space-y-1.5">
                    {SHORTCUTS.map(([key, what]) => (
                      <li key={key} className="flex items-baseline gap-3">
                        <kbd className="shrink-0 rounded-chip bg-hover px-2 py-1 font-sans text-micro text-ink">
                          {key}
                        </kbd>
                        <span className="text-sm text-muted">{what}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="space-y-5 text-sm leading-relaxed text-muted">
                    <Concept title="Projects hold tasks">
                      A project is one thing you are building. Tasks live inside it, and
                      a task can hold more tasks, as deep as you need.
                    </Concept>

                    <Concept title="Status is where the work stands">
                      One answer at a time: backlog, planned, in progress, blocked,
                      done. It drives the board and the counts on the home page.
                      <StatusRow />
                    </Concept>

                    <Concept title="Gates are how finished “done” really is">
                      Separate from status. Built, reviewed, tested, deployed,
                      verified — tick them as they happen. A task can be in progress
                      with the first one ticked, or done with two still open. The
                      cluster on each row shows how many have passed.
                      <span className="mt-2 flex items-center gap-2">
                        {/* Mirrors GateCluster exactly — if that changes, change
                            this with it, or the help lies about the product.
                            Off dots are rings, and Verified (last) carries the
                            amber as the manager's sign-off. */}
                        <span className="flex h-7 items-center gap-1.5 rounded-chip bg-hover px-2">
                          <span className="text-micro font-semibold tabular-nums text-muted">
                            3/5
                          </span>
                          <span className="flex items-center gap-[3px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-ok-ink" />
                            <span className="h-1.5 w-1.5 rounded-full bg-ok-ink" />
                            <span className="h-1.5 w-1.5 rounded-full bg-ok-ink" />
                            <span className="h-1.5 w-1.5 rounded-full border-[1.5px] border-dot-off" />
                            <span className="h-1.5 w-1.5 rounded-full border-[1.5px] border-dot-off-warn" />
                          </span>
                        </span>
                        <span className="text-micro">
                          three passed; the amber ring is the manager’s sign-off,
                          still open
                        </span>
                      </span>
                    </Concept>

                    <Concept title="Verified belongs to managers">
                      Anyone on the team can tick built, reviewed, tested and
                      deployed. Only a manager can move verified, and finished
                      work waiting on it shows up in their Review queue.
                    </Concept>

                    <Concept title="Numbers count the smallest tasks">
                      A count like 3/8 means three of the eight smallest tasks
                      underneath are done. Parents are containers, so they are not
                      counted twice.
                    </Concept>
                  </div>
                )}
              </div>
            </motion.div>
            </div>
          </>
        ) : null}
      </AnimatePresence>
      </OverlayPortal>
    </>
  );
}

function Concept({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-sm font-medium text-ink">{title}</h3>
      <p className="text-sm">{children}</p>
    </section>
  );
}

function StatusRow() {
  const items: Array<[string, string]> = [
    ["To do", "bg-muted"],
    ["Planned", "bg-info"],
    ["In progress", "bg-primary"],
    ["Blocked", "bg-danger"],
    ["Completed", "bg-ok"],
  ];
  return (
    <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map(([label, dot]) => (
        <span key={label} className="flex items-center gap-1.5 text-micro">
          <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
          {label}
        </span>
      ))}
    </span>
  );
}
