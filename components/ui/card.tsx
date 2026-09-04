import { cn } from "@/lib/cn";

/**
 * The card: white, radius 16, ONE soft shadow, no border. The only border in
 * the app is the CURRENT milestone box's accent, which `accent` turns on.
 */
export function Card({
  children,
  className,
  accent = false,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  accent?: boolean;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Tag className={cn("card", accent && "ring-2 ring-primary", className)}>{children}</Tag>
  );
}
