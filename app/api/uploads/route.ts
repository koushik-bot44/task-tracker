import { NextResponse } from "next/server";
import { contentTypeFor, storeUpload, uploadAllowed, uploadLimitBytes } from "@/lib/uploads";
import { HttpError, requireUser, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The camera and paper-clip are always offered (2026-09-10): files go to Blob
 * when it is connected, to the database otherwise. This says how big one may be.
 */
export const GET = route(async () => {
  await requireUser();
  return NextResponse.json({ enabled: true, maxBytes: uploadLimitBytes() });
});

/** Multipart upload of one file (any ordinary format, up to the limit above). Returns its URL. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const limit = uploadLimitBytes();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Pick a file to attach.");
  if (file.size > limit) throw new HttpError(413, `That file is over ${Math.round(limit / (1024 * 1024))} MB.`);
  const type = file.type || contentTypeFor(file.name);
  if (!uploadAllowed(file.name || "", type)) throw new HttpError(415, "That kind of file can't be attached.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const { url } = await storeUpload({ name: file.name || "photo.jpg", type, bytes }, user.id);
  return NextResponse.json({ url, name: file.name || "photo.jpg", type }, { status: 201 });
});
