"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * A template re-mounts on every navigation, which is exactly what a route
 * transition needs — a layout would not. Content rises a few pixels as it
 * fades, so moving between pages reads as movement rather than a hard cut.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-full"
    >
      {children}
    </motion.div>
  );
}
