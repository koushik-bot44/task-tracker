"use client";

import { cn } from "@/lib/cn";

/**
 * A person, as a face: 32px circle, initials, a pastel picked from the name so
 * the same person is always the same colour. The only way a person is shown
 * on a row anywhere in Orbit.
 */
export function initialsOf(name: string): string {
  // Letters and digits only: "Rahul (Director)" is R D, not R (.
  const parts = name
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A stable hue from the name. */
function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function faceColors(name: string): { bg: string; fg: string } {
  const h = hueOf(name);
  // Light pastel fill, dark ink of the same hue — 4.5:1+ on every hue at these lightnesses.
  return { bg: `hsl(${h} 55% 88%)`, fg: `hsl(${h} 45% 28%)` };
}

export function Face({
  name,
  size = "md",
  className,
  title,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  title?: string;
}) {
  const { bg, fg } = faceColors(name);
  const dim = size === "sm" ? "h-6 w-6 text-micro" : size === "lg" ? "h-10 w-10 text-sm" : "h-8 w-8 text-micro";
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold leading-none", dim, className)}
      style={{ background: bg, color: fg }}
      title={title ?? name}
      aria-label={title ?? name}
      role="img"
    >
      {initialsOf(name)}
    </span>
  );
}

/** Up to `max` faces overlapped, then "+N". */
export function Faces({ names, max = 3, size = "md" }: { names: string[]; max?: number; size?: "sm" | "md" }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  if (names.length === 0) return null;
  return (
    <span className="flex items-center">
      {shown.map((n, i) => (
        <Face key={`${n}-${i}`} name={n} size={size} className={cn("ring-2 ring-surface", i > 0 && (size === "sm" ? "-ml-1.5" : "-ml-2"))} />
      ))}
      {rest > 0 ? <span className="ml-1.5 text-micro font-medium text-muted">+{rest}</span> : null}
    </span>
  );
}
