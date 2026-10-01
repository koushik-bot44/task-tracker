import { NextResponse } from "next/server";
import { emailConfigured } from "@/lib/email";
import { requireSignedIn, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who is signed in, for the profile menu every account wears (2026-10-01) —
 * the walled family logins too, which cannot reach /api/users/me. `emailReady`
 * says whether "Email me a reset link" can work on this site.
 */
export const GET = route(async () => {
  const user = await requireSignedIn();
  return NextResponse.json({ name: user.name, email: user.email, role: user.role, emailReady: emailConfigured() });
});
