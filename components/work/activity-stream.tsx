"use client";

import { AtSign, Loader2, Paperclip, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Linkified } from "@/components/notes/notes-thread";
import { useToast } from "@/components/toast";
import { Face } from "@/components/ui/face";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { uploadFile, useUploadsEnabled } from "@/lib/hooks/use-comments";
import { useProjectPeople } from "@/lib/hooks/use-projects";
import { useMe, useUsers } from "@/lib/hooks/use-users";
import { useActivity, useGroups, useWorkMutations, type ActivityFilter } from "@/lib/hooks/use-work";
import { canSeeUserListRole } from "@/lib/roles";
import type { ActivityDTO, TaskDTO } from "@/lib/types";
import type { Attached } from "./attachment-viewer";
import { snButton, snInput, snLink, snPrimary } from "./sn";

type Filter = "all" | "comments" | "worknotes" | "changes" | "files" | "mentions";

const FILTERS: { key: Filter; label: string; staffOnly?: boolean }[] = [
  { key: "all", label: "All" },
  { key: "comments", label: "Additional comments" },
  { key: "worknotes", label: "Work notes", staffOnly: true },
  { key: "changes", label: "Field changes" },
  { key: "files", label: "Attachments" },
  { key: "mentions", label: "Mentions" },
];

function toQuery(f: Filter): ActivityFilter {
  switch (f) {
    case "comments":
      return { type: "COMMENT" };
    case "worknotes":
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

function stamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

/**
 * The activity stream, laid out like a service desk's: the two boxes at the
 * top — Work notes (amber, the people working it) and Additional comments
 * (everyone on the record) — a Post button, a filter, then every entry
 * newest first with a coloured bar: amber for work notes, blue for comments,
 * grey for field changes ("State: In Progress was Assigned").
 */
export function ActivityStream({ task, staff, onOpenFile }: { task: TaskDTO; staff: boolean; onOpenFile: (f: Attached) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading, isError, refetch } = useActivity(task.id, { ...toQuery(filter), order: "desc" });
  const { addNote, removeNote } = useWorkMutations(task.id);
  const { data: me } = useMe();
  const { show: toast } = useToast();
  const { data: uploads } = useUploadsEnabled();
  const [workNote, setWorkNote] = useState("");
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState<Attached | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pickFor, setPickFor] = useState<"work" | "comment" | null>(null);
  const [mentions, setMentions] = useState<{ id: string; name: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: users } = useUsers(pickFor !== null && canSeeUserListRole(me?.role));
  const { data: groups } = useGroups(pickFor !== null);
  const { data: projectPeople } = useProjectPeople(task.projectId, pickFor !== null && Boolean(task.projectId));
  const candidates = useMemo(() => {
    const out = new Map<string, string>();
    if (task.requesterId && task.requesterName) out.set(task.requesterId, task.requesterName);
    if (task.assigneeId && task.assigneeName) out.set(task.assigneeId, task.assigneeName);
    for (const m of (groups ?? []).find((g) => g.id === task.assignmentGroupId)?.members ?? []) out.set(m.id, m.name);
    for (const p of projectPeople ?? []) out.set(p.id, p.name);
    for (const u of users ?? []) if (u.role !== "ADMIN" && u.role !== "PERSON" && !u.disabledAt) out.set(u.id, u.name);
    if (me) out.delete(me.id);
    return [...out.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [task, groups, projectPeople, users, me]);

  const attach = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const up = await uploadFile(file);
      setPending({ url: up.url, name: up.name, type: up.type });
    } catch (e) {
      toast({ message: (e as Error).message, tone: "danger" });
    } finally {
      setUploading(false);
    }
  };

  const post = async () => {
    const wn = workNote.trim();
    const cm = comment.trim();
    if (!wn && !cm && !pending) return;
    const named = (body: string) => mentions.filter((m) => body.includes(`@${m.name}`)).map((m) => m.id);
    try {
      if (wn) await addNote.mutateAsync({ body: wn, internal: true, mentions: named(wn), ...(pending && !cm ? { attachmentUrl: pending.url, attachmentName: pending.name, attachmentType: pending.type } : {}) });
      if (cm || (pending && !wn)) await addNote.mutateAsync({ body: cm, internal: false, mentions: named(cm), ...(pending ? { attachmentUrl: pending.url, attachmentName: pending.name, attachmentType: pending.type } : {}) });
      setWorkNote("");
      setComment("");
      setPending(null);
      setMentions([]);
    } catch (e) {
      toast({ message: (e as Error).message, tone: "danger" });
    }
  };

  const mention = (p: { id: string; name: string }) => {
    setMentions((prev) => (prev.some((m) => m.id === p.id) ? prev : [...prev, p]));
    if (pickFor === "work") setWorkNote((d) => `${d}${d && !d.endsWith(" ") ? " " : ""}@${p.name} `);
    else setComment((d) => `${d}${d && !d.endsWith(" ") ? " " : ""}@${p.name} `);
    setPickFor(null);
  };

  return (
    <section className="space-y-3">
      <div className={cn("grid grid-cols-1 gap-3", staff && "md:grid-cols-2")}>
        {staff ? (
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-[13px] text-muted">
              Work notes
              <button type="button" onClick={() => setPickFor("work")} className="press inline-flex items-center gap-0.5 text-[12px] text-primary-ink" aria-label="Mention someone in the work note">
                <AtSign className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                mention
              </button>
            </span>
            <textarea value={workNote} onChange={(e) => setWorkNote(e.target.value)} rows={3} placeholder="Work notes (internal, seen by the people working this task)" aria-label="Work notes" className={cn(snInput, "h-auto resize-y border-warn bg-warn-soft/40 py-1.5")} />
          </label>
        ) : null}
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-[13px] text-muted">
            Additional comments (visible to the requester)
            <button type="button" onClick={() => setPickFor("comment")} className="press inline-flex items-center gap-0.5 text-[12px] text-primary-ink" aria-label="Mention someone in the comment">
              <AtSign className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              mention
            </button>
          </span>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Additional comments" aria-label="Additional comments" className={cn(snInput, "h-auto resize-y py-1.5")} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {uploads?.enabled ? (
          <>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => attach(e.target.files?.[0])} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className={snButton} aria-label="Attach a file — any document, picture, recording or archive">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Paperclip className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
              Attach file
            </button>
          </>
        ) : null}
        {pending ? (
          <span className="inline-flex h-8 items-center gap-1 rounded-[3px] border border-line bg-hover px-2 text-[13px] text-ink">
            <Paperclip className="h-3.5 w-3.5 text-muted" strokeWidth={2} aria-hidden />
            <span className="max-w-[16rem] truncate">{pending.name}</span>
            <button type="button" onClick={() => setPending(null)} aria-label="Remove attachment" className="press grid h-6 w-6 place-items-center rounded-full text-muted">
              <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </button>
          </span>
        ) : null}
        <button type="button" onClick={() => void post()} disabled={(!workNote.trim() && !comment.trim() && !pending) || addNote.isPending} className={cn(snPrimary, "ml-auto")}>
          {addNote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Post
        </button>
      </div>

      <div className="flex items-center gap-2 border-t border-line pt-3">
        <span className="text-[13px] font-semibold text-ink">Activity</span>
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className={cn(snInput, "ml-auto !w-auto")} aria-label="Show">
          {FILTERS.filter((f) => staff || !f.staffOnly).map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <Skeleton rows={3} />
      ) : isError ? (
        <p className="text-[13px] text-muted">
          Couldn&apos;t load the activity.{" "}
          <button type="button" onClick={() => refetch()} className={snLink}>Retry</button>
        </p>
      ) : (data ?? []).length === 0 ? (
        <p className="text-[13px] text-muted">No activity to display.</p>
      ) : (
        <ol className="space-y-2">
          {(data ?? []).map((a) => (
            <Entry
              key={a.id}
              item={a}
              canDelete={Boolean(a.author && (a.author.id === me?.id || me?.role === "FOUNDER"))}
              onDelete={() => removeNote.mutate(a.id, { onError: (e) => toast({ message: (e as Error).message, tone: "danger" }) })}
              onOpenFile={onOpenFile}
            />
          ))}
        </ol>
      )}

      <Sheet open={pickFor !== null} onClose={() => setPickFor(null)} title="Mention someone">
        <ul className="divide-y divide-line">
          {candidates.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => mention(p)} className="press flex min-h-[48px] w-full items-center gap-3 px-2 text-left">
                <Face name={p.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{p.name}</span>
              </button>
            </li>
          ))}
          {candidates.length === 0 ? <li className="py-6 text-center text-[13px] text-muted">Nobody to mention here.</li> : null}
        </ul>
      </Sheet>
    </section>
  );
}

function changeText(a: ActivityDTO): string {
  const m = a.metadata as { field?: string; label?: string; oldLabel?: string | null; newLabel?: string | null };
  return `${m.label ?? m.field}: ${m.newLabel ?? "(empty)"} was ${m.oldLabel ?? "(empty)"}`;
}

function Entry({ item, canDelete, onDelete, onOpenFile }: { item: ActivityDTO; canDelete: boolean; onDelete: () => void; onOpenFile: (f: Attached) => void }) {
  const name = item.author?.name ?? (item.type === "SYSTEM" || item.type === "FIELD_CHANGE" ? "System" : "Someone who left");
  const kind =
    item.type === "WORK_NOTE" ? "Work notes" : item.type === "COMMENT" ? "Additional comments" : item.type === "ATTACHMENT" ? "Attachment" : item.type === "FIELD_CHANGE" ? "Field changes" : "System";
  const bar = item.type === "WORK_NOTE" ? "border-l-warn" : item.type === "COMMENT" || item.type === "ATTACHMENT" ? "border-l-primary" : "border-l-line";
  return (
    <li className={cn("border border-line border-l-4 bg-surface px-3 py-2", bar)}>
      <div className="flex items-start gap-2">
        {item.author ? <Face name={item.author.name} size="sm" className="mt-0.5" /> : <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-hover text-[11px] text-muted">S</span>}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[13px] font-semibold text-ink">{name}</span>
            <span className="text-[12px] text-muted">{kind}</span>
            <span className="ml-auto shrink-0 text-[12px] text-muted">{stamp(item.createdAt)}</span>
            {canDelete && (item.type === "COMMENT" || item.type === "WORK_NOTE" || item.type === "ATTACHMENT") ? (
              <button type="button" onClick={onDelete} aria-label="Delete this entry" className="press grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted hover:text-danger-ink">
                <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
            ) : null}
          </div>
          {item.type === "FIELD_CHANGE" ? (
            <p className="text-[13px] text-ink">{changeText(item)}</p>
          ) : item.body ? (
            <p className="whitespace-pre-wrap break-words text-[13px] text-ink">
              <Linkified text={item.body} />
            </p>
          ) : null}
          {item.attachmentUrl ? (
            <button type="button" onClick={() => onOpenFile({ url: item.attachmentUrl!, name: item.attachmentName, type: item.attachmentType })} className={cn(snLink, "mt-1 inline-flex items-center gap-1 text-[13px]")}>
              <Paperclip className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {item.attachmentName ?? "File"}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
