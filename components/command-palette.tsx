"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Command } from "cmdk";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  History,
  LayoutGrid,
  LogOut,
  Plus,
  Search,
  Tag,
  UserRound,
  Users,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QuickAddInput } from "@/components/quick-add-input";
import { useToast } from "@/components/toast";
import { formatDMY } from "@/lib/dates";
import { isAdminRole, isManagerRole } from "@/lib/roles";
import { apiPost } from "@/lib/api";
import { useProjects } from "@/lib/hooks/use-projects";
import { useMe } from "@/lib/hooks/use-users";
import { newTaskId, useTasks } from "@/lib/hooks/use-tasks";
import { parseQuickAdd } from "@/lib/quick-add";
import type { TaskDTO } from "@/lib/types";

type Mode = "list" | "quick-add";

export function CommandPalette() {
  const router = useRouter();
  const params = useParams<{ slug?: string }>();
  const reduce = useReducedMotion();
  const qc = useQueryClient();
  const { show: toast } = useToast();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("list");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const quickRef = useRef<HTMLInputElement>(null);

  const { data: projects } = useProjects();
  const { data: me } = useMe();
  const currentProject = useMemo(
    () => (projects ?? []).find((p) => p.slug === params?.slug) ?? null,
    [projects, params?.slug],
  );

  // Search stays inside the open tool, per the product's no-server-search rule.
  const { data: tasks } = useTasks(currentProject?.id ?? null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setMode("list");
    setSearch("");
    setDraft("");
  }, []);

  useEffect(() => {
    if (mode === "quick-add") quickRef.current?.focus();
  }, [mode]);

  const createTask = useMutation({
    mutationFn: (input: {
      projectId: string;
      title: string;
      priority?: string;
      dueDate?: string;
      tags: string[];
    }) => apiPost<TaskDTO>("/api/tasks", { ...input, id: newTaskId(), parentId: null }),
    onSuccess: (created, input) => {
      void qc.invalidateQueries({ queryKey: ["tasks", input.projectId] });
      void qc.invalidateQueries({ queryKey: ["overview"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      const tool = (projects ?? []).find((p) => p.id === input.projectId);
      toast({
        message: `Added "${created.title}"${tool ? ` to ${tool.name}` : ""}`,
        action: tool
          ? { label: "Open", onAction: () => router.push(`/t/${tool.slug}?task=${created.id}`) }
          : undefined,
      });
    },
    onError: () => toast({ message: "Could not add that task.", tone: "danger" }),
  });

  const parsed = useMemo(
    () => parseQuickAdd(draft, (projects ?? []).map((p) => ({ id: p.id, name: p.name, slug: p.slug }))),
    [draft, projects],
  );

  // Explicit #tool wins; otherwise the tool whose page you are standing on.
  const targetId = parsed.projectId ?? currentProject?.id ?? null;
  const targetName = (projects ?? []).find((p) => p.id === targetId)?.name ?? null;

  const submitQuickAdd = () => {
    if (parsed.title.trim().length === 0) return;

    if (parsed.ambiguous) {
      const { token, candidates } = parsed.ambiguous;
      toast({
        message:
          candidates.length > 1
            ? `#${token} matches ${candidates.map((c) => c.slug).join(", ")} — be more specific`
            : `No project matches #${token}`,
        tone: "danger",
      });
      return;
    }

    if (!targetId) {
      toast({ message: "Add #project — there is no project in context here.", tone: "danger" });
      return;
    }

    createTask.mutate({
      projectId: targetId,
      title: parsed.title,
      priority: parsed.priority,
      dueDate: parsed.dueDate,
      tags: parsed.tags,
    });
    close();
  };

  const go = (href: string) => {
    close();
    router.push(href);
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <div className="pointer-events-none fixed inset-x-0 top-[12vh] z-toast flex justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.15 }}
            onClick={close}
            className="fixed inset-0 z-toast bg-black/50"
            aria-hidden
          />
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: reduce ? 0 : 0.17, ease: [0.16, 1, 0.3, 1] }}
            /* Centring lives on the wrapper below, not here. Framer writes an
               inline transform for its enter animation, which beats Tailwind's
               -translate-x-1/2 — so the panel sat with its LEFT edge at 50% and
               ran off the right of a 390px screen. Same defect as the tool
               modal and the help sheet; this was the third instance and the
               only one never measured. */
            className="pointer-events-auto w-[min(36rem,92vw)]"
          >
            <Command
              label="Command palette"
              loop
              className="overflow-hidden rounded-xl border border-line bg-raised shadow-lift"
            >
              {mode === "quick-add" ? (
                <>
                  <div className="flex items-center gap-2 border-b border-line pl-3">
                    <Plus className="h-4 w-4 shrink-0 text-primary-ink" strokeWidth={2} aria-hidden />
                    <QuickAddInput
                      ref={quickRef}
                      value={draft}
                      spans={parsed.spans}
                      placeholder="Fix retry #project !p1 due:fri +backend"
                      onChange={setDraft}
                      onSubmit={submitQuickAdd}
                      onCancel={() => setMode("list")}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-micro text-muted">
                    <span>
                      Project:{" "}
                      <span className={targetName ? "text-primary-ink" : "text-danger"}>
                        {targetName ?? "add #project"}
                      </span>
                    </span>
                    {parsed.priority ? <span className="text-danger">{parsed.priority}</span> : null}
                    {parsed.dueDate ? (
                      <span className="text-warn-ink">
                        {formatDMY(parsed.dueDate)}
                      </span>
                    ) : null}
                    {parsed.tags.map((t) => (
                      <span key={t}>+{t}</span>
                    ))}
                    <span className="ml-auto">Enter to add · Esc to go back</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 border-b border-line px-3">
                    <Search className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
                    <Command.Input
                      value={search}
                      onValueChange={setSearch}
                      placeholder="Search this project, or jump somewhere…"
                      className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
                    />
                  </div>

                  <Command.List className="max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain p-1.5">
                    <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
                      Nothing matches.
                    </Command.Empty>

                    <Command.Group heading="Create" className="cmdk-group">
                      <Item
                        onSelect={() => {
                          setDraft(search);
                          setMode("quick-add");
                        }}
                        icon={<Plus className="h-4 w-4" strokeWidth={2} aria-hidden />}
                        label="New task…"
                        hint="with #project !p1 due:fri +tag"
                      />
                    </Command.Group>

                    <Command.Group heading="Go to" className="cmdk-group">
                      <Item onSelect={() => go("/")} icon={<LayoutGrid className="h-4 w-4" strokeWidth={1.75} aria-hidden />} label="Home" />
                      <Item onSelect={() => go("/my-space")} icon={<Tag className="h-4 w-4" strokeWidth={1.75} aria-hidden />} label="My Space" />
                      <Item onSelect={() => go("/focus")} icon={<CalendarCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden />} label="Focus" />
                      <Item onSelect={() => go("/calendar")} icon={<CalendarDays className="h-4 w-4" strokeWidth={1.75} aria-hidden />} label="Calendar" />
                      {isManagerRole(me?.role) ? (
                        <Item onSelect={() => go("/review")} icon={<ClipboardCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden />} label="Review" />
                      ) : null}
                      <Item onSelect={() => go("/changelog")} icon={<History className="h-4 w-4" strokeWidth={1.75} aria-hidden />} label="Changelog" />
                      {(projects ?? []).map((project) => (
                        <Item
                          key={project.id}
                          onSelect={() => go(`/t/${project.slug}`)}
                          icon={
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: project.color }}
                              aria-hidden
                            />
                          }
                          label={project.name}
                        />
                      ))}
                    </Command.Group>

                    {currentProject && (tasks ?? []).length > 0 ? (
                      <Command.Group heading={`In ${currentProject.name}`} className="cmdk-group">
                        {(tasks ?? []).map((task) => (
                          <Item
                            key={task.id}
                            value={`${task.title} ${task.id}`}
                            onSelect={() => go(`/t/${currentProject.slug}?task=${task.id}`)}
                            icon={<span className="h-1.5 w-1.5 rounded-full bg-muted" aria-hidden />}
                            label={task.title || "Untitled"}
                          />
                        ))}
                      </Command.Group>
                    ) : null}

                    <Command.Group heading="Actions" className="cmdk-group">
                      <Item
                        onSelect={() => go("/settings/account")}
                        icon={<UserRound className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
                        label="Account"
                      />
                      {isAdminRole(me?.role) ? (
                        <Item
                          onSelect={() => go("/settings/users")}
                          icon={<Users className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
                          label="People"
                        />
                      ) : null}
                      <Item
                        onSelect={async () => {
                          await fetch("/api/auth", { method: "DELETE" });
                          window.location.href = "/login";
                        }}
                        icon={<LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
                        label="Sign out"
                      />
                    </Command.Group>
                  </Command.List>
                </>
              )}
            </Command>
          </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function Item({
  onSelect,
  icon,
  label,
  hint,
  value,
}: {
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  value?: string;
}) {
  return (
    <Command.Item
      value={value ?? label}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink transition-colors duration-150 ease-out data-[selected=true]:bg-hover"
    >
      <span className="grid h-4 w-4 shrink-0 place-items-center text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint ? <span className="shrink-0 text-micro text-muted">{hint}</span> : null}
    </Command.Item>
  );
}
