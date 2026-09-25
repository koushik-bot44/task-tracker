/* Security headers on every response (2026-09-11). Framing only by Orbit itself
   (the PDF reader's fallback frames an uploaded file); no plugins; forms post only
   here; no type sniffing; only the origin in the referrer when leaving; no
   microphone, location, payment or USB for the page. The camera is left alone: a
   phone photo comes through the file picker. Scripts are not restricted yet — the
   layout's two inline scripts and Next's own would need nonces first. */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // geolocation=(self): the son's "Check in" asks the phone once for its position (2026-09-25).
  { key: "Permissions-Policy", value: "microphone=(), geolocation=(self), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  /* Restructure (2026-09-04): the old screens fold into the five tabs. Every
     old address lands somewhere sensible instead of a 404 — bookmarks, the
     bell's stored urls and old emails all keep working. */
  async redirects() {
    return [
      { source: "/focus", destination: "/", permanent: false },
      { source: "/review", destination: "/", permanent: false },
      { source: "/changelog", destination: "/projects", permanent: false },
      { source: "/meetings", destination: "/calendar", permanent: false },
      { source: "/meetings/:path*", destination: "/calendar", permanent: false },
      { source: "/t/:slug", destination: "/project/:slug", permanent: false },
      { source: "/t/:slug/:rest*", destination: "/project/:slug", permanent: false },
      { source: "/department/:id", destination: "/projects", permanent: false },
      { source: "/settings/users", destination: "/people", permanent: false },
    ];
  },
  webpack(config) {
    // pdf.js reaches for "canvas" only when it runs under Node, which it never
    // does here — the PDF reader loads in the browser alone (2026-09-10). Its
    // browser field already says so; the server build needs telling too.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

export default nextConfig;
