import { cn } from "@/lib/cn";

/** Loading rows. `.animate-pulse` is what the screenshot rig waits on. */
export function Skeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-card bg-hover" />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return <div className={cn("h-28 animate-pulse rounded-card bg-hover", className)} aria-hidden />;
}
