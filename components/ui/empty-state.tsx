import { cn } from "@/lib/cn";

/** One sentence, sometimes one button. Never a picture of nothing. */
export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("card flex flex-col items-center gap-2 px-4 py-8 text-center", className)}>
      <p className="text-row font-medium text-ink">{title}</p>
      {body ? <p className="max-w-xs text-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Something went wrong, with the one thing to do about it. */
export function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-4 py-8 text-center">
      <p className="text-row font-medium text-ink">Couldn&apos;t load this</p>
      <p className="max-w-xs text-sm text-muted">{message ?? "Check your connection and try again."}</p>
      <button type="button" onClick={onRetry} className="press mt-2 h-11 rounded-input bg-hover px-4 text-sm font-semibold text-ink">
        Retry
      </button>
    </div>
  );
}
