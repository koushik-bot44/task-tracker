"use client";

import { CompanyHome } from "@/components/home/company-home";
import { LeadHome } from "@/components/home/lead-home";
import { MyWork } from "@/components/home/my-work";
import { PortfolioDashboard } from "@/components/home/portfolio-dashboard";
import { UsersPage } from "@/components/settings/users-page";
import { useMe } from "@/lib/hooks/use-users";
import { isAdminRole, isExecutiveRole, isManagerRole } from "@/lib/roles";

/**
 * One route, four landings (phase 14).
 *
 * A manager opening the app wants their portfolio (the tools they own or
 * collaborate on); an admin wants the accounts board (people + pending invites +
 * password-reset requests) and sees no project at all; a lead wants their tools
 * and what needs clearing; a developer wants their own list.
 *
 * The branch is on the server-supplied role, and every underlying endpoint
 * enforces its own permissions — this only decides what to render first.
 */
export function RoleHome() {
  const { data: me, isLoading } = useMe();

  if (isLoading || !me) {
    return (
      <div className="space-y-3 px-4 py-4 sm:px-8 sm:py-6" aria-hidden>
        <div className="h-32 animate-pulse rounded-card bg-hover" />
        <div className="h-52 animate-pulse rounded-card bg-hover" />
      </div>
    );
  }

  if (isAdminRole(me.role)) return <UsersPage />;
  // Phase 48: the founder and directors land on the COMPANY page — department
  // cards, not a project portfolio. An HOD/manager keeps the portfolio (their
  // visible slice); leads and team members keep their own landings.
  if (isExecutiveRole(me.role)) return <CompanyHome />;
  if (isManagerRole(me.role)) return <PortfolioDashboard />;
  if (me.role === "TEAM_LEAD") return <LeadHome />;
  return <MyWork />;
}
