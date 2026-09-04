"use client";

import { useCallback, useEffect, useState } from "react";
import { collapseStorageKey } from "@/lib/theme";

/**
 * Which rows are folded shut. View state, so it lives in localStorage per
 * project — never in the database.
 */
export function useCollapse(projectId: string | null) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!projectId) {
      setCollapsed(new Set());
      return;
    }
    try {
      const raw = window.localStorage.getItem(collapseStorageKey(projectId));
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      setCollapsed(new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : []));
    } catch {
      setCollapsed(new Set());
    }
  }, [projectId]);

  const persist = useCallback(
    (next: Set<string>) => {
      if (!projectId) return;
      try {
        window.localStorage.setItem(
          collapseStorageKey(projectId),
          JSON.stringify([...next]),
        );
      } catch {
        /* Storage full or blocked — collapse state just won't survive reload. */
      }
    },
    [projectId],
  );

  const setFor = useCallback(
    (id: string, value: boolean) => {
      setCollapsed((prev) => {
        if (prev.has(id) === value) return prev;
        const next = new Set(prev);
        if (value) next.add(id);
        else next.delete(id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const toggle = useCallback(
    (id: string) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return { collapsed, toggle, setFor };
}
