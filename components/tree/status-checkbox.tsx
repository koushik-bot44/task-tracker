"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/cn";
import { STATUS_LABEL, type Status } from "@/lib/types";

/**
 * The completion control. Reads status at a glance: filled = done, dashed =
 * blocked, half-swept = in progress, hollow = not started.
 */
export function StatusCheckbox({
  status,
  onToggle,
  readOnly = false,
}: {
  status: Status;
  onToggle?: () => void;
  /** Manager read-only rail: same glyph, but a <span>, not a control. */
  readOnly?: boolean;
}) {
  const reduce = useReducedMotion();
  const done = status === "DONE";
  const cancelled = status === "CANCELLED";
  const blocked = status === "BLOCKED";
  const inProgress = status === "IN_PROGRESS";

  /* Read-only renders the identical glyph as a plain span. Not a disabled
     button: a disabled control still reads as "something you could press",
     and the point of the rail is that there is nothing here to press. */
  if (readOnly) {
    return (
      <Tooltip content={STATUS_LABEL[status]}>
        <span
          role="img"
          aria-label={STATUS_LABEL[status]}
          className="grid h-10 w-9 shrink-0 place-items-center"
        >
          <Glyph
            done={done}
            cancelled={cancelled}
            blocked={blocked}
            inProgress={inProgress}
            reduce={reduce}
          />
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip
      content={
        done
          ? `${STATUS_LABEL[status]} — click to reopen`
          : `${STATUS_LABEL[status]} — click to mark done`
      }
    >
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      role="checkbox"
      aria-checked={done}
      aria-label={
        done
          ? `${STATUS_LABEL[status]} — mark not done`
          : `${STATUS_LABEL[status]} — mark done`
      }
      title={done ? "Mark not done · Ctrl+Enter" : "Mark done · Ctrl+Enter"}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-lg transition-colors duration-150 ease-out hover:bg-hover"
    >
      <Glyph
        done={done}
        cancelled={cancelled}
        blocked={blocked}
        inProgress={inProgress}
        reduce={reduce}
      />
    </button>
    </Tooltip>
  );
}

/**
 * The glyph itself, extracted so the interactive and read-only branches cannot
 * drift apart. Writing it twice would be a parallel list of one set.
 */
function Glyph({
  done,
  cancelled,
  blocked,
  inProgress,
  reduce,
}: {
  done: boolean;
  cancelled: boolean;
  blocked: boolean;
  inProgress: boolean;
  reduce: boolean | null;
}) {
  return (
    <span
      className={cn(
        "relative grid h-[20px] w-[20px] place-items-center rounded-full border-2 transition-colors duration-150 ease-out",
        done && "border-ok bg-ok",
        blocked && "border-danger border-dashed",
        inProgress && "border-primary",
        cancelled && "border-line",
        !done && !blocked && !inProgress && !cancelled && "border-muted",
      )}
    >
      {inProgress ? (
        <span className="h-[9px] w-[9px] rounded-full bg-primary" aria-hidden />
      ) : null}
      {blocked ? (
        <span className="h-[7px] w-[7px] rounded-full bg-danger" aria-hidden />
      ) : null}
      {cancelled ? <span className="h-[1px] w-[9px] bg-muted" aria-hidden /> : null}

      <motion.svg
        viewBox="0 0 20 20"
        className="absolute h-3 w-3 text-on-fill"
        initial={false}
        animate={{ opacity: done ? 1 : 0, scale: done ? 1 : 0.6 }}
        transition={{ duration: reduce ? 0 : 0.16, ease: [0.16, 1, 0.3, 1] }}
        aria-hidden
      >
        <path
          d="M4.5 10.5l3.5 3.5 7.5-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.svg>
    </span>
  );
}
