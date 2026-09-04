"use client";

import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/cn";
import { VERIFIED_GATE_KEY, type Gate } from "@/lib/gates";

/**
 * The row / card read-out of gates: "3/5" plus one dot per gate. Five labelled
 * pills drowned the task titles and made 390px unusable, so a row says the same
 * thing in a tenth of the width and names every gate in the tooltip for anyone
 * who wants the detail. Toggling gates lives in the detail panel's GatesField —
 * this surface is read-only everywhere it appears.
 *
 * The Verified gate keeps its own amber in the dot run (phase 11 — it is the
 * manager's sign-off, the one gate the team cannot move), so a glance tells
 * whether a DONE task has cleared review without spelling anything out.
 */
export function GateCluster({ gates }: { gates: Gate[] }) {
  if (gates.length === 0) return null;

  const done = gates.filter((g) => g.done).length;
  const allDone = done === gates.length;

  return (
    <Tooltip
      content={
        <span className="block">
          <span className="mb-1 block font-medium text-on-ink">
            {done} of {gates.length} gates passed
          </span>
          {gates.map((gate) => (
            <span key={gate.key} className="block whitespace-nowrap">
              <span className={gate.done ? "text-ok" : "text-on-ink-muted"}>
                {gate.done ? "✓" : "○"}
              </span>{" "}
              <span className={gate.done ? "text-on-ink" : "text-on-ink-muted"}>
                {gate.label}
              </span>
              {gate.key === VERIFIED_GATE_KEY ? (
                <span className="text-on-ink-muted"> · managers only</span>
              ) : null}
            </span>
          ))}
        </span>
      }
    >
      <span
        className={cn(
          "flex h-7 shrink-0 items-center gap-1.5 rounded-chip px-2",
          allDone ? "bg-ok-soft" : "bg-hover",
        )}
        aria-label={`${done} of ${gates.length} gates passed`}
      >
        <span
          className={cn(
            "text-micro font-semibold tabular-nums",
            allDone ? "text-ok-ink" : "text-muted",
          )}
        >
          {done}/{gates.length}
        </span>
        <span className="flex items-center gap-[3px]" aria-hidden>
          {gates.map((gate) => (
            <span
              key={gate.key}
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                gate.done && gate.key === VERIFIED_GATE_KEY && "bg-warn-ink",
                gate.done && gate.key !== VERIFIED_GATE_KEY && "bg-ok-ink",
                /* Passed is solid, unpassed is a ring. Shape carries the
                   difference, not tone — both states have to clear 3:1 to be
                   countable at all, and two dots that both clear it are too
                   close in weight to tell apart by colour alone. */
                !gate.done &&
                  gate.key === VERIFIED_GATE_KEY &&
                  "border-[1.5px] border-dot-off-warn",
                !gate.done && gate.key !== VERIFIED_GATE_KEY && "border-[1.5px] border-dot-off",
              )}
            />
          ))}
        </span>
      </span>
    </Tooltip>
  );
}

/**
 * A manager's row read-out (phase 20). Managers don't see the team's build
 * gates on a row — only their own Verified sign-off — so in place of the full
 * GateCluster a manager's row shows just this: amber-filled once signed off, an
 * amber ring while it still awaits them. Same Verified tokens as the dot run
 * above, so the two read-outs agree at a glance. Read-only, like GateCluster.
 */
export function VerifiedChip({ gates }: { gates: Gate[] }) {
  const verified = gates.find((g) => g.key === VERIFIED_GATE_KEY);
  if (!verified) return null;
  const done = verified.done;

  return (
    <Tooltip content={done ? "Verified — signed off" : "Verified — awaiting your sign-off"}>
      <span
        className={cn(
          "flex h-7 shrink-0 items-center gap-1.5 rounded-chip px-2",
          done ? "bg-warn-soft" : "bg-hover",
        )}
        aria-label={done ? "Verified" : "Not yet verified"}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            done ? "bg-warn-ink" : "border-[1.5px] border-dot-off-warn",
          )}
          aria-hidden
        />
        <span
          className={cn("text-micro font-semibold", done ? "text-warn-ink" : "text-muted")}
        >
          Verified
        </span>
      </span>
    </Tooltip>
  );
}
