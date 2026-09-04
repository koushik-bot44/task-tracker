"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Pin } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { TaskTitle } from "@/components/task-title";
import { cn } from "@/lib/cn";
import { apiPatch } from "@/lib/api";
import { usePanelParams } from "@/lib/hooks/use-panel";
import { useProjects } from "@/lib/hooks/use-projects";
import { allTasksKey, useAllTasks } from "@/lib/hooks/use-tasks";
import { startOfDayLocal } from "@/lib/weeks";
import type { Status, TaskDTO } from "@/lib/types";
import { DuePill } from "@/components/tree/task-meta";

const CLOSED: Status[] = ["DONE", "CANCELLED"];

export function FocusView() {
  const { data: tasks, isLoading } = useAllTasks();
  const { data: projects } = useProjects();
  const { openTask } = usePanelParams();
  const qc = useQueryClient();

  const reduce = useReducedMotion();
  const projectById = useMemo(
    () => new Map((projects ?? []).map((p) => [p.id, p])),
    [projects],
  );

  // Checking a task off marks it DONE, which drops it from Overdue/Today. Rather
  // than vanish instantly (which reads as broken), a just-checked task LINGERS in
  // place — shown ticked — for a beat, then eases out. `justDone` holds those ids.
  const [justDone, setJustDone] = useState<Set<string>>(() => new Set());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const LINGER_MS = 1000;

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) =>
      apiPatch<TaskDTO>(`/api/tasks/${id}`, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: allTasksKey });
      const previous = qc.getQueryData<TaskDTO[]>(allTasksKey) ?? [];
      qc.setQueryData<TaskDTO[]>(
        allTasksKey,
        previous.map((t) => (t.id === id ? { ...t, status } : t)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(allTasksKey, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  const unpin = useMutation({
    mutationFn: (id: string) => apiPatch<TaskDTO>(`/api/tasks/${id}`, { pinnedAt: null }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: allTasksKey });
      const previous = qc.getQueryData<TaskDTO[]>(allTasksKey) ?? [];
      qc.setQueryData<TaskDTO[]>(
        allTasksKey,
        previous.map((t) => (t.id === id ? { ...t, pinnedAt: null } : t)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(allTasksKey, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  // Toggle done from the checkbox. Marking done keeps the row visible (ticked) for
  // a beat before the filter drops it; un-checking restores it immediately.
  const toggleDone = (task: TaskDTO) => {
    const wasDone = task.status === "DONE";
    const clearTimer = () => {
      const t = timers.current.get(task.id);
      if (t) { clearTimeout(t); timers.current.delete(task.id); }
    };
    if (wasDone) {
      clearTimer();
      setJustDone((s) => { const n = new Set(s); n.delete(task.id); return n; });
      setStatus.mutate({ id: task.id, status: "BACKLOG" });
      return;
    }
    setJustDone((s) => new Set(s).add(task.id));
    setStatus.mutate({ id: task.id, status: "DONE" });
    clearTimer();
    timers.current.set(
      task.id,
      setTimeout(() => {
        timers.current.delete(task.id);
        setJustDone((s) => { const n = new Set(s); n.delete(task.id); return n; });
      }, LINGER_MS),
    );
  };

  const { overdue, today, pinned } = useMemo(() => {
    const all = tasks ?? [];
    const midnight = startOfDayLocal(new Date()).getTime();
    // A just-checked task is DONE but lingers in its section until its timer fires.
    const open = all.filter((t) => !CLOSED.includes(t.status) || justDone.has(t.id));

    const dueDay = (t: TaskDTO) =>
      t.dueDate ? startOfDayLocal(new Date(t.dueDate)).getTime() : null;

    return {
      overdue: open
        .filter((t) => {
          const d = dueDay(t);
          return d !== null && d < midnight;
        })
        .sort((a, b) => Date.parse(a.dueDate as string) - Date.parse(b.dueDate as string)),
      today: open.filter((t) => dueDay(t) === midnight),
      pinned: all
        .filter((t) => t.pinnedAt !== null)
        .sort((a, b) => Date.parse(b.pinnedAt as string) - Date.parse(a.pinnedAt as string)),
    };
  }, [tasks, justDone]);

  const empty =
    !isLoading && overdue.length === 0 && today.length === 0 && pinned.length === 0;

  return (
    <div className="max-w-3xl px-4 py-4 sm:px-8 sm:py-6">
      {/* The app bar already says Focus. */}
      <p className="text-sm text-muted">
        What is late, what is due today, and whatever you pinned.
      </p>

      {isLoading ? (
        <div className="mt-5 space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-hover" />
          ))}
        </div>
      ) : empty ? (
        <div className="mt-16 text-center">
          <p className="font-display text-lg text-ink">Nothing due.</p>
          <p className="mt-1 text-sm text-muted">Pin what matters.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          {/* Sections stay visible when empty. Hiding them made the page look
              broken and hid the fact that Today and Pinned exist at all. */}
          <Section title="Overdue" tone="danger" tasks={overdue} empty="Nothing late." />
          <Section title="Today" tone="warn" tasks={today} empty="Nothing due today." />
          <Section
            title="Pinned"
            tone="muted"
            tasks={pinned}
            showPin
            empty="Nothing pinned yet — pin a task to keep it here."
          />
        </div>
      )}
    </div>
  );

  function Section({
    title,
    tone,
    tasks: rows,
    showPin = false,
    empty: emptyLine,
  }: {
    title: string;
    tone: "danger" | "warn" | "muted";
    tasks: TaskDTO[];
    showPin?: boolean;
    empty: string;
  }) {
    return (
      <section>
        <h2 className="flex items-center gap-2 px-1 pb-1.5 text-micro font-medium uppercase tracking-widest text-muted">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              tone === "danger" && "bg-danger",
              tone === "warn" && "bg-warn",
              tone === "muted" && "bg-muted",
            )}
            aria-hidden
          />
          {title}
          <span className="tabular-nums">{rows.length}</span>
        </h2>

        {rows.length === 0 ? (
          <p className="flex h-12 items-center rounded-card border border-dashed border-line px-3 text-sm text-muted">
            {emptyLine}
          </p>
        ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          <AnimatePresence initial={false}>
          {rows.map((task) => {
            const tool = projectById.get(task.projectId ?? "");
            const done = task.status === "DONE";
            return (
              /* Fixed height. A measurement probe showed the checkbox, title,
                 tool chip and pill were already centred on one axis to the
                 pixel — what made the list look ragged was rows differing by
                 1px depending on their content. The axis is only as steady as
                 the row that carries it. */
              <motion.li
                key={task.id}
                layout
                initial={false}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: reduce ? 0 : 0.26, ease: [0.16, 1, 0.3, 1] }}
                className="flex h-12 items-center gap-1 overflow-hidden pr-2"
              >
                <button
                  type="button"
                  onClick={() => toggleDone(task)}
                  role="checkbox"
                  aria-checked={done}
                  aria-label={`Toggle ${task.title || "Untitled"} done`}
                  className="grid h-11 w-11 shrink-0 place-items-center"
                >
                  <span
                    className={cn(
                      "grid h-[18px] w-[18px] place-items-center rounded-full border transition-colors duration-150 ease-out",
                      done ? "border-primary bg-primary" : "border-muted",
                    )}
                  >
                    {done ? (
                      <svg viewBox="0 0 20 20" className="h-3 w-3 text-bg" aria-hidden>
                        <path
                          d="M4.5 10.5l3.5 3.5 7.5-8"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => openTask(task.id)}
                  className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      done ? "text-muted" : "text-ink",
                    )}
                  >
                    <TaskTitle title={task.title} />
                  </span>
                  {/* The name stays on small screens too: a bare coloured dot
                      does not tell anyone which tool this belongs to. */}
                  {tool ? (
                    <span className="flex min-w-0 shrink items-center gap-1 text-micro text-muted">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: tool.color }}
                        aria-hidden
                      />
                      <span className="truncate">{tool.name}</span>
                    </span>
                  ) : null}
                  <DuePill due={task.dueDate} status={task.status} provisional={task.dueProvisional} />
                </button>

                {showPin ? (
                  <button
                    type="button"
                    onClick={() => unpin.mutate(task.id)}
                    aria-label={`Remove ${task.title || "Untitled"} from Focus`}
                    title="Remove from Focus"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-card text-warn-ink transition-colors duration-150 ease-out hover:bg-hover"
                  >
                    <Pin className="h-4 w-4" strokeWidth={1.75} fill="currentColor" aria-hidden />
                  </button>
                ) : null}
              </motion.li>
            );
          })}
          </AnimatePresence>
        </ul>
        )}
      </section>
    );
  }
}
