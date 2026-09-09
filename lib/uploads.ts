import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";

/**
 * Attachments on notes (restructure): a photo from the camera, or a file
 * such as a PDF. Stored in Vercel Blob when BLOB_READ_WRITE_TOKEN is set —
 * a direct call to the Blob REST API, no SDK. Without the token the camera and
 * paper-clip are hidden everywhere; in local development only, a disk
 * fallback under .localdb/uploads keeps the flow testable.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/**
 * Work model (2026-09-09): any ordinary file — documents, sheets, slides,
 * PDFs, pictures, audio, video, archives, logs. Only things that would RUN
 * on a colleague's machine are refused.
 */
export const BLOCKED_EXTENSIONS = ["exe", "msi", "bat", "cmd", "com", "scr", "pif", "sh", "ps1", "vbs", "js", "jar", "apk", "dmg", "pkg", "app", "dll"];
export const BLOCKED_TYPES = ["application/x-msdownload", "application/x-sh", "application/x-shellscript", "application/java-archive", "application/vnd.android.package-archive", "text/javascript", "application/javascript"];
/** Kept for the two callers that list what a note may carry. */
export const ALLOWED_TYPES: string[] = [];

export function uploadAllowed(name: string, type: string): boolean {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (BLOCKED_EXTENSIONS.includes(ext)) return false;
  if (BLOCKED_TYPES.includes(type)) return false;
  return true;
}

const DEV_DIR = path.join(process.cwd(), ".localdb", "uploads");

export function uploadsEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) || process.env.NODE_ENV === "development";
}

function safeName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "file";
  return base;
}

export async function storeUpload(file: { name: string; type: string; bytes: Buffer }): Promise<{ url: string }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const name = safeName(file.name);
  if (token) {
    const res = await fetch(`https://blob.vercel-storage.com/notes/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "x-api-version": "7",
        "x-content-type": file.type,
        "x-add-random-suffix": "1",
        "x-cache-control-max-age": "31536000",
      },
      body: new Uint8Array(file.bytes),
    });
    if (!res.ok) throw new Error(`blob upload failed: ${res.status} ${await res.text().catch(() => "")}`);
    const json = (await res.json()) as { url: string };
    return { url: json.url };
  }
  if (process.env.NODE_ENV !== "development") throw new Error("uploads are not configured");
  await mkdir(DEV_DIR, { recursive: true });
  const stored = `${randomBytes(6).toString("hex")}-${name}`;
  await writeFile(path.join(DEV_DIR, stored), file.bytes);
  // A relative URL: the dev fallback is served by this same server, whatever
  // APP_URL says (it points at production even on a laptop).
  return { url: `/api/uploads/${stored}` };
}

/** Local development only: read a file the disk fallback stored. */
export async function readDevUpload(stored: string): Promise<Buffer | null> {
  if (process.env.NODE_ENV !== "development") return null;
  if (!/^[a-f0-9]{12}-[a-zA-Z0-9._-]+$/.test(stored)) return null;
  try {
    return await readFile(path.join(DEV_DIR, stored));
  } catch {
    return null;
  }
}

export function contentTypeFor(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    pdf: "application/pdf",
    txt: "text/plain",
    csv: "text/csv",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip",
    json: "application/json",
    xml: "application/xml",
    md: "text/markdown",
    log: "text/plain",
    rtf: "application/rtf",
    odt: "application/vnd.oasis.opendocument.text",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    mp4: "video/mp4",
    mov: "video/quicktime",
    svg: "image/svg+xml",
  };
  return map[ext] ?? "application/octet-stream";
}
