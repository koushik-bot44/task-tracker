import { NextResponse } from "next/server";
import { MAX_UPLOAD_BYTES, contentTypeFor, storeUpload, uploadAllowed, uploadsEnabled } from "@/lib/uploads";
import { HttpError, requireUser, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether the camera / paper-clip should show at all. */
export const GET = route(async () => {
  await requireUser();
  return NextResponse.json({ enabled: uploadsEnabled() });
});

/** Multipart upload of one file (any ordinary format, ≤ 25 MB). Returns its URL. */
export const POST = route(async (req: Request) => {
  await requireUser();
  if (!uploadsEnabled()) throw new HttpError(503, "Attachments aren't switched on yet.");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Pick a file to attach.");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "That file is over 25 MB.");
  const type = file.type || contentTypeFor(file.name);
  if (!uploadAllowed(file.name || "", type)) throw new HttpError(415, "That kind of file can't be attached.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const { url } = await storeUpload({ name: file.name || "photo.jpg", type, bytes });
  return NextResponse.json({ url, name: file.name || "photo.jpg", type }, { status: 201 });
});
