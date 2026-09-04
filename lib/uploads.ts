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
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

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
  };
  return map[ext] ?? "application/octet-stream";
}
