"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { DepartmentMark } from "@/components/ui/department-mark";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Face } from "@/components/ui/face";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { useDepartmentsWork } from "@/lib/hooks/use-work";
import type { DepartmentWorkDTO, TeamWorkDTO, WorkTallyDTO } from "@/lib/types";

function Tally({ t }: { t: WorkTallyDTO }) {
  const parts = [
    `${t.open} open`,
    t.inProgress ? `${t.inProgress} in progress` : null,
    t.waiting ? `${t.waiting} waiting` : null,
    t.unassigned ? `${t.unassigned} nobody yet` : null,
  ].filter(Boolean);
  return (
    <span className="text-micro text-muted">
      {parts.join(" · ")}
      {t.overdue ? <span className="ml-1 font-medium text-danger-ink">· {t.overdue} late</span> : null}
    </span>
  );
}

/**
 * Department → team → person, with the counts the CEO asked for. Tap a
 * department to see its teams, a team to see its people; every line opens
 * the list filtered to it.
 */
export function DepartmentBoard() {
  const { data, isLoading, isError, refetch } = useDepartmentsWork();
  const [openDept, setOpenDept] = useState<string | null>(null);
  const [openTeam, setOpenTeam] = useState<string | null>(null);

  if (isLoading) return <Skeleton rows={4} />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;
  if (data.departments.length === 0) return <EmptyState title="No departments to show." />;

  return (
    <div className="space-y-3">
      {data.departments.map((d) => (
        <DepartmentCard key={d.id} d={d} open={openDept === d.id} onToggle={() => setOpenDept((v) => (v === d.id ? null : d.id))} openTeam={openTeam} onTeam={setOpenTeam} />
      ))}
    </div>
  );
}

function DepartmentCard({ d, open, onToggle, openTeam, onTeam }: { d: DepartmentWorkDTO; open: boolean; onToggle: () => void; openTeam: string | null; onTeam: (id: string | null) => void }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex min-h-[64px] items-center gap-3 px-4">
        <button type="button" onClick={onToggle} aria-expanded={open} className="press flex min-w-0 flex-1 items-center gap-3 py-2 text-left">
          <DepartmentMark name={d.name} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-row font-semibold text-ink">{d.name}</span>
            <Tally t={d} />
          </span>
          <ChevronRight className={cn("h-5 w-5 shrink-0 text-muted transition-transform", open && "rotate-90")} strokeWidth={2} aria-hidden />
        </button>
        <Link href={`/work?departmentId=${d.id}`} className="press h-9 shrink-0 rounded-chip bg-hover px-3 text-micro font-medium leading-9 text-ink">
          Open
        </Link>
      </div>
      {open ? (
        <ul className="divide-y divide-line border-t border-line bg-bg">
          {d.teams.map((g) => (
            <TeamRow key={g.id} d={d} g={g} open={openTeam === g.id} onToggle={() => onTeam(openTeam === g.id ? null : g.id)} />
          ))}
          {d.unteamed.open > 0 ? (
            <li>
              <Link href={`/work?departmentId=${d.id}`} className="press flex min-h-[52px] items-center gap-3 px-6 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink">Not with a team</span>
                  <Tally t={d.unteamed} />
                </span>
              </Link>
            </li>
          ) : null}
          {d.teams.length === 0 && d.unteamed.open === 0 ? <li className="px-6 py-4 text-sm text-muted">No teams here yet — add one from People.</li> : null}
        </ul>
      ) : null}
    </Card>
  );
}

function TeamRow({ d, g, open, onToggle }: { d: DepartmentWorkDTO; g: TeamWorkDTO; open: boolean; onToggle: () => void }) {
  return (
    <li>
      <div className="flex min-h-[52px] items-center gap-2 pl-6 pr-4">
        <button type="button" onClick={onToggle} aria-expanded={open} className="press flex min-w-0 flex-1 items-center gap-3 py-2 text-left">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">
              {g.name}
              {g.leadName ? <span className="font-normal text-muted"> · {g.leadName}</span> : null}
            </span>
            <Tally t={g} />
          </span>
          <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-90")} strokeWidth={2} aria-hidden />
        </button>
        <Link href={`/work?departmentId=${d.id}&assignmentGroupId=${g.id}`} className="press h-8 shrink-0 rounded-chip bg-hover px-3 text-micro font-medium leading-8 text-ink">
          Open
        </Link>
      </div>
      {open ? (
        <ul className="divide-y divide-line border-t border-line">
          {g.people.map((p) => (
            <li key={p.id}>
              <Link href={`/work?assignmentGroupId=${g.id}&assigneeId=${p.id}`} className="press flex min-h-[48px] items-center gap-3 pl-8 pr-4 text-left">
                <Face name={p.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{p.name}</span>
                  <Tally t={p} />
                </span>
              </Link>
            </li>
          ))}
          {g.people.length === 0 ? <li className="pl-8 pr-4 py-3 text-sm text-muted">Nobody on this team yet.</li> : null}
        </ul>
      ) : null}
    </li>
  );
}
