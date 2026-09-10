"use client";

import { Camera, FileText, Loader2, MessageSquare, Paperclip, SendHorizontal, X } from "lucide-react";
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

const LINK_RE = /(https?:\/\/[^\s<>()]+|www\.[^\s<>()]+)/gi;

/**
 * A note can carry a link: paste one and it is tappable (owner, 2026-09-08).
 * Trailing punctuation stays with the sentence, not the link.
 */
export function Linkified({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(LINK_RE)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const trail = /[.,;:!?)\]]+$/.exec(raw)?.[0] ?? "";
    const url = trail ? raw.slice(0, -trail.length) : raw;
    if (start > last) out.push(text.slice(last, start));
    out.push(
      <a
        key={key++}
        href={url.startsWith("www.") ? `https://${url}` : url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="break-all font-medium text-primary-ink underline underline-offset-2"
      >
        {url}
      </a>,
    );
    if (trail) out.push(trail);
    last = start + raw.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/**
 * ONE notes thread for projects, milestones and tasks (restructure). Text,
 * author-only delete, a camera and a paper-clip on the composer — always
 * offered (2026-09-10): without a Blob store, files are kept in the database.
 * attachments={false} leaves them out. Reads like a chat.
 */
export function NotesThread({
  targetType,
  targetId,
  autoFocus = false,
  placeholder = "Add a note, or paste a link…",
  compact = false,
  attachments = true,
  fill = false,
}: {
  targetType: CommentTarget;
  targetId: string;
  autoFocus?: boolean;
  placeholder?: string;
  compact?: boolean;
  /** Camera + paper-clip on the composer. Off = text only. */
  attachments?: boolean;
  /** Fill the height it is given and keep the composer at the bottom, the way a
      conversation is shaped. Off = the old flow layout, for inline use. */
  fill?: boolean;
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
      setPending(await uploadFile(file, uploads?.maxBytes));
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
    <div className={cn(fill ? "flex h-full min-h-0 flex-col" : "space-y-3")}>
      <div className={cn(fill && "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3")}>
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
        fill ? (
          /* An empty thread should say what to do, in the middle, not leave a
             stray line of grey text under the header. */
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-hover text-muted">
              <MessageSquare className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <p className="text-sm font-medium text-ink">No notes yet</p>
            <p className="max-w-[16rem] text-micro text-muted">
              Anything worth remembering about this work — a decision, a link, a file — goes here, and everyone on it can read it.
            </p>
          </div>
        ) : (
          <p className="px-1 text-sm text-muted">No notes yet.</p>
        )
      ) : (
        <ul>
          {(notes ?? []).map((note, i) => {
            const before = (notes ?? [])[i - 1];
            const grouped =
              Boolean(before) &&
              before.author.id === note.author.id &&
              new Date(note.createdAt).getTime() - new Date(before.createdAt).getTime() < 5 * 60_000;
            return (
              <NoteItem
                key={note.id}
                note={note}
                mine={me?.id === note.author.id}
                canDelete={me?.id === note.author.id || me?.role === "FOUNDER"}
                onDelete={() => removeComment.mutate(note.id)}
                compact={compact}
                grouped={grouped}
              />
            );
          })}
        </ul>
      )}

      </div>

      <div className={cn(fill && "shrink-0 space-y-2 border-t border-line bg-surface px-3 py-3")}>
      {attachments && pending ? (
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
        {attachments ? (
          <>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => attach(e.target.files?.[0])} />
            {/* Any ordinary file — documents, sheets, slides, pictures,
                recordings, archives. The server refuses only what would run
                on a colleague's machine; this picker used to offer a few kinds. */}
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => attach(e.target.files?.[0])} />
            <button type="button" onClick={() => cameraRef.current?.click()} disabled={uploading} aria-label="Take a photo" className="press grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:text-ink">
              <Camera className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Attach a file"
              title={uploads?.maxBytes ? `Attach any kind of file, up to ${Math.round(uploads.maxBytes / (1024 * 1024))} MB` : "Attach any kind of file"}
              className="press inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted hover:bg-hover hover:text-ink"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Paperclip className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
              <span className="hidden sm:inline">Attach</span>
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
    </div>
  );
}

/**
 * One note, as a bubble.
 *
 * Yours sit on the right in the accent tint, everyone else's on the left with
 * their Face; a run of notes from the same person shows the Face and the name
 * once, so a back-and-forth reads as a conversation instead of a stack of
 * headed blocks. The bubble is only as wide as its words, which is what closes
 * the empty channel that used to run down the middle.
 */
function NoteItem({
  note,
  mine,
  canDelete,
  onDelete,
  compact,
  grouped = false,
}: {
  note: CommentDTO;
  /** Written by the reader — it sits on the right, in the accent tint. */
  mine: boolean;
  /** Its author, or the CEO, who may remove anyone's. */
  canDelete: boolean;
  onDelete: () => void;
  compact: boolean;
  /** The one before it is from the same person, close in time. */
  grouped?: boolean;
}) {
  return (
    <li className={cn("group flex items-end gap-2", mine ? "flex-row-reverse" : "flex-row", grouped ? "mt-0.5" : "mt-2 first:mt-0")}>
      {mine ? null : grouped ? (
        <span className={cn("shrink-0", compact ? "w-7" : "w-8")} aria-hidden />
      ) : (
        <Face name={note.author.name} size={compact ? "sm" : "md"} className="shrink-0" />
      )}

      <div className={cn("flex min-w-0 max-w-[82%] flex-col", mine ? "items-end" : "items-start")}>
        {grouped ? null : (
          <span className="mb-0.5 px-1 text-micro font-semibold text-muted">{mine ? "You" : note.author.name}</span>
        )}

        <div
          className={cn(
            "min-w-0 rounded-2xl px-3 py-2 shadow-e1",
            mine ? "bg-primary text-on-primary" : "bg-surface-2 text-ink",
            mine ? (grouped ? "rounded-tr-md" : "rounded-tr-sm") : grouped ? "rounded-tl-md" : "rounded-tl-sm",
          )}
        >
          {note.body ? (
            <p className={cn("whitespace-pre-wrap break-words text-sm", mine && "[&_a]:text-on-primary [&_a]:underline")}>
              <Linkified text={note.body} />
            </p>
          ) : null}
          {note.attachmentUrl ? <Attachment url={note.attachmentUrl} name={note.attachmentName} type={note.attachmentType} /> : null}
          <span className={cn("mt-0.5 block text-right text-[10px] leading-none", mine ? "text-on-primary/70" : "text-muted")}>
            {when(note.createdAt)}
          </span>
        </div>
      </div>

      {canDelete ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label={mine ? "Delete your note" : `Delete ${note.author.name}'s note`}
          className="press grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger-ink"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
      ) : null}
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
