import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        raised: "var(--surface-raised)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        primary: "var(--primary)",
        "primary-ink": "var(--primary-ink)",
        "on-primary": "var(--on-primary)",
        "on-ink": "var(--on-ink)",
        "on-ink-muted": "var(--on-ink-muted)",
        "on-fill": "var(--on-fill)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        ok: "var(--ok)",
        "ok-ink": "var(--ok-ink)",
        info: "var(--info)",
        "info-ink": "var(--info-ink)",
        danger: "var(--danger)",
        "danger-ink": "var(--danger-ink)",
        warn: "var(--warn)",
        "warn-ink": "var(--warn-ink)",
        line: "var(--line)",
        "surface-2": "var(--surface-2)",
        "primary-soft": "var(--primary-soft)",
        "accent-soft": "var(--accent-soft)",
        "ok-soft": "var(--ok-soft)",
        "info-soft": "var(--info-soft)",
        "danger-soft": "var(--danger-soft)",
        "warn-soft": "var(--warn-soft)",
        hover: "var(--hover)",
        pressed: "var(--pressed)",
        "chart-idle": "var(--chart-idle)",
        "chart-done": "var(--chart-done)",
        "chart-open": "var(--chart-open)",
        "dot-off": "var(--dot-off)",
        "dot-off-warn": "var(--dot-off-warn)",
        scrim: "var(--scrim)",
      },
      fontFamily: {
        /* Phase 49b (clinical blueprint): ONE family — Geist — for everything.
           `display` stays as an alias so font-display call sites keep
           compiling; it is the same family, just heavier where it is used. */
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      /* One scale, applied everywhere: 12 meta, 14 UI, 15 row titles,
         18 section heads, 22-24 page titles, 36-44 dashboard numbers. */
      fontSize: {
        micro: ["0.75rem", { lineHeight: "1.125rem", letterSpacing: "0.01em" }],
        xs: ["0.75rem", { lineHeight: "1.125rem" }],
        sm: ["0.875rem", { lineHeight: "1.3125rem" }],
        row: ["0.9375rem", { lineHeight: "1.4rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        section: ["1.125rem", { lineHeight: "1.35rem", letterSpacing: "-0.01em" }],
        page: ["1.375rem", { lineHeight: "1.65rem", letterSpacing: "-0.015em" }],
        "page-lg": ["1.5rem", { lineHeight: "1.8rem", letterSpacing: "-0.015em" }],
        display: ["2.25rem", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "display-lg": ["2.75rem", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
      },
      borderRadius: {
        chip: "var(--r-chip)",
        input: "var(--r-input)",
        card: "var(--r-card)",
        sheet: "var(--r-sheet)",
      },
      boxShadow: {
        e1: "var(--shadow-1)",
        e2: "var(--shadow-2)",
        lift: "var(--shadow-lift)",
        drop: "var(--drop-glow)",
      },
      zIndex: {
        sticky: "10",
        drag: "40",
        drawer: "60",
        toast: "80",
        tooltip: "90",
      },
      transitionTimingFunction: {
        /* ease-out-expo. The only curve this app uses. No bounce anywhere. */
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
