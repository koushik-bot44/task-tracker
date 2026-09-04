/**
 * A task's title, or a visibly absent stand-in.
 *
 * Blank rows are discarded on blur, but a row that carries real work under no
 * name survives on purpose — so "Untitled" has to read as a missing name
 * rather than as one. Muted italic says absent; plain text would let it pass
 * for a task somebody actually called Untitled.
 */
export function TaskTitle({ title }: { title: string }) {
  if (title.trim() !== "") return <>{title}</>;
  return <span className="italic text-muted">Untitled</span>;
}
