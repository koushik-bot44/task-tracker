"use client";

import { ArrowDownUp, X } from "lucide-react";
import { useState } from "react";
import { Attachment, Linkified } from "@/components/notes/notes-thread";
import { useToast } from "@/components/toast";
import { Chip } from "@/components/ui/chip";
import { Face } from "@/components/ui/face";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { dateWord } from "@/lib/dates";
import { useActivity, useWorkMutations, type ActivityFilter } from "@/lib/hooks/use-work";
import { useMe } from "@/lib/hooks/use-users";
import type { ActivityDTO, TaskDTO } from "@/lib/types";
import { ActivityComposer } from "./activity-composer";

type Filter = "all" | "notes" | "team" | "changes" | "files" | "mentions";

const FILTERS: { key: Filter; label: string; staffOnly?: boolean }[] = [
  { key: "all", label: "All" },
  { key: "notes", label: "Notes" },
  { key: "team", label: "Team notes", staffOnly: true },
  { key: "changes", label: "Changes" },
  { key: "files", label: "Files" },
  { key: "mentions", label: "Mentions" },
];

function toQuery(f: Filter): ActivityFilter {
  switch (f) {
    case "notes":
      return { type: "COMMENT" };
    case "team":
      return { type: "WORK_NOTE" };
    case "changes":
      return { type: "FIELD_CHANGE,SYSTEM" };
    case "files":
      return { type: "ATTACHMENT" };
    case "mentions":
      return { mentions: "me" };
    default:
      return {};
  }
}

function when(iso: string): string {
  const d = new Date(iso);
  const minutes = Math.round((Date.now() - d.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${dateWord(iso)} · ${time}`;
}

/**
 * The activity stream: what happened to this task, in order — notes, team
 * notes, files, and every change written from the change itself. Filter
 * chips narrow it; the composer at the bottom adds to it.
 */
export function ActivityStream({ task, staff }: { task: TaskDTO; staff: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [newest, setNewest] = useState(false);
  const { data, isLoading, isError, refetch } = useActivity(task.id, { ...toQuery(filter), order: newest ? "desc" : "asc" });
  const { removeNote } = useWorkMutations(task.id);
  const { data: me } = useMe();
  const { show: toast } = useToast();

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {FILTERS.filter((f) => staff || !f.staffOnly).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn("press h-8 shrink-0 rounded-chip px-3 text-micro font-medium", filter === f.key ? "bg-ink text-on-ink" : "bg-hover text-muted hover:text-ink")}
          >
            {f.label}
          </button>
        ))}
        <button type="button" onClick={() => setNewest((v) => !v)} className="press ml-auto flex h-8 shrink-0 items-center gap-1 rounded-chip px-2 text-micro font-medium text-muted hover:text-ink" aria-label={newest ? "Newest first" : "Oldest first"}>
          <ArrowDownUp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {newest ? "Newest first" : "Oldest first"}
        </button>
      </div>

      {isLoading ? (
        <Skeleton rows={3} />
      ) : isError ? (
        <p className="text-sm text-muted">
          Couldn&apos;t load the activity.{" "}
          <button type="button" onClick={() => refetch()} className="font-medium text-primary-ink">
            Retry
          </button>
        </p>
      ) : (data ?? []).length === 0 ? (
        <p className="px-1 text-sm text-muted">{filter === "all" ? "Nothing yet." : "Nothing here."}</p>
      ) : (
        <ol className="space-y-3">
          {(data ?? []).map((a) => (
            <ActivityItem
              key={a.id}
              item={a}
              mine={Boolean(a.author && (a.author.id === me?.id || me?.role === "FOUNDER"))}
              onDelete={() => removeNote.mutate(a.id, { onError: (e) => toast({ message: (e as Error).message, tone: "danger" }) })}
            />
          ))}
        </ol>
      )}

      <ActivityComposer task={task} staff={staff} />
    </section>
  );
}

function changeLine(a: ActivityDTO): string {
  const m = a.metadata as { field?: string; label?: string; oldLabel?: string | null; newLabel?: string | null };
  const who = a.author?.name ?? "Orbit";
  const from = m.oldLabel ?? "nothing";
  const to = m.newLabel ?? "nothing";
  switch (m.field) {
    case "state":
      return `${who} moved it to ${to}`;
    case "assigneeId":
      return m.newLabel ? `${who} gave it to ${to}` : `${who} took it off ${from}`;
    case "assignmentGroupId":
      return m.newLabel ? `${who} put it with ${to}` : `${who} took it away from ${from}`;
    case "deletedAt":
      return m.newLabel ? `${who} deleted it` : `${who} brought it back`;
    case "title":
      return `${who} renamed it to “${to}”`;
    default:
      return `${who} changed ${m.label?.toLowerCase() ?? m.field}: ${from} → ${to}`;
  }
}

function ActivityItem({ item, mine, onDelete }: { item: ActivityDTO; mine: boolean; onDelete: () => void }) {
  if (item.type === "FIELD_CHANGE" || item.type === "SYSTEM") {
    const text = item.type === "SYSTEM" ? `${item.author?.name ? `${item.author.name}: ` : ""}${item.body}` : changeLine(item);
    return (
      <li className="flex items-start gap-2.5 pl-1">
        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-line" aria-hidden />
        <p className="min-w-0 flex-1 text-micro text-muted">
          <span className="whitespace-pre-wrap break-words">{text}</span>
          <span className="ml-2 shrink-0">{when(item.createdAt)}</span>
        </p>
      </li>
    );
  }
  const internal = item.visibility === "INTERNAL";
  const name = item.author?.name ?? "Someone who left";
  return (
    <li className={cn("flex items-start gap-2.5 rounded-card", internal && "bg-warn-soft/40 px-2 py-2")}>
      <Face name={name} size="md" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-micro font-semibold text-ink">{name}</span>
          {internal ? <Chip tone="warn" className="h-5 px-1.5">Team note</Chip> : null}
          <span className="shrink-0 text-micro text-muted">{when(item.createdAt)}</span>
          {mine ? (
            <button type="button" onClick={onDelete} aria-label="Delete your note" className="press ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:text-danger-ink">
              <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </div>
        {item.body ? (
          <p className="whitespace-pre-wrap break-words text-sm text-ink">
            <Linkified text={item.body} />
          </p>
        ) : null}
        {item.attachmentUrl ? <Attachment url={item.attachmentUrl} name={item.attachmentName} type={item.attachmentType} /> : null}
      </div>
    </li>
  );
}
