import { changeOwnPassword, ownPasswordSchema } from "@/lib/own-password";
import { requireSignedIn, route } from "@/lib/session";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Change your own password from the profile menu — any account, the walled
    family logins included (2026-10-01). Same rules as the Account page. */
export const POST = route(async (req: Request) => {
  const user = await requireSignedIn();
  const parsed = await parseBody(req, ownPasswordSchema);
  if (!parsed.ok) return parsed.response;
  return changeOwnPassword(user, parsed.data.current, parsed.data.next);
});
