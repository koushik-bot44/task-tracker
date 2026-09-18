"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { Liquid, type Colors } from "@/components/ui/button-1";
import { cn } from "@/lib/cn";

/** The blues the owner supplied with the component (2026-09-18). */
const COLORS: Colors = {
  color1: "#FFFFFF",
  color2: "#1E10C5",
  color3: "#9089E2",
  color4: "#FCFCFE",
  color5: "#F9F9FD",
  color6: "#B2B8E7",
  color7: "#0E2DCB",
  color8: "#0017E9",
  color9: "#4743EF",
  color10: "#7D7BF4",
  color11: "#0B06FC",
  color12: "#C5C1EA",
  color13: "#1403DE",
  color14: "#B6BAF6",
  color15: "#C1BEEB",
  color16: "#290ECB",
  color17: "#3F4CC0",
};

/**
 * "Clear filters", lit up with liquid colour while a filter is on.
 *
 * Always in its place on the toolbar: grey and unpressable while nothing is
 * narrowed. The moment a filter goes on it turns blue, and the owner's Liquid
 * gradient (components/ui/button-1.tsx) fades in over it and keeps drifting, so
 * the button says "something is on" rather than sitting there as one more plain
 * box (owner, 2026-09-18: "when filters clicked this colours will appear").
 * Hovering slows the liquid, as in the original.
 *
 * Three things the liquid is NOT trusted with:
 *   · The colour itself. The box is solid blue underneath, so it is right before
 *     the page has woken up, and for anybody who asked for less motion — the
 *     liquid animates from JavaScript, which the stylesheet's reduced-motion rule
 *     cannot reach, so it is simply never mounted for them.
 *   · The words. The gradient has white in it, and white words on white are gone;
 *     a dark pool sits behind them, as the original does.
 *   · Idle time. Seven animated SVGs are only mounted while a filter is on.
 */
export function ClearFiltersButton({ on, onClear, className }: { on: boolean; onClear: () => void; className?: string }) {
  const [hovered, setHovered] = useState(false);
  // Only after the page has woken up: the server cannot know about reduced
  // motion, and guessing would make its HTML disagree with the browser's.
  const [awake, setAwake] = useState(false);
  useEffect(() => setAwake(true), []);
  const still = useReducedMotion();
  const liquid = on && awake && !still;

  return (
    <button
      type="button"
      disabled={!on}
      onClick={onClear}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-on={on}
      className={cn(
        "press relative isolate inline-flex h-8 shrink-0 items-center overflow-hidden rounded-[3px] border px-3 text-[13px] font-medium",
        on ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-ink disabled:opacity-40",
        className,
      )}
    >
      <AnimatePresence>
        {liquid ? (
          <motion.span
            key="liquid"
            aria-hidden
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <span className="absolute inset-0 bg-black" />
            <Liquid isHovered={hovered} colors={COLORS} />
            {/* The dark pool the original keeps behind its words. */}
            <span className="absolute left-1/2 top-1/2 h-[60%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#000066] blur-[7px]" />
          </motion.span>
        ) : null}
      </AnimatePresence>
      <span className="relative">Clear filters</span>
    </button>
  );
}
