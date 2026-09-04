import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The 2px line + chevron between PROJECT START and the first box, and
 * between boxes — the owner's sketch, drawn literally.
 */
export function Connector({ className, height = 28 }: { className?: string; height?: number }) {
  return (
    <div className={cn("flex flex-col items-center", className)} aria-hidden>
      <span className="w-0.5 rounded-full bg-guide" style={{ height }} />
      <ChevronDown className="-mt-1.5 h-4 w-4 text-muted" strokeWidth={2.25} />
    </div>
  );
}
