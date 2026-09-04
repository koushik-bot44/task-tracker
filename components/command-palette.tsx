"use client";

import { Command } from "cmdk";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarDays, FolderKanban, Search, SunMedium, Users } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useProjects } from "@/lib/hooks/use-projects";
import { useTasks } from "@/lib/hooks/use-tasks";
import { useMe } from "@/lib/hooks/use-users";
import { canSeeUserListRole, isAdminRole } from "@/lib/roles";

/**
 * Desktop search (Cmd/Ctrl+K): jump to a tab, a project, or a task in the
 * project you are looking at. Search only — nothing is created from here.
 */
export function CommandPalette() {
  const router = useRouter();
  const params = useParams<{ slug?: string }>();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: projects } = useProjects();
  const { data: me } = useMe();
  const currentProject = useMemo(
    () => (projects ?? []).find((p) => p.slug === params?.slug) ?? null,
    [projects, params?.slug],
  );
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
    setSearch("");
  }, []);

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
              className="fixed inset-0 z-toast bg-black/40"
              aria-hidden
            />
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: reduce ? 0 : 0.17, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto w-[min(36rem,92vw)]"
            >
              <Command label="Search" loop className="overflow-hidden rounded-card bg-raised shadow-lift">
                <div className="flex items-center gap-2 border-b border-line px-3">
                  <Search className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
                  <Command.Input
                    value={search}
                    onValueChange={setSearch}
                    placeholder="Find a project, a task, or a page…"
                    className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
                  />
                </div>
                <Command.List className="max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain p-1.5">
                  <Command.Empty className="px-3 py-6 text-center text-sm text-muted">Nothing matches.</Command.Empty>

                  <Command.Group heading="Go to" className="cmdk-group">
                    {!isAdminRole(me?.role) ? (
                      <>
                        <Item onSelect={() => go("/")} icon={<SunMedium className="h-4 w-4" strokeWidth={1.75} aria-hidden />} label="Today" />
                        <Item onSelect={() => go("/projects")} icon={<FolderKanban className="h-4 w-4" strokeWidth={1.75} aria-hidden />} label="Projects" />
                        <Item onSelect={() => go("/calendar")} icon={<CalendarDays className="h-4 w-4" strokeWidth={1.75} aria-hidden />} label="Calendar" />
                      </>
                    ) : null}
                    {canSeeUserListRole(me?.role) ? (
                      <Item onSelect={() => go("/people")} icon={<Users className="h-4 w-4" strokeWidth={1.75} aria-hidden />} label="People" />
                    ) : null}
                  </Command.Group>

                  {(projects ?? []).length > 0 ? (
                    <Command.Group heading="Projects" className="cmdk-group">
                      {(projects ?? []).map((project) => (
                        <Item
                          key={project.id}
                          onSelect={() => go(`/project/${project.slug}`)}
                          icon={<span className="h-2 w-2 rounded-full" style={{ background: project.color }} aria-hidden />}
                          label={project.name}
                        />
                      ))}
                    </Command.Group>
                  ) : null}

                  {currentProject && (tasks ?? []).length > 0 ? (
                    <Command.Group heading={`In ${currentProject.name}`} className="cmdk-group">
                      {(tasks ?? [])
                        .filter((t) => !t.parentId)
                        .map((task) => (
                          <Item
                            key={task.id}
                            value={`${task.title} ${task.id}`}
                            onSelect={() => go(`/project/${currentProject.slug}?task=${task.id}`)}
                            icon={<span className="h-1.5 w-1.5 rounded-full bg-muted" aria-hidden />}
                            label={task.title || "Untitled"}
                          />
                        ))}
                    </Command.Group>
                  ) : null}
                </Command.List>
              </Command>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function Item({ onSelect, icon, label, value }: { onSelect: () => void; icon: React.ReactNode; label: string; value?: string }) {
  return (
    <Command.Item
      value={value ?? label}
      onSelect={onSelect}
      className="flex h-11 cursor-pointer items-center gap-2.5 rounded-input px-2.5 text-sm text-ink data-[selected=true]:bg-hover"
    >
      <span className="grid h-4 w-4 shrink-0 place-items-center text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Command.Item>
  );
}
