"use client";

import {
  Beaker,
  Briefcase,
  Building2,
  Code2,
  Coins,
  FolderClosed,
  Headset,
  Megaphone,
  Network,
  Scale,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Truck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { faceColors } from "@/components/ui/face";
import { cn } from "@/lib/cn";

/**
 * A department's mark: a small icon that matches its name (owner, 2026-09-04:
 * "cool logos for every department, regarding their names"), on a pastel
 * square tinted from the name the same way a Face is — so Development is
 * always the same colour everywhere, and never looks like a person.
 */
const RULES: [RegExp, LucideIcon][] = [
  [/\b(r&d|research|labs?|science|innovation)\b/i, Beaker],
  [/\b(dev\w*|engineering|software|tech\w*|it)\b/i, Code2],
  [/\b(accounts?|accounting|finance|billing|payroll|treasury)\b/i, Coins],
  [/\b(hr|human|people|talent|recruit\w*)\b/i, Users],
  [/\b(ops|operations?|production|plant)\b/i, Settings2],
  [/\b(network\w*|infra\w*|servers?|cloud|admins)\b/i, Network],
  [/\b(erm|risk|compliance|audit|security|safety)\b/i, ShieldCheck],
  [/\b(legal|law|contracts?)\b/i, Scale],
  [/\b(sales|marketing|growth|brand\w*)\b/i, Megaphone],
  [/\b(support|service|helpdesk|customers?)\b/i, Headset],
  [/\b(logistics|supply|delivery|fleet|transport)\b/i, Truck],
  [/\b(procurement|purchas\w*|stores?|retail)\b/i, ShoppingBag],
  [/\b(administration|admin|office|management)\b/i, Briefcase],
  [/\b(self|personal|me)\b/i, UserRound],
  [/\b(company|corporate|head ?office)\b/i, Building2],
];

export function departmentIcon(name: string): LucideIcon {
  for (const [re, icon] of RULES) if (re.test(name)) return icon;
  return FolderClosed;
}

export function DepartmentMark({ name, size = "md", className }: { name: string; size?: "sm" | "md"; className?: string }) {
  const Icon = departmentIcon(name);
  const { bg, fg } = faceColors(name);
  const box = size === "sm" ? "h-7 w-7 rounded-lg" : "h-10 w-10 rounded-input";
  const glyph = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <span className={cn("grid shrink-0 place-items-center", box, className)} style={{ background: bg, color: fg }} aria-hidden>
      <Icon className={glyph} strokeWidth={1.9} />
    </span>
  );
}
