import type { FlatRow } from "./tree";
import type { TaskDTO } from "./types";

export type Projection = {
  depth: number;
  parentId: string | null;
  prevSibling?: TaskDTO;
  nextSibling?: TaskDTO;
};

function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const copy = items.slice();
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

/**
 * Where a drag would actually land. Vertical position picks the slot; horizontal
 * offset picks the depth, clamped to what the neighbouring rows allow — you can
 * never become a child of a row that is not directly above you.
 */
export function getProjection(
  rows: FlatRow[],
  activeId: string,
  overId: string,
  dragOffsetX: number,
  indentWidth: number,
): Projection | null {
  const activeIndex = rows.findIndex((r) => r.task.id === activeId);
  const overIndex = rows.findIndex((r) => r.task.id === overId);
  if (activeIndex === -1 || overIndex === -1) return null;

  const reordered = arrayMove(rows, activeIndex, overIndex);
  const prevRow = reordered[overIndex - 1];
  const nextRow = reordered[overIndex + 1];

  const dragDepth = Math.round(dragOffsetX / indentWidth);
  const projectedDepth = rows[activeIndex].depth + dragDepth;
  const maxDepth = prevRow ? prevRow.depth + 1 : 0;
  const minDepth = nextRow ? nextRow.depth : 0;
  const depth = Math.min(Math.max(projectedDepth, minDepth), maxDepth);

  let parentId: string | null;
  if (depth === 0 || !prevRow) {
    parentId = null;
  } else if (depth === prevRow.depth) {
    parentId = prevRow.task.parentId;
  } else if (depth > prevRow.depth) {
    parentId = prevRow.task.id;
  } else {
    // Dropped shallower than the row above: inherit from the nearest ancestor
    // row that already sits at the target depth.
    const shallower = reordered
      .slice(0, overIndex)
      .reverse()
      .find((r) => r.depth === depth);
    parentId = shallower?.task.parentId ?? null;
  }

  // Neighbours at the target depth decide the fractional key.
  let prevSibling: TaskDTO | undefined;
  for (let i = overIndex - 1; i >= 0; i--) {
    const row = reordered[i];
    if (row.depth < depth) break;
    if (row.depth === depth) {
      prevSibling = row.task;
      break;
    }
  }

  let nextSibling: TaskDTO | undefined;
  for (let i = overIndex + 1; i < reordered.length; i++) {
    const row = reordered[i];
    if (row.depth < depth) break;
    if (row.depth === depth) {
      nextSibling = row.task;
      break;
    }
  }

  return { depth, parentId, prevSibling, nextSibling };
}
