import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

/**
 * Attachments on notes and tasks: a photo from the camera, or any ordinary
 * file. Stored in Vercel Blob when BLOB_READ_WRITE_TOKEN is set — a direct call
 * to the Blob REST API, no SDK. Without the token they are kept in the database
 * (2026-09-10): the live site has no Blob store, so the camera and paper-clip
 * were hidden there and read as removed. Now they are offered everywhere, and
 * the database store is kept in check: limits per person, a cap in all, and
 * files nobody uses any more swept away.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/**
 * A file that travels through a Vercel function — every upload on Vercel, Blob
 * or not — can be at most 4.5 MB, so those take up to 4 MB.
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

/** The biggest file this deployment takes. */
export function uploadLimitBytes(): number {
  if (process.env.VERCEL || !process.env.BLOB_READ_WRITE_TOKEN) return MAX_DATABASE_UPLOAD_BYTES;
  return MAX_UPLOAD_BYTES;
}

const HOUR_MS = 60 * 60 * 1000;
/** Per person an hour at a time, and in all: no one account — by accident or on
    purpose — can fill the company's database with files (review, 2026-09-10). */
const FILES_PER_HOUR = 40;
const BYTES_PER_HOUR = 80 * 1024 * 1024;
const DATABASE_CAP_BYTES = (Number(process.env.UPLOAD_DATABASE_CAP_MB) || 300) * 1024 * 1024;

/** Why this upload can't be kept right now, or null when it can. Blob keeps its own limits. */
export async function uploadRefusal(userId: string, size: number, now = new Date()): Promise<string | null> {
  if (process.env.BLOB_READ_WRITE_TOKEN) return null;
  const [mine, all] = await Promise.all([
    prisma.storedFile.aggregate({ where: { createdById: userId, createdAt: { gte: new Date(now.getTime() - HOUR_MS) } }, _count: { _all: true }, _sum: { size: true } }),
    prisma.storedFile.aggregate({ _sum: { size: true } }),
  ]);
  if (mine._count._all >= FILES_PER_HOUR || (mine._sum.size ?? 0) + size > BYTES_PER_HOUR) return "That's a lot of files in one hour. Try again a little later.";
  if ((all._sum.size ?? 0) + size > DATABASE_CAP_BYTES) return "There's no room for more files right now. Ask an admin to connect file storage.";
  return null;
}

function safeName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "file";
  return base;
}

/**
 * The name kept with a file: it fits the column and keeps its own extension.
 * Cutting the end off a long name could leave a program's extension where a
 * document's had been checked (review, 2026-09-10).
 */
export function keptName(name: string): string {
  const clean = name.trim() || "file";
  if (clean.length <= 200) return clean;
  const dot = clean.lastIndexOf(".");
  const ext = dot > 0 && clean.length - dot <= 16 ? clean.slice(dot) : "";
  return `${clean.slice(0, 200 - ext.length)}${ext}`;
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
    data: { name: keptName(file.name), type: file.type.slice(0, 120), size: file.bytes.length, bytes: new Uint8Array(file.bytes), createdById },
    select: { id: true },
  });
  // A relative URL: served by this same app, to signed-in people only.
  return { url: `/api/uploads/${row.id}` };
}

/** A file the database keeps, by the id in its /api/uploads/<id> address. */
export async function readStoredUpload(id: string): Promise<{ name: string; type: string; bytes: Uint8Array; createdById: string | null } | null> {
  if (!/^c[a-z0-9]{20,40}$/.test(id)) return null;
  return prisma.storedFile.findUnique({ where: { id }, select: { name: true, type: true, bytes: true, createdById: true } });
}

/** Kinds a browser shows without running anything. */
export function opensInline(type: string): boolean {
  return /^(image\/(png|jpeg|gif|webp|heic|avif)|application\/pdf|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|text\/plain)$/i.test(type);
}

/**
 * How a stored file is sent. Pictures, PDFs, recordings and plain text open in
 * the browser. An SVG goes as a picture, so it shows as a project's logo, but
 * downloads when opened on its own. Everything else downloads. A web page or
 * script someone attached can never run inside Orbit.
 */
export function servedAs(type: string): { contentType: string; inline: boolean } {
  if (opensInline(type)) return { contentType: type, inline: true };
  if (/^image\/svg\+xml$/i.test(type)) return { contentType: "image/svg+xml", inline: false };
  return { contentType: "application/octet-stream", inline: false };
}

const PREFIX = "/api/uploads/";

/**
 * Of these stored files, the ones something still points at: any file on a
 * note (and the first, kept on the note itself), a project's logo, a task's
 * result. Every column that can hold an /api/uploads address is checked.
 */
async function idsInUse(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const urls = ids.map((id) => `${PREFIX}${id}`);
  const [held, comments, activity, projects, tasks] = await Promise.all([
    prisma.commentAttachment.findMany({ where: { url: { in: urls } }, select: { url: true } }),
    prisma.comment.findMany({ where: { attachmentUrl: { in: urls } }, select: { attachmentUrl: true } }),
    prisma.taskActivity.findMany({ where: { attachmentUrl: { in: urls } }, select: { attachmentUrl: true } }),
    prisma.project.findMany({ where: { logoUrl: { in: urls } }, select: { logoUrl: true } }),
    prisma.task.findMany({ where: { deliverableUrl: { in: urls } }, select: { deliverableUrl: true } }),
  ]);
  const addresses = [...held.map((h) => h.url), ...comments.map((c) => c.attachmentUrl), ...activity.map((a) => a.attachmentUrl), ...projects.map((p) => p.logoUrl), ...tasks.map((t) => t.deliverableUrl)];
  return new Set(addresses.map((u) => (u ?? "").slice(PREFIX.length)));
}

/**
 * Files nobody points at any more — picked and then cancelled, a logo replaced —
 * go a day later, so the database store holds only files in use. Returns how
 * many were removed.
 */
export async function sweepUnusedFiles(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - 24 * HOUR_MS);
  const candidates = (await prisma.storedFile.findMany({ where: { createdAt: { lt: before } }, select: { id: true } })).map((c) => c.id);
  const used = await idsInUse(candidates);
  const unused = candidates.filter((id) => !used.has(id));
  if (!unused.length) return 0;
  const { count } = await prisma.storedFile.deleteMany({ where: { id: { in: unused } } });
  return count;
}

/** A note was deleted: its files go now, unless something else still shows them. Returns how many went. */
export async function releaseFiles(urls: (string | null | undefined)[]): Promise<number> {
  const ids = [...new Set(urls.filter((u): u is string => Boolean(u && u.startsWith(PREFIX))).map((u) => u.slice(PREFIX.length)))];
  const used = await idsInUse(ids);
  const gone = ids.filter((id) => !used.has(id));
  if (!gone.length) return 0;
  const { count } = await prisma.storedFile.deleteMany({ where: { id: { in: gone } } });
  return count;
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
