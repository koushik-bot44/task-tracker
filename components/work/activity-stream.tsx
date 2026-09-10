"use client";

import { ArrowDownUp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Linkified } from "@/components/notes/notes-thread";
import { NoteFiles } from "@/components/notes/note-files";
import type { Attached } from "./attachment-viewer";
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
    // Every file — also the ones sent with words, which are notes carrying a file.
    case "files":
      return { type: "ATTACHMENT,COMMENT,WORK_NOTE" };
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
export function ActivityStream({ task, staff, onOpenFile }: { task: TaskDTO; staff: boolean; onOpenFile: (files: Attached[], index: number) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [newest, setNewest] = useState(false);
  const { data, isLoading, isError, refetch } = useActivity(task.id, { ...toQuery(filter), order: newest ? "desc" : "asc" });
  const { removeNote } = useWorkMutations(task.id);
  const { data: me } = useMe();
  const { show: toast } = useToast();
  const endRef = useRef<HTMLDivElement>(null);
  // Under Files, only the lines that carry one (review, 2026-09-10).
  const rows = filter === "files" ? (data ?? []).filter((a) => a.attachments.length > 0) : data ?? [];
  const count = rows.length;
  const seen = useRef(0);
  // A new line at the bottom scrolls into view, like a chat; the first load does not jump the page.
  useEffect(() => {
    if (!newest && seen.current > 0 && count > seen.current) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    seen.current = count;
  }, [count, newest]);

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
      ) : rows.length === 0 ? (
        <p className="px-1 text-sm text-muted">{filter === "all" ? "Nothing yet." : "Nothing here."}</p>
      ) : (
        <ol className="space-y-2 rounded-card bg-bg px-1 py-2">
          {rows.map((a) => (
            <ActivityItem
              key={a.id}
              item={a}
              mine={Boolean(a.author && a.author.id === me?.id)}
              canDelete={Boolean(a.author && (a.author.id === me?.id || me?.role === "FOUNDER"))}
              onDelete={() => removeNote.mutate(a.id, { onError: (e) => toast({ message: (e as Error).message, tone: "danger" }) })}
              onOpenFile={onOpenFile}
            />
          ))}
          <div ref={endRef} aria-hidden />
        </ol>
      )}

      <ActivityComposer task={task} />
    </section>
  );
}

/** A change as a sentence. Null = not worth a line (it duplicates another). */
function changeLine(a: ActivityDTO): string | null {
  const m = a.metadata as { field?: string; label?: string; oldLabel?: string | null; newLabel?: string | null; newValue?: unknown };
  const who = a.author?.name ?? "Orbit";
  const to = m.newLabel ?? "";
  switch (m.field) {
    case "state":
      switch (m.newValue) {
        case "IN_PROGRESS":
          return `${who} started work`;
        case "RESOLVED":
          return `${who} marked it complete`;
        case "CLOSED":
          return `${who} closed it`;
        case "REOPENED":
          return `${who} reopened it`;
        case "WAITING":
          return `${who} put it on hold`;
        case "ESCALATED":
          return `${who} escalated it`;
        case "CANCELLED":
          return `${who} canceled it`;
        case "NEW":
          return `${who} returned it to the queue`;
        case "ASSIGNED":
          return m.oldLabel === "In Progress" ? `${who} stopped work` : `${who} assigned it`;
        default:
          return `${who} moved it to ${to}`;
      }
    case "assigneeId":
      if (m.newLabel && m.newLabel === who) return `${who} took it`;
      return m.newLabel ? `${who} gave it to ${to}` : `${who} took it off ${m.oldLabel ?? "the holder"}`;
    case "assignmentGroupId":
      return m.newLabel ? `${who} put it with ${to}` : `${who} took it away from ${m.oldLabel ?? "the team"}`;
    case "waitingReason":
      return m.newLabel ? `${who} · ${to}` : null;
    case "priority":
      return `${who} set priority to ${to}`;
    case "dueDate":
      return m.newLabel ? `${who} set the due date to ${to}` : `${who} cleared the due date`;
    case "title":
      return `${who} renamed it to “${to}”`;
    case "departmentId":
    case "projectId":
    case "milestoneId":
      return m.newLabel ? `${who} moved it to ${to}` : `${who} took it out of ${m.oldLabel ?? ""}`.trim();
    case "categoryId":
      return m.newLabel ? `${who} set the category to ${to}` : `${who} cleared the category`;
    case "requesterId":
      return `${who} set the requester to ${to}`;
    case "type":
      return `${who} changed the type to ${to}`;
    case "deletedAt":
      return m.newLabel ? `${who} deleted it` : `${who} brought it back`;
    case "resolutionCode":
    case "important":
    case "archived":
    case "parentId":
      return null;
    default:
      return `${who} changed ${m.label ?? m.field} to ${to}`;
  }
}

function ActivityItem({ item, mine, canDelete, onDelete, onOpenFile }: { item: ActivityDTO; mine: boolean; canDelete: boolean; onDelete: () => void; onOpenFile: (files: Attached[], index: number) => void }) {
  if (item.type === "FIELD_CHANGE" || item.type === "SYSTEM") {
    const text = item.type === "SYSTEM" ? `${item.author?.name ? `${item.author.name}: ` : ""}${item.body}` : changeLine(item);
    if (!text) return null;
    return (
      <li className="flex justify-center px-2 py-0.5">
        <p className="max-w-full rounded-chip bg-hover px-3 py-1 text-center text-micro text-muted">
          <span className="whitespace-pre-wrap break-words">{text}</span>
          <span className="ml-2 shrink-0">{when(item.createdAt)}</span>
        </p>
      </li>
    );
  }
  const internal = item.visibility === "INTERNAL";
  const name = item.author?.name ?? "Someone who left";
  return (
    <li className={cn("flex items-end gap-2 px-1", mine && "flex-row-reverse")}>
      {!mine ? <Face name={name} size="sm" className="mb-1" /> : null}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 shadow-e1",
          mine ? "rounded-br-md bg-primary-soft text-ink" : internal ? "rounded-bl-md bg-warn-soft text-ink" : "rounded-bl-md bg-surface text-ink",
        )}
      >
        <div className="flex items-baseline gap-2">
          {!mine ? <span className="truncate text-micro font-semibold text-ink">{name}</span> : null}
          {internal ? <Chip tone="warn" className="h-5 px-1.5">Team note</Chip> : null}
          {canDelete ? (
            <button type="button" onClick={onDelete} aria-label="Delete this note" className="press ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted hover:text-danger-ink">
              <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </div>
        {item.body ? (
          <p className="whitespace-pre-wrap break-words text-sm">
            <Linkified text={item.body} />
          </p>
        ) : null}
        {/* Every file on the note, each opening the viewer beside the record (2026-09-10). */}
        <NoteFiles files={item.attachments} onOpen={(index) => onOpenFile(item.attachments, index)} />
        <p className={cn("mt-0.5 text-[11px] leading-4 text-muted", mine ? "text-right" : "")}>{when(item.createdAt)}</p>
      </div>
    </li>
  );
}
