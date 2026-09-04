/**
 * The app's absolute base URL, resolved server-side. Every outbound ABSOLUTE
 * link (invite, collaborator-invite, password-reset, and email-template links)
 * builds on this, so a domain change never breaks them again. (Push data.url is
 * relative and resolves against the origin in the service worker, so it needs
 * nothing from here.)
 *
 * Precedence:
 *   1. APP_URL — explicit owner override; pin a custom domain without a deploy.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel's STABLE production domain.
 *      Preferred over VERCEL_URL because these links go in EMAILS: an email must
 *      point at the stable production site, never an ephemeral per-deployment or
 *      preview URL.
 *   3. VERCEL_URL — the per-deployment URL (last Vercel resort).
 *   4. the current production URL — so a missing env is never the OLD dead domain.
 *
 * Vercel's *_URL envs are bare hosts (no scheme); https:// is prepended. No
 * trailing slash. Server-only (reads process.env); do not import into a client
 * component — there is no client-side absolute-URL need today.
 */
const FALLBACK = "https://orbittasktracker.vercel.app";

export function getBaseUrl(): string {
  const raw =
    process.env.APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    FALLBACK;
  const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}
