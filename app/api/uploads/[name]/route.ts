import { NextResponse } from "next/server";
import { canOpenFile } from "@/lib/file-access";
import { contentTypeFor, readDevUpload, readStoredUpload, servedAs } from "@/lib/uploads";
import { requireUser, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { name: string } };

/** A file name for Content-Disposition (RFC 5987: quotes and brackets encoded too). */
const dispositionName = (name: string) => encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * An attached file: one the database keeps (/api/uploads/<id>), or — on a
 * laptop — one stored on disk before it did. Only for whoever uploaded it, or
 * someone who can see where it is attached (2026-09-10); anyone else is told
 * there is nothing here. Pictures, PDFs, recordings and plain text open in the
 * browser; an SVG shows as a picture but downloads on its own; every other kind
 * downloads, sandboxed, so nothing someone attached can run inside Orbit.
 */
export const GET = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  const stored = await readStoredUpload(params.name);
  const disk = stored ? null : await readDevUpload(params.name);
  const file = stored
    ? { bytes: stored.bytes, name: stored.name, type: stored.type || contentTypeFor(stored.name) }
    : disk
      ? { bytes: disk, name: params.name, type: contentTypeFor(params.name) }
      : null;
  if (!file || !(await canOpenFile(user, `/api/uploads/${params.name}`, stored?.createdById ?? null))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const served = servedAs(file.type);
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "content-type": served.contentType,
      "content-disposition": `${served.inline ? "inline" : "attachment"}; filename*=UTF-8''${dispositionName(file.name)}`,
      "x-content-type-options": "nosniff",
      ...(served.inline ? {} : { "content-security-policy": "sandbox; default-src 'none'" }),
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
});
