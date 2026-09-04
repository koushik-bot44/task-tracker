import type { TaskDTO } from "./types";

export type TreeNode = {
  task: TaskDTO;
  children: TreeNode[];
};

export type FlatRow = {
  task: TaskDTO;
  depth: number;
  hasChildren: boolean;
  /** Leaf-descendant progress used for the "n/m" chip on parents. */
  doneLeaves: number;
  totalLeaves: number;
  /** True when this task or anything beneath it is BLOCKED. */
  blockedBelow: boolean;
  /** The parent's estimated completion, so a row can flag that it lands after
      the thing it belongs to. Null at the root, where there is nothing to
      outlast. */
  parentDueDate: string | null;
};

export function compareOrder(a: TaskDTO, b: TaskDTO): number {
  if (a.orderKey === b.orderKey) return a.id < b.id ? -1 : 1;
  return a.orderKey < b.orderKey ? -1 : 1;
}

/** Assemble the flat server payload into a tree. Orphans (deleted parent) are dropped. */
export function buildTree(tasks: TaskDTO[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const task of tasks) byId.set(task.id, { task, children: [] });

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.task.parentId;
    if (parentId === null) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(parentId);
    if (parent) parent.children.push(node);
    // A task whose parent is missing from this payload is intentionally skipped.
  }

  const sortRecursive = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => compareOrder(a.task, b.task));
    for (const n of nodes) sortRecursive(n.children);
  };
  sortRecursive(roots);

  return roots;
}

function isCountableLeaf(node: TreeNode): boolean {
  return node.children.length === 0;
}

/** Done leaves / total leaves, per the product's rollup rule. Cancelled leaves are excluded. */
export function leafProgress(node: TreeNode): { done: number; total: number } {
  if (isCountableLeaf(node)) {
    if (node.task.status === "CANCELLED") return { done: 0, total: 0 };
    return { done: node.task.status === "DONE" ? 1 : 0, total: 1 };
  }
  let done = 0;
  let total = 0;
  for (const child of node.children) {
    const p = leafProgress(child);
    done += p.done;
    total += p.total;
  }
  return { done, total };
}

export function hasBlockedInSubtree(node: TreeNode): boolean {
  if (node.task.status === "BLOCKED") return true;
  return node.children.some(hasBlockedInSubtree);
}

/**
 * Depth-first walk producing exactly the rows that should render, honouring
 * collapse state. This list is the single source of truth for keyboard
 * navigation and for dnd-kit's sortable ordering.
 */
export function flattenTree(roots: TreeNode[], collapsed: Set<string>): FlatRow[] {
  const rows: FlatRow[] = [];

  const walk = (nodes: TreeNode[], depth: number, parentDue: string | null) => {
    for (const node of nodes) {
      const progress = leafProgress(node);
      rows.push({
        task: node.task,
        depth,
        hasChildren: node.children.length > 0,
        doneLeaves: progress.done,
        totalLeaves: progress.total,
        blockedBelow: node.children.some(hasBlockedInSubtree),
        parentDueDate: parentDue,
      });
      if (node.children.length > 0 && !collapsed.has(node.task.id)) {
        walk(node.children, depth + 1, node.task.dueDate);
      }
    }
  };

  walk(roots, 0, null);
  return rows;
}

/**
 * Leaf rollup for EVERY task in a flat list, keyed by id.
 *
 * The tree already carries this per row and the Tool Overview computes it for
 * roots; the board had nothing. Rather than let a third caller write its own
 * version — the parallel-logic law — everyone reads this map, and it is built
 * from `leafProgress`, the same function the rings and the overview use.
 *
 * `hasChildren` is returned alongside because "show a percentage" is a
 * question about parenthood, not about the numbers: a leaf legitimately
 * reports 1/1 when it is done, and that is not a 100%-complete container.
 */
export function leafProgressByTask(
  tasks: TaskDTO[],
): Map<string, { done: number; total: number; hasChildren: boolean }> {
  const out = new Map<string, { done: number; total: number; hasChildren: boolean }>();
  const walk = (node: TreeNode) => {
    const p = leafProgress(node);
    out.set(node.task.id, { ...p, hasChildren: node.children.length > 0 });
    for (const child of node.children) walk(child);
  };
  for (const root of buildTree(tasks)) walk(root);
  return out;
}

/** Every descendant id of `id`, not including `id` itself. */
export function descendantIds(tasks: TaskDTO[], id: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.parentId) continue;
    const list = childrenOf.get(t.parentId);
    if (list) list.push(t.id);
    else childrenOf.set(t.parentId, [t.id]);
  }
  const out: string[] = [];
  const stack = [...(childrenOf.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop() as string;
    out.push(next);
    stack.push(...(childrenOf.get(next) ?? []));
  }
  return out;
}

/**
 * True for an ABANDONED row: untitled and carrying nothing the user actually
 * authored — no description, notes, tags, links, deliverable, confirmed date,
 * passed gates, or children.
 *
 * Pressing Enter / "+" / "Add subtask" mints a task immediately, so walking
 * away without naming it leaves a blank row behind; those are discarded when you
 * leave (blur or close the panel). An UNTITLED task must not be kept — but the
 * test still has to spare real work that merely has no name yet. The two things
 * a row can carry that the user did NOT choose are the surface's defaults: a
 * PROVISIONAL due date (a project root and a board card are both minted with the
 * auto-guess) and the status the column/tree stamped on it — neither counts as
 * content here. A date the user actually CONFIRMED, or any other field, is real
 * intent and protects the row; `completedAt` keeps a Done task from silent
 * removal. Deliberate deletes (Backspace, the trash) still toast with Undo.
 */
export function isBlankStub(task: TaskDTO, tasks: TaskDTO[]): boolean {
  const parent = task.parentId ? tasks.find((t) => t.id === task.parentId) : undefined;
  // A date is the user's real intent only if they set it ON THIS task: not the provisional
  // auto-guess a root/board card is minted with, and not simply the parent's date inherited
  // by a subtask. Either of those alone must not keep an untitled row alive.
  const hasOwnDate =
    task.dueDate !== null &&
    !task.dueProvisional &&
    !(parent && parent.dueDate === task.dueDate);
  return (
    task.title.trim() === "" &&
    task.descriptionMd.trim() === "" &&
    task.tags.length === 0 &&
    task.links.length === 0 &&
    task.noteCount === 0 &&
    !task.hasDescription &&
    task.deliverableUrl === null &&
    !hasOwnDate &&
    task.pinnedAt === null &&
    task.completedAt === null &&
    !task.gates.some((g) => g.done) &&
    !tasks.some((t) => t.parentId === task.id && t.deletedAt === null)
  );
}

/** Siblings of a given parent, in order. */
export function siblingsOf(tasks: TaskDTO[], parentId: string | null): TaskDTO[] {
  return tasks.filter((t) => t.parentId === parentId).sort(compareOrder);
}
