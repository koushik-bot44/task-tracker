import { generateKeyBetween } from "fractional-indexing";
import { compareOrder, siblingsOf } from "./tree";
import type { TaskDTO } from "./types";

/**
 * `generateKeyBetween` throws if the bounds are not strictly increasing, which
 * can happen if two devices ever land identical keys. Falling back to
 * "append after `a`" keeps a reorder from turning into an error toast.
 */
function keyBetween(a: string | null, b: string | null): string {
  try {
    return generateKeyBetween(a, b);
  } catch {
    return generateKeyBetween(a, null);
  }
}

/** Key that places a new row directly after `afterId` among its siblings. */
export function keyAfter(
  tasks: TaskDTO[],
  parentId: string | null,
  afterId: string | null,
): string {
  const siblings = siblingsOf(tasks, parentId);
  if (afterId === null) {
    return keyBetween(null, siblings[0]?.orderKey ?? null);
  }
  const index = siblings.findIndex((t) => t.id === afterId);
  if (index === -1) {
    return keyBetween(siblings[siblings.length - 1]?.orderKey ?? null, null);
  }
  return keyBetween(siblings[index].orderKey, siblings[index + 1]?.orderKey ?? null);
}

/** Key that appends to the end of `parentId`'s children. */
export function keyAtEnd(tasks: TaskDTO[], parentId: string | null): string {
  const siblings = siblingsOf(tasks, parentId);
  return keyBetween(siblings[siblings.length - 1]?.orderKey ?? null, null);
}

/**
 * Key for moving `task` one slot up or down among its siblings.
 * Returns null when it is already at the edge.
 */
export function keyForNudge(
  tasks: TaskDTO[],
  task: TaskDTO,
  direction: "up" | "down",
): string | null {
  const siblings = siblingsOf(tasks, task.parentId);
  const index = siblings.findIndex((t) => t.id === task.id);
  if (index === -1) return null;

  if (direction === "up") {
    if (index === 0) return null;
    const before = siblings[index - 2]?.orderKey ?? null;
    const after = siblings[index - 1].orderKey;
    return keyBetween(before, after);
  }

  if (index === siblings.length - 1) return null;
  const before = siblings[index + 1].orderKey;
  const after = siblings[index + 2]?.orderKey ?? null;
  return keyBetween(before, after);
}

/**
 * Key for a drop landing at a known slot: between the sibling that will precede
 * it and the one that will follow it.
 */
export function keyBetweenSiblings(
  prev: TaskDTO | undefined,
  next: TaskDTO | undefined,
): string {
  return keyBetween(prev?.orderKey ?? null, next?.orderKey ?? null);
}

export { compareOrder };
