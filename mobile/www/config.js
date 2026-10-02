// The family's Orbit address. With it set, the pairing screen asks ONLY for the
// 8-letter code (owner, 2026-10-02: "code is enough"); a small link still lets a
// developer point the app at another server. Release builds refuse plain http://
// except for a local development server.
window.ORBIT_CONFIG = {
  serverUrl: "https://orbittasktracker.vercel.app",
};
