"use client";

import { cn } from "@/lib/cn";

/**
 * "Clear filters", filling like water.
 *
 * Always in its place on the toolbar: grey and unpressable while nothing is
 * narrowed, and the moment a filter goes on, blue water rises from the bottom
 * of the box and fills it, with a small wave riding its surface. Once full, a
 * faint swell keeps drifting across, so the button reads as "something is on"
 * rather than as one more plain box (owner, 2026-09-18: "colour fill the box ..
 * something like ocean waves").
 *
 * Made the way the Well Being scene is (components/routine/well-being-scene.tsx):
 * no images, no libraries — inline SVG curves and transform-only motion. Its CSS
 * is the ".cfw" block at the end of app/globals.css rather than a <style> here:
 * a <style> inside a <button> is not valid HTML, and its quoted selectors came
 * back from the server escaped, which broke hydration.
 *
 * The words are written twice. The dark ones sit on the box; the white ones live
 * INSIDE the water, pushed up by exactly as much as the water is pushed down, so
 * they stand still while the waterline sweeps up through the letters — dark above
 * it, white below — instead of turning white-on-white before the water arrives.
 *
 * Each wave is drawn twice side by side at 200% width, so sliding it left by half
 * its own width lands on an identical frame and the loop never jumps.
 */
export function ClearFiltersButton({ on, onClear, className }: { on: boolean; onClear: () => void; className?: string }) {
  return (
    <button
      type="button"
      disabled={!on}
      onClick={onClear}
      data-on={on}
      className={cn(
        "cfw press relative inline-flex h-8 shrink-0 items-center overflow-hidden rounded-[3px] border bg-surface px-3 text-[13px] font-medium text-ink disabled:opacity-40",
        on ? "border-primary" : "border-line",
        className,
      )}
    >
      <span>Clear filters</span>
      {/* Decoration only: the name of the button is the span above. */}
      <span aria-hidden className="cfw-water">
        {/* The surface: two crests at different speeds, riding the top of the water. */}
        <svg className="cfw-crest cfw-crest-a" viewBox="0 0 120 10" preserveAspectRatio="none">
          <path d={CREST} />
        </svg>
        <svg className="cfw-crest cfw-crest-b" viewBox="0 0 120 10" preserveAspectRatio="none">
          <path d={CREST} />
        </svg>
        <span className="cfw-body">
          {/* The swell: what keeps moving, quietly, once the box is full — kept
              above and below the words so it never dims them. */}
          <svg className="cfw-swell cfw-swell-a" viewBox="0 0 120 10" preserveAspectRatio="none">
            <path d={RIBBON} />
          </svg>
          <svg className="cfw-swell cfw-swell-b" viewBox="0 0 120 10" preserveAspectRatio="none">
            <path d={RIBBON} />
          </svg>
          <span className="cfw-ink">Clear filters</span>
        </span>
      </span>
    </button>
  );
}

/** A wave on top, flat underneath: the water's surface. Two identical periods. */
const CREST = "M0 5 Q 15 0 30 5 T 60 5 T 90 5 T 120 5 V10 H0 Z";
/** Wavy on both edges, so a swell reads as water moving and not as a stripe. */
const RIBBON = "M0 3 Q 15 0 30 3 T 60 3 T 90 3 T 120 3 V7 Q 105 10 90 7 T 60 7 T 30 7 T 0 7 Z";
