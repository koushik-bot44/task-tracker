"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { OverviewDTO } from "@/lib/types";

export const overviewKey = ["overview"] as const;

/**
 * The portfolio rollup. Pass a departmentId to scope it to one department (phase
 * 12) — same aggregation, restricted server-side to that department's tools.
 */
export function useOverview(departmentId?: string) {
  return useQuery({
    queryKey: departmentId ? (["overview", "department", departmentId] as const) : overviewKey,
    queryFn: () =>
      apiGet<OverviewDTO>(
        departmentId ? `/api/overview?departmentId=${encodeURIComponent(departmentId)}` : "/api/overview",
      ),
  });
}
