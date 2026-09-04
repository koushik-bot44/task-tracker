import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth";

/** Paths reachable without a session. Everything else is guarded. */
// /api/cron enforces its own CRON_SECRET (Vercel Cron carries no session
// cookie). /invite + /api/invite are the set-password onboarding, reached by a
// PENDING user who is not logged in yet. /r/<token> is the emailed meeting
// reply link (restructure): the signed token in the URL is the authorisation.
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/cron", "/invite", "/api/invite", "/forgot", "/api/password-reset/request", "/r"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Authentication itself stays reachable so a PERSON can sign out.
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/") || pathname === "/login") {
    return NextResponse.next();
  }

  const claims = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (claims) {
    // Phase 35 — the PERSON wall at the edge. A PERSON login reaches ONLY its
    // own routine screen (/person) and its own routine API (/api/routine/kid).
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
    // The family (Well Being) page belongs to the CEO alone (owner, 2026-09-04); its APIs enforce the same.
    if (pathname.startsWith("/routine") && claims.role !== "FOUNDER") {
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

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)",
  ],
};
