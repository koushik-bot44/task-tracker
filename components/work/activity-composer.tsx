"use client";

import { AtSign, FileText, Loader2, Paperclip, SendHorizontal, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { Face } from "@/components/ui/face";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { uploadFile, useUploadsEnabled } from "@/lib/hooks/use-comments";
import { useProjectPeople } from "@/lib/hooks/use-projects";
import { useMe, useUsers } from "@/lib/hooks/use-users";
import { useGroups, useWorkMutations } from "@/lib/hooks/use-work";
import { canSeeUserListRole } from "@/lib/roles";
import type { TaskDTO } from "@/lib/types";

const isImage = (type: string | null) => Boolean(type && type.startsWith("image/"));

/**
 * The composer under the stream. A note reaches everyone on the task; a team
 * note (staff only) stays with the people working it. Paper-clip attaches a
 * file; @ names someone, who is told.
 */
export function ActivityComposer({ task, staff }: { task: TaskDTO; staff: boolean }) {
  const { data: me } = useMe();
  const { addNote } = useWorkMutations(task.id);
  const { data: uploads } = useUploadsEnabled();
  const { show: toast } = useToast();
  const [internal, setInternal] = useState(false);
  const [draft, setDraft] = useState("");
  const [mentions, setMentions] = useState<{ id: string; name: string }[]>([]);
  const [pending, setPending] = useState<{ url: string; name: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const { data: users } = useUsers(pickOpen && canSeeUserListRole(me?.role));
  const { data: groups } = useGroups(pickOpen);
  const { data: projectPeople } = useProjectPeople(task.projectId, pickOpen && Boolean(task.projectId));
  const candidates = useMemo(() => {
    const out = new Map<string, string>();
    if (task.requesterId && task.requesterName) out.set(task.requesterId, task.requesterName);
    if (task.assigneeId && task.assigneeName) out.set(task.assigneeId, task.assigneeName);
    const team = (groups ?? []).find((g) => g.id === task.assignmentGroupId);
    for (const m of team?.members ?? []) out.set(m.id, m.name);
    for (const p of projectPeople ?? []) out.set(p.id, p.name);
    for (const u of users ?? []) if (u.role !== "ADMIN" && u.role !== "PERSON" && u.status === "ACTIVE" && !u.disabledAt) out.set(u.id, u.name);
    if (me) out.delete(me.id);
    return [...out.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [task, groups, projectPeople, users, me]);

  const attach = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      setPending(await uploadFile(file));
    } catch (e) {
      toast({ message: (e as Error).message, tone: "danger" });
    } finally {
      setUploading(false);
    }
  };

  const mention = (p: { id: string; name: string }) => {
    setMentions((prev) => (prev.some((m) => m.id === p.id) ? prev : [...prev, p]));
    setDraft((d) => `${d}${d && !d.endsWith(" ") ? " " : ""}@${p.name} `);
    setPickOpen(false);
    textRef.current?.focus();
  };

  const submit = () => {
    const body = draft.trim();
    if (!body && !pending) return;
    const att = pending;
    const named = mentions.filter((m) => body.includes(`@${m.name}`)).map((m) => m.id);
    setDraft("");
    setPending(null);
    setMentions([]);
    addNote.mutate(
      { body, internal, attachmentUrl: att?.url ?? null, attachmentName: att?.name ?? null, attachmentType: att?.type ?? null, mentions: named },
      { onError: (e) => toast({ message: (e as Error).message, tone: "danger" }) },
    );
  };

  return (
    <div className="space-y-2">
      {staff ? (
        <div role="tablist" aria-label="Who reads this" className="flex h-9 w-fit items-center gap-1 rounded-input bg-hover p-1">
          {[
            { v: false, label: "Note" },
            { v: true, label: "Team note" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="tab"
              aria-selected={internal === o.v}
              onClick={() => setInternal(o.v)}
              className={cn("press h-7 rounded-[8px] px-3 text-micro font-medium", internal === o.v ? (o.v ? "bg-warn-soft text-warn-ink shadow-e1" : "bg-surface text-ink shadow-e1") : "text-muted hover:text-ink")}
            >
              {o.label}
            </button>
          ))}
          <span className="px-2 text-micro text-muted">{internal ? "Only the people working this task" : "Everyone on this task"}</span>
        </div>
      ) : null}

      {pending ? (
        <div className="flex items-center gap-2 rounded-input bg-hover px-3 py-2 text-micro text-ink">
          {isImage(pending.type) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pending.url} alt="" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <FileText className="h-4 w-4 text-muted" strokeWidth={1.75} aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate">{pending.name}</span>
          <button type="button" onClick={() => setPending(null)} aria-label="Remove attachment" className="press grid h-8 w-8 place-items-center rounded-full text-muted">
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-1">
        {uploads?.enabled ? (
          <>
            <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.log" className="hidden" onChange={(e) => attach(e.target.files?.[0])} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Attach a file" className="press grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:text-ink">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Paperclip className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
            </button>
          </>
        ) : null}
        <button type="button" onClick={() => setPickOpen(true)} aria-label="Mention someone" className="press grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:text-ink">
          <AtSign className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </button>
        <textarea
          ref={textRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={internal ? "A team note…" : "Add a note, or paste a link…"}
          aria-label={internal ? "Add a team note" : "Add a note"}
          className={cn(
            "min-h-[44px] min-w-0 flex-1 resize-none rounded-input border bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary",
            internal ? "border-warn" : "border-line",
          )}
        />
        <button type="button" onClick={submit} disabled={(!draft.trim() && !pending) || addNote.isPending} aria-label="Send" className="press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-on-primary disabled:opacity-40">
          {addNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <SendHorizontal className="h-5 w-5" strokeWidth={2} aria-hidden />}
        </button>
      </div>

      <Sheet open={pickOpen} onClose={() => setPickOpen(false)} title="Mention someone">
        <ul className="divide-y divide-line">
          {candidates.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => mention(p)} className="press flex min-h-[56px] w-full items-center gap-3 px-2 text-left">
                <Face name={p.name} />
                <span className="min-w-0 flex-1 truncate text-row text-ink">{p.name}</span>
              </button>
            </li>
          ))}
          {candidates.length === 0 ? <li className="py-6 text-center text-sm text-muted">Nobody to mention here.</li> : null}
        </ul>
      </Sheet>
    </div>
  );
}
