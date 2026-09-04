"use client";

import type { ReactNode } from "react";

/* Date helpers — keys are "YYYY-MM-DD" in IST, produced by the server. We read
   them as UTC so the calendar date never shifts under the browser's timezone. */
export const asUTC = (key: string) => new Date(`${key}T00:00:00.000Z`);
export const addDays = (key: string, n: number) => {
  const d = asUTC(key);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const weekdayShort = (key: string) => asUTC(key).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
export const weekdayInitial = (key: string) => weekdayShort(key).slice(0, 1);
export const prettyDate = (key: string) =>
  `${asUTC(key).getUTCDate()} ${asUTC(key).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}`;

/** "1–7 Sep" style label for a Mon..Sun week. */
export const weekLabel = (days: string[]) => {
  if (days.length < 7) return "";
  const a = asUTC(days[0]);
  const b = asUTC(days[6]);
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${month(b)}`
    : `${a.getUTCDate()} ${month(a)} – ${b.getUTCDate()} ${month(b)}`;
};

// Glass input (phase 46): the Well Being tab is the only place inputCls is used, so it
// carries the frosted-glass treatment (pk-input reads --pk-* from the scene ancestor).
export const inputCls =
  "pk-input h-11 w-full rounded-input px-3 text-sm outline-none transition-colors duration-150 ease-out";

export function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="pk-fg-soft mb-1 block text-micro font-medium">{label}</span>
      {children}
    </label>
  );
}
