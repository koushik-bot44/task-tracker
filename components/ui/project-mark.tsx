"use client";

import {
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Camera,
  Car,
  Coffee,
  FileText,
  Globe,
  Heart,
  Leaf,
  LineChart,
  Megaphone,
  Monitor,
  Music,
  Palette,
  Rocket,
  ShoppingCart,
  Smartphone,
  Star,
  Truck,
  Users,
  Webhook,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { tileColors, type ProjectIconName } from "@/lib/project-look";

export const PROJECT_ICONS: Record<ProjectIconName, { Icon: LucideIcon; label: string }> = {
  rocket: { Icon: Rocket, label: "Launch" },
  globe: { Icon: Globe, label: "Website" },
  smartphone: { Icon: Smartphone, label: "App" },
  monitor: { Icon: Monitor, label: "Software" },
  "shopping-cart": { Icon: ShoppingCart, label: "Shop" },
  briefcase: { Icon: Briefcase, label: "Business" },
  megaphone: { Icon: Megaphone, label: "Marketing" },
  "book-open": { Icon: BookOpen, label: "Learning" },
  wrench: { Icon: Wrench, label: "Fix" },
  "building-2": { Icon: Building2, label: "Office" },
  car: { Icon: Car, label: "Vehicles" },
  heart: { Icon: Heart, label: "Care" },
  camera: { Icon: Camera, label: "Media" },
  music: { Icon: Music, label: "Music" },
  palette: { Icon: Palette, label: "Design" },
  truck: { Icon: Truck, label: "Delivery" },
  webhook: { Icon: Webhook, label: "Integration" },
  "line-chart": { Icon: LineChart, label: "Numbers" },
  users: { Icon: Users, label: "People" },
  calendar: { Icon: Calendar, label: "Event" },
  "file-text": { Icon: FileText, label: "Paperwork" },
  coffee: { Icon: Coffee, label: "Break" },
  leaf: { Icon: Leaf, label: "Growth" },
  star: { Icon: Star, label: "Special" },
};

export function projectIcon(name: string | null | undefined): LucideIcon | null {
  if (!name) return null;
  return (PROJECT_ICONS as Record<string, { Icon: LucideIcon } | undefined>)[name]?.Icon ?? null;
}

/**
 * A project's mark: its uploaded logo, else its icon on a tile in its own
 * colour, else the first letter of its name on that tile. The same on the
 * card, the project header and anywhere else a project is named.
 */
export function ProjectMark({
  name,
  color,
  icon,
  logoUrl,
  size = "md",
  className,
}: {
  name: string;
  color: string;
  icon: string | null;
  logoUrl: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { bg, fg } = tileColors(color);
  const Icon = projectIcon(icon);
  const dim = size === "sm" ? "h-8 w-8 rounded-lg" : size === "lg" ? "h-14 w-14 rounded-card" : "h-11 w-11 rounded-input";
  const glyph = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-7 w-7" : "h-5 w-5";
  const letter = size === "sm" ? "text-sm" : size === "lg" ? "text-page" : "text-row";
  const initial = (name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase();

  if (logoUrl) {
    return (
      <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-surface-2", dim, className)} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- a user's own logo, any host */}
        <img src={logoUrl} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span className={cn("grid shrink-0 place-items-center font-semibold", dim, letter, className)} style={{ background: bg, color: fg }} aria-hidden>
      {Icon ? <Icon className={glyph} strokeWidth={1.9} /> : initial}
    </span>
  );
}
