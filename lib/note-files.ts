/**
 * A note's files (2026-09-10): a note — on a project, a milestone or a task —
 * can carry several. Shared by the note routes; nothing here touches the
 * database, so the rules can be read and tested on their own.
 */

export type NoteFileInput = { url: string; name: string; type: string; size?: number | null };

/** The most files one note carries. */
export const MAX_FILES_PER_NOTE = 10;

/** The files a note was sent with: the list, or — from a screen that still sends one — that one. */
export function noteFilesFrom(input: {
  attachments?: NoteFileInput[] | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
}): NoteFileInput[] {
  if (input.attachments?.length) return input.attachments.slice(0, MAX_FILES_PER_NOTE);
  if (input.attachmentUrl) return [{ url: input.attachmentUrl, name: input.attachmentName || "File", type: input.attachmentType || "application/octet-stream" }];
  return [];
}

/** The first file also stays on the note's own columns, so everything that reads one file keeps working. */
export function firstFileColumns(files: NoteFileInput[]): { attachmentUrl: string | null; attachmentName: string | null; attachmentType: string | null } {
  const first = files[0];
  return { attachmentUrl: first?.url ?? null, attachmentName: first?.name ?? null, attachmentType: first?.type ?? null };
}

/** The rows a note's files become, in the order they were attached. */
export function attachmentRows(files: NoteFileInput[]): { url: string; name: string; type: string; size: number | null; orderKey: string }[] {
  return files.map((f, i) => ({
    url: f.url,
    name: f.name || "File",
    type: f.type || "application/octet-stream",
    size: typeof f.size === "number" ? f.size : null,
    orderKey: String(i).padStart(4, "0"),
  }));
}

/** What a notification says for a note: its words, or what was attached. */
export function noteSaid(body: string, files: NoteFileInput[]): string {
  if (body.trim()) return body;
  if (files.length > 1) return `Attached ${files.length} files`;
  return `Attached ${files[0]?.name ?? "a file"}`;
}
