"use client";

import { MessageSquare } from "lucide-react";
import { Attachment } from "@/components/notes/notes-thread";
import { Face } from "@/components/ui/face";
import { cn } from "@/lib/cn";
import { dateWord } from "@/lib/dates";
import type { CommentDTO } from "@/lib/types";

/**
 * The note beside a box: the latest note (two lines), its photo or file, who
 * wrote it and when. Empty reads "Add a note". Tapping opens the thread.
 */
export function NoteBubble({ note, label, onOpen, className }: { note: CommentDTO | null; label: string; onOpen: () => void; className?: string }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={note ? `${label}: ${note.body || "attachment"}` : `${label}: add a note`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn("card press flex w-full cursor-pointer items-start gap-2.5 p-3 text-left", className)}
    >
      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
      {note ? (
        <div className="min-w-0 flex-1">
          {note.body ? <p className="line-clamp-2 break-words text-sm text-ink">{note.body}</p> : null}
          {note.attachmentUrl ? (
            <span onClick={(e) => e.stopPropagation()} className="block">
              <Attachment url={note.attachmentUrl} name={note.attachmentName} type={note.attachmentType} small />
            </span>
          ) : null}
          <span className="mt-1.5 flex items-center gap-1.5 text-micro text-muted">
            <Face name={note.author.name} size="sm" />
            <span className="truncate">{note.author.name.split(" ")[0]}</span>
            <span aria-hidden>·</span>
            <span className="shrink-0">{dateWord(note.createdAt)}</span>
          </span>
        </div>
      ) : (
        <span className="text-sm text-muted">Add a note</span>
      )}
    </div>
  );
}
