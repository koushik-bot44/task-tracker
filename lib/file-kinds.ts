/**
 * What kind of file something is, for showing it (2026-09-10) — by its type,
 * and by its name when the type says nothing useful. Pure; screens only.
 */

export type FileKind = "image" | "pdf" | "video" | "audio" | "markdown" | "csv" | "text" | "sheet" | "docx" | "slides" | "office" | "other";

const extension = (name: string | null | undefined) => (name ?? "").toLowerCase().split(".").pop() ?? "";

export function fileKind(name: string | null | undefined, type: string | null | undefined): FileKind {
  const t = (type ?? "").toLowerCase();
  const e = extension(name);
  if (t.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "avif", "heic", "bmp", "svg"].includes(e)) return "image";
  if (t === "application/pdf" || e === "pdf") return "pdf";
  if (t.startsWith("video/") || ["mp4", "mov", "webm", "m4v"].includes(e)) return "video";
  if (t.startsWith("audio/") || ["mp3", "m4a", "wav", "ogg", "aac"].includes(e)) return "audio";
  if (t === "text/markdown" || e === "md" || e === "markdown") return "markdown";
  if (t === "text/csv" || t === "text/tab-separated-values" || e === "csv" || e === "tsv") return "csv";
  if (e === "xlsx" || t === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "sheet";
  if (e === "docx" || t === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (["ppt", "pptx", "key", "odp"].includes(e) || t.includes("presentation")) return "slides";
  if (["xls", "ods", "doc", "odt", "rtf", "pages", "numbers"].includes(e) || t.includes("msword") || t.includes("ms-excel") || t.includes("opendocument")) return "office";
  if (t.startsWith("text/") || t === "application/json" || t === "application/xml" || ["txt", "log", "json", "xml", "yml", "yaml", "ini"].includes(e)) return "text";
  return "other";
}

/** "340 KB", "1.2 MB". Empty when the size isn't known. */
export function fileSize(bytes: number | null | undefined): string {
  if (typeof bytes !== "number") return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** Files this app serves, or Blob holds for it — the only ones drawn inside a page. */
export function previewable(url: string): boolean {
  return url.startsWith("/api/uploads/") || /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(url);
}
