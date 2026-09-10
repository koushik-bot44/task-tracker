import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

/**
 * Attachments on notes and tasks: a photo from the camera, or any ordinary
 * file. Stored in Vercel Blob when BLOB_READ_WRITE_TOKEN is set — a direct call
 * to the Blob REST API, no SDK. Without the token they are kept in the database
 * (2026-09-10): the live site has no Blob store, so the camera and paper-clip
 * were hidden there and read as removed. Now they are offered everywhere.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/**
 * Kept in the database, a file travels through a Vercel function, which takes
 * at most 4.5 MB per request — so the database store takes up to 4 MB.
 */
export const MAX_DATABASE_UPLOAD_BYTES = 4 * 1024 * 1024;
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

/** The biggest file this deployment takes: Blob's limit, or the database's. */
export function uploadLimitBytes(): number {
  return process.env.BLOB_READ_WRITE_TOKEN ? MAX_UPLOAD_BYTES : MAX_DATABASE_UPLOAD_BYTES;
}

function safeName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "file";
  return base;
}

export async function storeUpload(file: { name: string; type: string; bytes: Buffer }, createdById: string | null = null): Promise<{ url: string }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    const res = await fetch(`https://blob.vercel-storage.com/notes/${encodeURIComponent(safeName(file.name))}`, {
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
  const row = await prisma.storedFile.create({
    data: { name: file.name.slice(0, 200) || "file", type: file.type.slice(0, 120), size: file.bytes.length, bytes: new Uint8Array(file.bytes), createdById },
    select: { id: true },
  });
  // A relative URL: served by this same app, to signed-in people only.
  return { url: `/api/uploads/${row.id}` };
}

/** A file the database keeps, by the id in its /api/uploads/<id> address. */
export async function readStoredUpload(id: string): Promise<{ name: string; type: string; bytes: Uint8Array } | null> {
  if (!/^c[a-z0-9]{20,40}$/.test(id)) return null;
  return prisma.storedFile.findUnique({ where: { id }, select: { name: true, type: true, bytes: true } });
}

/**
 * Kinds a browser shows without running anything. Every other kind is
 * downloaded instead, so a web page or script someone attached can never run
 * inside Orbit.
 */
export function opensInline(type: string): boolean {
  return /^(image\/(png|jpeg|gif|webp|heic|avif)|application\/pdf|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|text\/plain)$/i.test(type);
}

const DEV_DIR = path.join(process.cwd(), ".localdb", "uploads");

/** Local development only: files attached on a laptop before 2026-09-10 went to disk, and still open. */
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
