import type { TaskDTO } from "./types";

/**
 * Local-time week boundaries. The Changelog is read by a human in their own
 * timezone, so "this week" should mean their week — unlike the overview
 * endpoint, which has no timezone to work from and buckets in UTC.
 */
export function startOfIsoWeekLocal(date: Date): Date {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const sinceMonday = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - sinceMonday);
  return day;
}

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function startOfDayLocal(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * "Ancestor › Path › Task title" — the trail that makes a one-line changelog
 * entry legible without opening anything. Root-level tasks get no prefix.
 */
/** Just the ancestors, without the task itself — for two-line row layouts. */
export function ancestorTrail(task: TaskDTO, byId: Map<string, TaskDTO>): string {
  const parts: string[] = [];
  let cursor = task.parentId ? byId.get(task.parentId) : undefined;
  let guard = 0;
  while (cursor && guard++ < 50) {
    parts.unshift(cursor.title || "Untitled");
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return parts.join(" › ");
}

export function ancestorPath(task: TaskDTO, byId: Map<string, TaskDTO>): string {
  const parts: string[] = [];
  let cursor = task.parentId ? byId.get(task.parentId) : undefined;
  let guard = 0;
  while (cursor && guard++ < 50) {
    parts.unshift(cursor.title || "Untitled");
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  parts.push(task.title || "Untitled");
  return parts.join(" › ");
}
