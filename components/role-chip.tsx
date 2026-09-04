"use client";

import { cn } from "@/lib/cn";
import { ROLE_LABEL, type UserRole } from "@/lib/types";

export function RoleChip({ role, className }: { role: UserRole; className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-chip px-1.5 py-px text-micro font-medium",
        // The chain reads as a ladder of authority at a glance: founder filled,
        // director/HOD/manager in progressively quieter tints, everyone else
        // neutral. Admin is neutral too — accounts power, not chain power.
        // DIRECTOR is the top of the chain (FOUNDER folded away, enum dormant).
        (role === "FOUNDER" || role === "DIRECTOR") && "bg-primary text-on-primary",
        role === "HOD" && "bg-info-soft text-info-ink",
        role === "MANAGER" && "bg-warn-soft text-warn-ink",
        (role === "TEAM_LEAD" || role === "RESOURCE" || role === "ADMIN" || role === "PERSON") &&
          "bg-hover text-muted",
        className,
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}
