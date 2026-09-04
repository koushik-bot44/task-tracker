"use client";

import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * Counts up to the value on mount and on every change, so a number that moves
 * announces itself. Reduced motion gets the destination immediately.
 */
export function Odometer({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const previous = useRef(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      previous.current = value;
      setShown(value);
      return;
    }
    const controls = animate(previous.current, value, {
      duration: 0.7,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setShown(Math.round(latest)),
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, reduce]);

  return <span className="tabular-nums">{shown}</span>;
}
