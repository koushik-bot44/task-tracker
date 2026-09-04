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
        guide: "var(--guide)",
        "surface-2": "var(--surface-2)",
        "primary-soft": "var(--primary-soft)",
        "accent-soft": "var(--accent-soft)",
        "ok-soft": "var(--ok-soft)",
        "info-soft": "var(--info-soft)",
        "danger-soft": "var(--danger-soft)",
        "warn-soft": "var(--warn-soft)",
        hover: "var(--hover)",
        pressed: "var(--pressed)",
        scrim: "var(--scrim)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      /* The restructure scale: 17 for rows and body, 15 for secondary, 13 for
         meta — nothing under 13px anywhere. Headings 20 / 24. */
      fontSize: {
        micro: ["0.8125rem", { lineHeight: "1.125rem" }],
        xs: ["0.8125rem", { lineHeight: "1.125rem" }],
        sm: ["0.9375rem", { lineHeight: "1.375rem" }],
        row: ["1.0625rem", { lineHeight: "1.5rem" }],
        base: ["1.0625rem", { lineHeight: "1.5rem" }],
        lg: ["1.0625rem", { lineHeight: "1.5rem" }],
        section: ["1.25rem", { lineHeight: "1.6rem", letterSpacing: "-0.01em" }],
        page: ["1.5rem", { lineHeight: "1.85rem", letterSpacing: "-0.015em" }],
        "page-lg": ["1.75rem", { lineHeight: "2.1rem", letterSpacing: "-0.015em" }],
        display: ["2.25rem", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
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
      maxWidth: {
        content: "760px",
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
