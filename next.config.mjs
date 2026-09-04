/** @type {import('next').NextConfig} */
const nextConfig = {
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
};

export default nextConfig;
