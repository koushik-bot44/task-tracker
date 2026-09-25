"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { RoutinePage } from "@/components/routine/routine-page";
import { ApiError } from "@/lib/api";
import { useWho } from "@/lib/hooks/use-routine";

export const dynamic = "force-dynamic";

/**
 * The co-parent's door (2026-09-25). Outside the (app) group, so there is no
 * sidebar or header — the same full-page Well Being the person's screen wears.
 * Which walled login this is comes from the server: the person goes to their own
 * screen, a tutor to theirs, anyone signed out to the login. A flaky network is
 * NOT a sign-out: only a 401/403 bounces; anything else offers "Try again"
 * (review, 2026-09-25) — and while the answer is on its way the page says so
 * instead of staying blank.
 */
export default function Page() {
  const router = useRouter();
  const who = useWho();
  const kind = who.data?.kind;
  const status = who.error instanceof ApiError ? who.error.status : null;
  const bounce = who.isError && (status === 401 || status === 403);

  useEffect(() => {
    if (bounce) router.replace("/login");
    else if (kind === "SON") router.replace("/person");
    else if (kind === "MENTOR") router.replace("/mentor");
  }, [bounce, kind, router]);

  if (kind === "FAMILY") return <RoutinePage standalone />;

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4 text-center text-sm text-muted">
      {who.isError && !bounce ? (
        <div>
          <p>Couldn’t load your page.</p>
          <button type="button" onClick={() => void who.refetch()} className="press mt-3 inline-flex h-11 items-center rounded-card bg-primary px-4 font-medium text-on-primary">
            Try again
          </button>
        </div>
      ) : (
        "Loading…"
      )}
    </div>
  );
}
