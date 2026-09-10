"use client";

import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { NoteFiles } from "@/components/notes/note-files";
import { Face } from "@/components/ui/face";
import { AttachmentViewer } from "@/components/work/attachment-viewer";
import { cn } from "@/lib/cn";
import { dateWord } from "@/lib/dates";
import type { CommentDTO } from "@/lib/types";

/**
 * The note beside a box: the latest note (two lines), its files, who wrote it
 * and when. Empty reads "Add a note". Tapping opens the thread; tapping one of
 * its files opens that file in the viewer instead (2026-09-10).
 */
export function NoteBubble({ note, label, onOpen, className }: { note: CommentDTO | null; label: string; onOpen: () => void; className?: string }) {
  const [viewing, setViewing] = useState<number | null>(null);
  const files = note?.attachments ?? [];
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={note ? `${label}: ${note.body || (files.length > 1 ? `${files.length} files` : "attachment")}` : `${label}: add a note`}
        onClick={onOpen}
        onKeyDown={(e) => {
          // A key on one of the files inside is the file's, not the bubble's.
          if (e.target !== e.currentTarget) return;
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
            <NoteFiles files={files} onOpen={setViewing} small />
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
      {/* Outside the bubble, so a click or key inside the viewer never reaches the bubble's own handlers. */}
      <AttachmentViewer files={files} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />
    </>
  );
}
