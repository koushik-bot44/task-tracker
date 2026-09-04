"use client";

import { Camera, FileText, Loader2, Paperclip, SendHorizontal, X } from "lucide-react";
import { useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { Face } from "@/components/ui/face";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { dateWord } from "@/lib/dates";
import { uploadFile, useCommentMutations, useComments, useUploadsEnabled } from "@/lib/hooks/use-comments";
import { useMe } from "@/lib/hooks/use-users";
import type { CommentDTO, CommentTarget } from "@/lib/types";

function when(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return dateWord(iso);
}

const isImage = (type: string | null) => Boolean(type && type.startsWith("image/"));

/**
 * ONE notes thread for projects, milestones and tasks (restructure). Plain
 * text, author-only delete, a camera and a paper-clip on the composer (both
 * hidden when attachments aren't switched on). Reads like a chat.
 */
export function NotesThread({
  targetType,
  targetId,
  autoFocus = false,
  placeholder = "Add a note…",
  compact = false,
}: {
  targetType: CommentTarget;
  targetId: string;
  autoFocus?: boolean;
  placeholder?: string;
  compact?: boolean;
}) {
  const { data: me } = useMe();
  const { data: notes, isLoading, isError, refetch } = useComments(targetType, targetId);
  const { addComment, removeComment } = useCommentMutations(targetType, targetId);
  const { data: uploads } = useUploadsEnabled();
  const { show: toast } = useToast();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<{ url: string; name: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const submit = () => {
    const body = draft.trim();
    if (!body && !pending) return;
    setDraft("");
    const att = pending;
    setPending(null);
    addComment.mutate(
      { body, attachmentUrl: att?.url ?? null, attachmentName: att?.name ?? null, attachmentType: att?.type ?? null },
      { onError: (e) => toast({ message: (e as Error).message, tone: "danger" }) },
    );
  };

  return (
    <div className="space-y-3">
      {isLoading ? (
        <Skeleton rows={2} />
      ) : isError ? (
        <p className="text-sm text-muted">
          Couldn&apos;t load notes.{" "}
          <button type="button" onClick={() => refetch()} className="font-medium text-primary-ink">
            Retry
          </button>
        </p>
      ) : (notes ?? []).length === 0 ? (
        <p className="px-1 text-sm text-muted">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {(notes ?? []).map((note) => (
            <NoteItem key={note.id} note={note} mine={me?.id === note.author.id} onDelete={() => removeComment.mutate(note.id)} compact={compact} />
          ))}
        </ul>
      )}

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
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => attach(e.target.files?.[0])} />
            <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" className="hidden" onChange={(e) => attach(e.target.files?.[0])} />
            <button type="button" onClick={() => cameraRef.current?.click()} disabled={uploading} aria-label="Take a photo" className="press grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:text-ink">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Camera className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Attach a file" className="press grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:text-ink">
              <Paperclip className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </button>
          </>
        ) : null}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label="Add a note"
          className="min-h-[44px] min-w-0 flex-1 resize-none rounded-input border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary"
        />
        <button
          type="button"
          onClick={submit}
          disabled={(!draft.trim() && !pending) || addComment.isPending}
          aria-label="Send"
          className="press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-on-primary disabled:opacity-40"
        >
          {addComment.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <SendHorizontal className="h-5 w-5" strokeWidth={2} aria-hidden />}
        </button>
      </div>
    </div>
  );
}

function NoteItem({ note, mine, onDelete, compact }: { note: CommentDTO; mine: boolean; onDelete: () => void; compact: boolean }) {
  return (
    <li className="group flex items-start gap-2.5">
      <Face name={note.author.name} size={compact ? "sm" : "md"} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-micro font-semibold text-ink">{note.author.name}</span>
          <span className="shrink-0 text-micro text-muted">{when(note.createdAt)}</span>
          {mine ? (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete your note"
              className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover:opacity-100 hover:text-danger-ink"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </div>
        {note.body ? <p className="whitespace-pre-wrap break-words text-sm text-ink">{note.body}</p> : null}
        {note.attachmentUrl ? <Attachment url={note.attachmentUrl} name={note.attachmentName} type={note.attachmentType} /> : null}
      </div>
    </li>
  );
}

export function Attachment({ url, name, type, small = false }: { url: string; name: string | null; type: string | null; small?: boolean }) {
  if (isImage(type)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 block w-fit">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name ?? "Photo"} className={cn("rounded-input object-cover", small ? "h-12 w-12" : "max-h-48 max-w-full")} />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="press mt-1 inline-flex h-9 max-w-full items-center gap-1.5 rounded-chip bg-hover px-3 text-micro font-medium text-ink"
    >
      <FileText className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
      <span className="truncate">{name ?? "File"}</span>
    </a>
  );
}
