"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders overlays into document.body.
 *
 * `position: fixed` escapes overflow, but it does NOT escape a stacking
 * context — and `position: sticky` creates one. The tool modal was mounted
 * inside the sidebar's sticky <aside>, so its z-drawer was resolved *within*
 * that context and the main column, later in DOM order, painted straight over
 * it: hovered tree rows appeared on top of an open dialog.
 *
 * Raising the z-index would not have fixed it — no value is large enough to
 * escape a context you are trapped inside. Leaving the DOM is the fix, so
 * every modal goes through here rather than trusting where it was mounted.
 *
 * Portals only exist client-side, hence the mounted guard: rendering null on
 * the server keeps hydration honest.
 */
export function OverlayPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
