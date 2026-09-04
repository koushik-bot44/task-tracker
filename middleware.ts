import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth";

/** Paths reachable without a session. Everything else is guarded. */
// /api/cron enforces its own CRON_SECRET (Vercel Cron carries no session
// cookie). /invite + /api/invite are the set-password onboarding, reached by a
// PENDING user who is not logged in yet.
// /collab-invite + /api/collaboration-invites/respond are the emailed accept/
// decline flow (phase 18): the invited manager clicks from their inbox without a
// session, and the signed token in the URL is the authorization.
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/cron", "/invite", "/api/invite", "/forgot", "/api/password-reset/request", "/collab-invite", "/api/collaboration-invites/respond"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Authentication itself stays reachable so a PERSON can sign out. All other
  // nominally public paths are evaluated only after an existing session's role
  // is checked below; this prevents token/invite/cron work surfaces bypassing
  // the PERSON wall merely because they also support logged-out visitors.
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/") || pathname === "/login") {
    return NextResponse.next();
  }

  // Edge can only check the signature and shape; whether the account is still
  // enabled is settled per-request by requireUser() in the handlers.
  const claims = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (claims) {
    // Phase 35 — the PERSON wall at the edge (was CHILD). A PERSON login reaches
    // ONLY its own routine screen (/person) and its own routine API (/api/routine/kid).
    // Any other page is redirected to /person; any other API is a 403 — so a PERSON
    // never even reaches a work page or handler. A work user, conversely, is
    // bounced off /person. (The handlers enforce this again via requireUser/requirePerson.)
    const isPerson = claims.role === "PERSON";
    const personArea =
      pathname === "/person" || pathname.startsWith("/person/") || pathname.startsWith("/api/routine/kid");
    if (isPerson && !personArea) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Not available for this account." }, { status: 403 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/person";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (!isPerson && (pathname === "/person" || pathname.startsWith("/person/"))) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    // The family management page itself is manager-only (its APIs independently
    // enforce the same rule). Other work roles never enter or navigate to it.
    if (pathname.startsWith("/routine") && claims.role !== "MANAGER") {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // API callers get a status they can act on; humans get sent to the door.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // The PWA shell must be reachable without a session: the browser fetches the
  // manifest and service worker before anyone logs in, and the SW must control
  // "/" to make the app installable. These are public static files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)",
  ],
};
