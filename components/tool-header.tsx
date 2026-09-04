"use client";

import { Pencil, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ToolAboutPanel } from "@/components/tool-about-panel";
import { DeadlineChip, PriorityPill } from "@/components/priority-pill";
import { cn } from "@/lib/cn";
import { useEditMode } from "@/lib/hooks/use-edit-mode";
import { useProjectBySlug } from "@/lib/hooks/use-projects";
import { HEALTH_LABEL } from "@/lib/types";

export function ToolHeader({ slug }: { slug: string }) {
  const pathname = usePathname();
  const { project } = useProjectBySlug(slug);
  const onBoard = pathname.endsWith("/board");
  const onOverview = pathname.endsWith("/overview");
  /* Overview is a manager's tool, but leads and developers may look — the data
     is theirs too, and hiding it would just mean asking a manager for a
     screenshot. So the tab is unconditional; only the DEFAULT landing differs,
     and that is decided by whoever links to the tool. */
  const [aboutOpen, setAboutOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  /* The Overview page carries its own identity block — name, lead, created,
     description — so repeating this header above it would say everything
     twice. Only the switcher is needed there. */
  if (onOverview) {
    return (
      <div className="flex items-center justify-end px-3 pt-4 sm:px-5">
        <ViewSwitcher slug={slug} onBoard={false} onOverview />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pb-2 pt-4 sm:px-5">
      {/* The name lives in the app bar now; repeating it here was the same
          words twice in 60px. This line carries context instead. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        {/* The name owns its own line below sm. A floor was tried twice and
            failed twice: raise it and something else simply takes the space —
            first the task count, then the lead chip, then the third switcher
            tab. Every fix removed one competitor instead of the competition.
            basis-full ends the argument; the meta and the lead chip wrap
            underneath, where nothing is lost by wrapping.

            The colour dot lives INSIDE this line. As a sibling it stranded
            itself on a line of its own the moment the name went full-width —
            a lone dot hovering above the title on every tool page. */}
        <span className="flex w-full min-w-0 items-center gap-2 font-display text-page font-semibold text-ink sm:w-auto sm:min-w-[9rem] sm:flex-1 md:hidden">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: project?.color ?? "var(--muted)" }}
            aria-hidden
          />
          <span className="min-w-0 truncate">{project?.name ?? slug}</span>
        </span>

        {/* On md+ the app bar carries the name, so the dot is the only marker
            of which tool this is and stays on the meta line. */}
        <span
          className="hidden h-2.5 w-2.5 shrink-0 rounded-full md:block"
          style={{ background: project?.color ?? "var(--muted)" }}
          aria-hidden
        />
        {project ? (
          <span className="shrink-0 text-sm text-muted">
            {HEALTH_LABEL[project.health]} · {project.taskCount}{" "}
            {project.taskCount === 1 ? "task" : "tasks"}
          </span>
        ) : null}

        {/* Phase 48: how urgent, and by when — the two facts a passer-by needs. */}
        {project ? <PriorityPill priority={project.priority} /> : null}
        {project && project.health !== "SHIPPED" ? <DeadlineChip deadline={project.deadline} /> : null}

        {/* Who owns this tool, on the same line as what it is. A tool with no
            lead says so rather than showing nothing — an empty space reads as
            "fine", and this one is a job for a manager. */}
        {project ? (
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            className={cn(
              "press flex h-7 shrink-0 items-center gap-1.5 rounded-chip px-2.5 text-micro",
              project.leadName
                ? "bg-hover text-ink"
                : "border border-dashed border-line text-muted",
            )}
          >
            <UserRound className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            {project.leadName ?? "No lead assigned"}
          </button>
        ) : null}
      </div>

      <EditRail slug={slug} show={!onOverview} />
      <ViewSwitcher slug={slug} onBoard={onBoard} onOverview={onOverview} />

      {/* The description gets its own line: it is a sentence, not a chip, and
          squeezing it beside the segmented control would truncate it to
          nothing on a phone. Clamped to two lines with a control to open the
          rest, so a long brief cannot push the tree off the screen. */}
      {project?.description ? (
        <div className="w-full">
          <p
            className={cn(
              "text-sm text-muted",
              expanded ? "whitespace-pre-wrap" : "line-clamp-2",
            )}
          >
            {project.description}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-0.5 text-micro text-primary-ink hover:underline"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        </div>
      ) : null}

      {project ? (
        <ToolAboutPanel
          project={project}
          open={aboutOpen}
          onClose={() => setAboutOpen(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * The read-only rail's control. Only a manager sees it — everyone else is
 * already editable and would be confused by a toggle that does nothing.
 *
 * Read-only is deliberately the quiet state and Editing is deliberately loud:
 * the whole point is that a manager can tell at a glance which mode they are
 * in, and the dangerous one should be the one that announces itself.
 */
function EditRail({ slug, show }: { slug: string; show: boolean }) {
  const { railed, isEditing, setEditing } = useEditMode(slug);
  if (!railed || !show) return null;

  return isEditing ? (
    <div className="flex shrink-0 items-center gap-2">
      <span className="flex h-8 items-center gap-1.5 rounded-chip bg-warn-soft px-2.5 text-micro font-semibold text-warn-ink">
        <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        Editing
      </span>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="press flex h-8 shrink-0 items-center rounded-chip bg-primary px-3 text-micro font-medium text-on-primary"
      >
        Done
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="press flex h-8 shrink-0 items-center gap-1.5 rounded-chip bg-hover px-2.5 text-micro font-medium text-ink"
    >
      <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
      Edit
    </button>
  );
}

/** Three ways of looking at one tool — a segmented control, not navigation. */
function ViewSwitcher({
  slug,
  onBoard,
  onOverview,
}: {
  slug: string;
  onBoard: boolean;
  onOverview: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="View"
      /* A tooltip must not land on the view switcher — you cannot click
         through a bubble that is explaining a different control. */
      data-tooltip-obstacle
      /* Full width on a phone so it sits on its own line: the third tab
         (Overview) pushed this to ~215px, which left the tool name below its
         floor and truncated "Skyzen Webhooks" to "Skyzen Web…" — the third
         time the name has lost a fight it should not have been in. The name
         gets the line; the switcher gets the next one. */
      className="flex w-full shrink-0 items-center justify-end gap-0.5 rounded-lg border border-line p-0.5 sm:w-auto sm:justify-start"
    >
      <SegmentLink href={`/t/${slug}/overview`} active={onOverview} label="Overview" />
      <SegmentLink href={`/t/${slug}`} active={!onBoard && !onOverview} label="Tree" />
      <SegmentLink href={`/t/${slug}/board`} active={onBoard} label="Board" />
    </div>
  );
}

function SegmentLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ease-out",
        active ? "bg-hover text-ink" : "text-muted hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
}
