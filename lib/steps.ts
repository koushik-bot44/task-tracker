/**
 * Project tasks are ONE level deep: a task and its steps. Older data nests
 * deeper (prod: 26 tasks at depth 2-3). Rather than rewrite those rows, every
 * project read flattens them: a row whose parent is itself a step is shown as
 * a step of the ROOT task. Nothing is lost; the drawer simply lists them.
 */
export function flattenToOneLevel<T extends { id: string; parentId: string | null }>(rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const rootOf = (r: T): string | null => {
    let cursor: T | undefined = r;
    let guard = 0;
    let root: string | null = null;
    while (cursor && cursor.parentId && guard++ < 50) {
      root = cursor.parentId;
      cursor = byId.get(cursor.parentId);
    }
    return root;
  };
  return rows.map((r) => {
    if (!r.parentId) return r;
    const parent = byId.get(r.parentId);
    if (!parent || !parent.parentId) return r;
    return { ...r, parentId: rootOf(r) };
  });
}
