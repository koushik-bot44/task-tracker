"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/cn";

type Setup = { people: number; departments: number; headed: number; teams: number; projects: number; tasks: number };
const HIDDEN_KEY = "orbit-setup-hidden";

/**
 * Set up your organisation (2026-09-11): a new organisation's CEO sees the five
 * things that make Orbit useful, each ticked once it has happened and each a
 * link to where it is done. The card goes when all five are done, or when the
 * CEO hides it.
 */
export function SetupCard() {
  const { data } = useQuery({ queryKey: ["org-setup"], queryFn: () => apiGet<Setup>("/api/org/setup"), staleTime: 0 });
  // Starts hidden so a hidden card never flashes before the browser's memory is read.
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(HIDDEN_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  if (!data || hidden) return null;

  const steps = [
    {
      done: data.people > 0,
      title: "Invite your people",
      href: "/people",
      how: data.people > 0 ? `${data.people} ${data.people === 1 ? "person" : "people"} so far. People → Invite for more.` : "People → Invite. Pick their department and position, then send them the link.",
    },
    {
      done: data.headed > 0,
      title: "Name the heads of department",
      href: "/projects",
      how: `${data.headed} of ${data.departments} departments have a head. Invite someone as Head of department and they head the department you place them in.`,
    },
    { done: data.teams > 0, title: "Make teams where you need them", href: "/people", how: "People → a department → + Team." },
    { done: data.projects > 0, title: "Start a project and add its people", href: "/projects", how: "Departments → New project." },
    { done: data.tasks > 0, title: "Raise the first task", href: "/work", how: "Work → New. Given to someone, it is work in progress at once." },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  const hide = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(HIDDEN_KEY, "1");
    } catch {
      /* private mode: it returns next visit */
    }
  };

  return (
    <section aria-label="Set up your organisation" className="mb-6">
      <Card className="p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-row font-semibold text-ink">Set up your organisation</h2>
            <p className="text-micro text-muted">
              {done} of {steps.length} done
            </p>
          </div>
          <button type="button" onClick={hide} aria-label="Hide the set-up steps" className="press -mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-chip text-muted hover:text-ink">
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
        <ol className="mt-3 space-y-1">
          {steps.map((s) => (
            <li key={s.title}>
              <Link href={s.href} className="press flex items-start gap-3 rounded-input px-1 py-2 hover:bg-hover">
                <span aria-hidden className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border", s.done ? "border-transparent bg-ok-soft text-ok-ink" : "border-line text-transparent")}>
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm font-medium", s.done ? "text-muted" : "text-ink")}>
                    {s.title}
                    {s.done ? <span className="sr-only"> — done</span> : null}
                  </span>
                  <span className="block text-micro text-muted">{s.how}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}
