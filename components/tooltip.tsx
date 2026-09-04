"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

const DELAY_MS = 300;
/** Kept clear of the viewport edge so text never sits on the boundary. */
const MARGIN = 10;
/** Between the anchor and the bubble. */
const GAP = 8;

type Placement = "top" | "bottom";

/**
 * Hand-rolled, portalled to the body, and edge-aware.
 *
 * The first version centred the bubble on its anchor and left it there. On a
 * row at the right of the viewport, half the tooltip hung off the screen with
 * the text cut down the middle; on a row near the top it opened upward across
 * the Tree|Board control and covered a thing you were trying to click.
 *
 * So placement is now measured rather than assumed: the bubble renders
 * hidden, gets measured, is clamped horizontally inside the viewport and
 * flipped vertically when the preferred side does not fit — or when it would
 * land on top of an element marked [data-tooltip-obstacle], which is how
 * interactive chrome declares "do not cover me". Only then is it shown.
 */
export function Tooltip({
  content,
  placement = "top",
  children,
  className,
}: {
  content: React.ReactNode;
  placement?: Placement;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const show = useCallback((immediate = false) => {
    if (timer.current) clearTimeout(timer.current);
    if (immediate) setOpen(true);
    else timer.current = setTimeout(() => setOpen(true), DELAY_MS);
  }, []);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
    setPos(null);
  }, []);

  /**
   * Runs once the bubble exists, so its real width and height are known —
   * guessing them was what made the old version clip.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current?.getBoundingClientRect();
    const tip = tipRef.current?.getBoundingClientRect();
    if (!anchor || !tip) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const topFor = (p: Placement) =>
      p === "top" ? anchor.top - GAP - tip.height : anchor.bottom + GAP;

    const fits = (p: Placement) => {
      const t = topFor(p);
      return t >= MARGIN && t + tip.height <= vh - MARGIN;
    };

    // Horizontal: centre on the anchor, then clamp so neither edge escapes.
    // A tooltip wider than the viewport pins to the left margin rather than
    // centring off both sides.
    let left = anchor.left + anchor.width / 2 - tip.width / 2;
    left = Math.max(MARGIN, Math.min(left, vw - tip.width - MARGIN));

    /* Obstacles are elements that must not be covered — the app bar and the
       Tree|Board control mark themselves. Overlapping the page is fine;
       overlapping something you are about to click is not.

       An obstacle CONTAINING this anchor is excluded: the help button lives
       inside the app bar, and a bubble explaining it necessarily sits against
       the bar. Treating its own container as an obstacle would leave it
       nowhere legal to go. */
    const anchorEl = anchorRef.current;
    const obstacles = Array.from(
      document.querySelectorAll("[data-tooltip-obstacle]"),
    )
      .filter((el) => !(anchorEl && el.contains(anchorEl)))
      .map((el) => el.getBoundingClientRect());

    const overlap = (p: Placement) => {
      const t = topFor(p);
      const r = { left, right: left + tip.width, top: t, bottom: t + tip.height };
      let worst = 0;
      for (const o of obstacles) {
        const w = Math.min(r.right, o.right) - Math.max(r.left, o.left);
        const h = Math.min(r.bottom, o.bottom) - Math.max(r.top, o.top);
        if (w > 0 && h > 0) worst += w * h;
      }
      return worst;
    };

    const other: Placement = placement === "top" ? "bottom" : "top";
    let chosen = placement;
    if (!fits(chosen) && fits(other)) {
      chosen = other;
    } else if (overlap(chosen) > 0 && fits(other) && overlap(other) < overlap(chosen)) {
      chosen = other;
    }

    /* Flipping is not always available — the help button sits in the app bar,
       so there is no room above it and "bottom" is forced, landing on the
       Tree|Board switcher. When neither side is clear, slide sideways instead:
       tuck the bubble just past whichever edge of the obstacle is reachable
       without leaving the viewport. */
    if (overlap(chosen) > 0) {
      const t = topFor(chosen);
      for (const o of obstacles) {
        const clashes =
          Math.min(left + tip.width, o.right) - Math.max(left, o.left) > 0 &&
          Math.min(t + tip.height, o.bottom) - Math.max(t, o.top) > 0;
        if (!clashes) continue;
        const toLeft = o.left - tip.width - GAP;
        const toRight = o.right + GAP;
        if (toLeft >= MARGIN) left = toLeft;
        else if (toRight + tip.width <= vw - MARGIN) left = toRight;
      }
    }

    setPos({ left, top: topFor(chosen) });
  }, [open, placement, content]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    // Any scroll invalidates a fixed position computed from a rect.
    const onScroll = () => hide();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", hide);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", hide);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, hide]);

  return (
    <span
      ref={anchorRef}
      className={className}
      onPointerEnter={() => show()}
      onPointerLeave={hide}
      onFocusCapture={() => show(true)}
      onBlurCapture={hide}
      aria-describedby={open ? id : undefined}
    >
      {children}

      {mounted && open
        ? createPortal(
            <span
              ref={tipRef}
              id={id}
              role="tooltip"
              style={{
                position: "fixed",
                left: pos ? pos.left : 0,
                top: pos ? pos.top : 0,
                // Hidden for the one frame between existing and being measured.
                // It still occupies layout, which is what makes it measurable.
                visibility: pos ? "visible" : "hidden",
              }}
              /* Inverted, not white-on-white. Dropping the border left a white
                 tooltip floating over white cards with only a shadow to say
                 where it started; dark is how a tooltip reads as temporary
                 and above everything, and it needs no border to do it.
                 px-2.5/py-2 so the text is never up against the edge. */
              /* rounded-card, NOT rounded-chip. --r-chip is 999px, which is a
                 stadium on one line and a full ellipse on four — the gate
                 tooltip rendered as a dark blob with its text hanging outside
                 the shape. A tooltip is a small card, not a pill. */
              className="pointer-events-none z-tooltip max-w-[min(16rem,calc(100vw-1.25rem))] rounded-card bg-ink px-2.5 py-2 text-micro leading-relaxed text-surface shadow-e2 motion-safe:animate-[tip_140ms_cubic-bezier(0.16,1,0.3,1)]"
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
