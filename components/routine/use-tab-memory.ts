"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * A choice that belongs to this browser tab (2026-10-02): the open tab, the week,
 * the picked day. Kept in sessionStorage, so a reload — or a tab the phone dropped
 * from Recents and brings back — opens where the person left it, while a new tab
 * starts fresh. `valid` turns away an old or odd stored value; blocked storage just
 * means nothing is remembered. Read on the first render: every screen that uses it
 * draws nothing from it until its data has loaded in the browser, so the server's
 * HTML never differs from the first client render.
 */
export function useTabMemory<T>(key: string, initial: T, valid: (v: unknown) => v is T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = typeof window === "undefined" ? null : window.sessionStorage.getItem(key);
      if (raw !== null) {
        const stored: unknown = JSON.parse(raw);
        if (valid(stored)) return stored;
      }
    } catch {
      /* blocked or unreadable: start fresh */
    }
    return initial;
  });

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* blocked or full: just not remembered */
    }
  }, [key, value]);

  return [value, setValue];
}

/** null (= the server's today / this week) or a "YYYY-MM-DD" day key. */
export const isDayOrNull = (v: unknown): v is string | null => v === null || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v));
/** null (= this month) or a "YYYY-MM" month key. */
export const isMonthOrNull = (v: unknown): v is string | null => v === null || (typeof v === "string" && /^\d{4}-\d{2}$/.test(v));
/** One of a fixed set of names (a tab id). */
export const oneOf =
  <T extends string>(names: readonly T[]) =>
  (v: unknown): v is T =>
    typeof v === "string" && (names as readonly string[]).includes(v);
