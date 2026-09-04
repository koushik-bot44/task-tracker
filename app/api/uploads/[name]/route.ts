import { NextResponse } from "next/server";
import { contentTypeFor, readDevUpload } from "@/lib/uploads";
import { requireUser, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { name: string } };

/** Local development only: serve a file the disk fallback stored. */
export const GET = route(async (_req: Request, { params }: Params) => {
  await requireUser();
  const bytes = await readDevUpload(params.name);
  if (!bytes) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "content-type": contentTypeFor(params.name), "cache-control": "private, max-age=3600" },
  });
});
