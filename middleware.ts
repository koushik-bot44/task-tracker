import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth";

/** Paths reachable without a session. Everything else is guarded. */
// /api/cron enforces its own CRON_SECRET (Vercel Cron carries no session
// cookie). /invite + /api/invite are the set-password onboarding, reached by a
// PENDING user who is not logged in yet. /r/<token> is the emailed meeting
// reply link (restructure): the signed token in the URL is the authorisation.
// /api/routine/feed/<token> (2026-09-25) is where a location app on the tracked
// person's phone posts positions: no cookie, the secret in the path is the authorisation.
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/cron", "/invite", "/api/invite", "/forgot", "/api/password-reset/request", "/r", "/api/routine/feed"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Authentication itself stays reachable so a PERSON can sign out.
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/") || pathname === "/login") {
    return NextResponse.next();
  }

  const claims = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (claims) {
    // Phase 35 — the PERSON wall at the edge. A PERSON login reaches ONLY the
    // family area: its own screen (/person), and since 2026-09-25 the co-parent's
    // (/family) and the tutor's (/mentor), plus the routine API. Which of the three
    // it is — and so which routine endpoints answer — is settled by the handlers
    // (requirePerson / requireManager / requireMentor read the data); the edge
    // only keeps every one of them out of the work app.
    const isPerson = claims.role === "PERSON";
    const walledScreen = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
    const personArea = walledScreen("/person") || walledScreen("/family") || walledScreen("/mentor") || pathname.startsWith("/api/routine");
    if (isPerson && !personArea) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Not available for this account." }, { status: 403 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/person";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (!isPerson && (walledScreen("/person") || walledScreen("/family") || walledScreen("/mentor"))) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    // The accounts admin has no work screens — the app already hides the tabs,
    // but typing the address (or a stale bookmark) landed them on an empty
    // Today or Projects while the page fired 403s underneath (owner sweep,
    // 2026-09-08). Send them where they belong.
    if (claims.role === "ADMIN" && !pathname.startsWith("/api/")) {
      const adminArea =
        pathname === "/people" ||
        pathname.startsWith("/people/") ||
        pathname.startsWith("/settings") ||
        pathname === "/my-space" ||
        pathname === "/login";
      if (!adminArea) {
        const url = req.nextUrl.clone();
        url.pathname = "/people";
        url.search = "";
        return NextResponse.redirect(url);
      }
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
