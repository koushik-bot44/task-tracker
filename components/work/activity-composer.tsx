"use client";

import { AtSign, Camera, FileText, Loader2, Paperclip, SendHorizontal, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { Face } from "@/components/ui/face";
import { Sheet, inputClass } from "@/components/ui/sheet";
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
export function ActivityComposer({ task }: { task: TaskDTO }) {
  const { data: me } = useMe();
  const { addNote } = useWorkMutations(task.id);
  const { data: uploads } = useUploadsEnabled();
  const { show: toast } = useToast();
  const internal = false;
  const [draft, setDraft] = useState("");
  const [mentions, setMentions] = useState<{ id: string; name: string }[]>([]);
  const [pending, setPending] = useState<{ url: string; name: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickQ, setPickQ] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const { data: users } = useUsers(pickOpen && canSeeUserListRole(me?.role));
  const { data: groups } = useGroups(pickOpen);
  const { data: projectPeople } = useProjectPeople(task.projectId, pickOpen && Boolean(task.projectId));
  /* Everyone who could be meant, nearest first: the people on this task, then
     its team and project, then everybody visible. Each carries a hint — their
     department or address — because two people can share a first name. */
  const candidates = useMemo(() => {
    const out = new Map<string, { name: string; hint: string }>();
    const add = (id: string, name: string, hint = "") => {
      if (!out.has(id) || (hint && !out.get(id)!.hint)) out.set(id, { name, hint });
    };
    if (task.requesterId && task.requesterName) add(task.requesterId, task.requesterName, "asked for this");
    if (task.assigneeId && task.assigneeName) add(task.assigneeId, task.assigneeName, "holds this");
    const team = (groups ?? []).find((g) => g.id === task.assignmentGroupId);
    for (const m of team?.members ?? []) add(m.id, m.name, team?.name ?? "");
    for (const p of projectPeople ?? []) add(p.id, p.name, "on this project");
    for (const u of users ?? []) {
      if (u.role !== "ADMIN" && u.role !== "PERSON" && u.status === "ACTIVE" && !u.disabledAt) add(u.id, u.name, u.departmentName ?? u.email);
    }
    if (me) out.delete(me.id);
    return [...out.entries()].map(([id, v]) => ({ id, name: v.name, hint: v.hint })).sort((a, b) => a.name.localeCompare(b.name));
  }, [task, groups, projectPeople, users, me]);

  const found = useMemo(() => {
    const needle = pickQ.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter((c) => c.name.toLowerCase().includes(needle) || c.hint.toLowerCase().includes(needle));
  }, [candidates, pickQ]);

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
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => attach(e.target.files?.[0])} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => attach(e.target.files?.[0])} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Attach a file — any document, picture, recording or archive" className="press grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:text-ink">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Paperclip className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
            </button>
            <button type="button" onClick={() => cameraRef.current?.click()} disabled={uploading} aria-label="Take a photo" className="press grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:text-ink md:hidden">
              <Camera className="h-5 w-5" strokeWidth={1.75} aria-hidden />
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

      <Sheet
        open={pickOpen}
        onClose={() => { setPickOpen(false); setPickQ(""); }}
        title="Mention someone"
        subtitle={candidates.length > 1 ? `${candidates.length} people` : undefined}
      >
        <div className="space-y-3">
          {/* A company of any size needs a way to find one person. */}
          <input
            value={pickQ}
            onChange={(e) => setPickQ(e.target.value)}
            placeholder="Find a person"
            aria-label="Find a person to mention"
            autoFocus
            className={inputClass}
          />
          <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto rounded-input border border-line">
            {found.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => { mention(p); setPickQ(""); }} className="press flex min-h-[56px] w-full items-center gap-3 px-3 text-left hover:bg-hover">
                  <Face name={p.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-row text-ink">{p.name}</span>
                    {p.hint ? <span className="block truncate text-micro text-muted">{p.hint}</span> : null}
                  </span>
                </button>
              </li>
            ))}
            {found.length === 0 ? (
              <li className="py-6 text-center text-sm text-muted">
                {candidates.length === 0 ? "Nobody to mention here." : `Nobody matches “${pickQ.trim()}”.`}
              </li>
            ) : null}
          </ul>
        </div>
      </Sheet>
    </div>
  );
}
