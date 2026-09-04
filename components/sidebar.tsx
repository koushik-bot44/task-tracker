"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { generateKeyBetween } from "fractional-indexing";
import {
  CalendarCheck,
  ChevronRight,
  ClipboardCheck,
  Building2,
  History,
  LayoutGrid,
  LayoutList,
  MoreHorizontal,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/cn";
import { OverlayPortal } from "@/components/overlay-portal";
import { HEALTH_TEXT, useProjectMutations, useProjects, useProjectTeam } from "@/lib/hooks/use-projects";
import { useDepartments, useDepartmentMutations } from "@/lib/hooks/use-departments";
import { isAdminRole, isExecutiveRole, isManagerRole } from "@/lib/roles";
import { ToolCreateModal } from "@/components/tool-create-modal";
import { DepartmentManageModal } from "@/components/department-manage-modal";
import { useMe } from "@/lib/hooks/use-users";
import { HEALTHS, HEALTH_LABEL, type Health, type DepartmentDTO, type ProjectDTO } from "@/lib/types";
import { useToast } from "@/components/toast";
import { Tooltip } from "@/components/tooltip";

/* Phase 48: Calendar, Meetings, People and Well Being moved to the top bar's
   QuickNav (the owner wants the sidebar to be the company structure, not a
   feature list). What remains is the work itself. */
const NAV = [
  { href: "/", label: "Home", icon: LayoutGrid, managerOnly: false, personal: false },
  { href: "/my-space", label: "My Space", icon: Tag, managerOnly: false, personal: true },
  { href: "/focus", label: "Focus", icon: CalendarCheck, managerOnly: false, personal: false },
  { href: "/review", label: "Review", icon: ClipboardCheck, managerOnly: true, personal: false },
  { href: "/changelog", label: "Recent updates", icon: History, managerOnly: false, personal: false },
] as const;

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: me } = useMe();
  const { data: projects, isLoading } = useProjects();
  const { data: departments } = useDepartments();
  // Department-first creation (phase 16): a project is always created INSIDE a
  // department, so this carries the target department id (null = modal closed).
  const [createInDept, setCreateInDept] = useState<string | null>(null);
  const [creatingDepartment, setCreatingDepartment] = useState(false);
  /* STRICT manager — creates projects, writes departments, deletes projects, and
     edits the metadata of tools they OWN. */
  const isManager = isManagerRole(me?.role);
  // Departments are company structure (phase 48): only the founder/directors
  // create or reshape them; the chain below works INSIDE them.
  const isExecutive = isExecutiveRole(me?.role);
  /* An admin has NO project side at all (phase 14): no project nav, no tools. */
  const isAdmin = isAdminRole(me?.role);
  const myId = me?.id;
  /* A manager opening a tool wants the read-out, not the outline — the whole
     point of Overview. Leads and developers land in the tree. */
  const toolHref = (slug: string) => (isManager ? `/t/${slug}/overview` : `/t/${slug}`);

  // Group the tools the caller can see under the departments they OWN. A project
  // whose department isn't one of the caller's own — a project shared via a
  // collaboration invite (phase 14), which lives in the OWNER's department — is
  // surfaced in "Shared with me" instead, since the caller can't see that
  // department. Departments arrive already ordered and visibility-filtered.
  const departmentList = useMemo(() => departments ?? [], [departments]);
  const { byDepartment, shared } = useMemo(() => {
    const ownDeptIds = new Set(departmentList.map((d) => d.id));
    const map = new Map<string, ProjectDTO[]>();
    const sharedList: ProjectDTO[] = [];
    for (const p of projects ?? []) {
      if (p.departmentId && ownDeptIds.has(p.departmentId)) {
        const list = map.get(p.departmentId);
        if (list) list.push(p);
        else map.set(p.departmentId, [p]);
      } else {
        sharedList.push(p);
      }
    }
    return { byDepartment: map, shared: sharedList };
  }, [projects, departmentList]);
  const hasDepartments = departmentList.length > 0;

  return (
    <div className="flex h-full flex-col">
      <nav className="px-2 pt-3">
        <ul className="space-y-0.5">
          {NAV.filter(
            (item) =>
              // Home and My Space (a per-user private space) are for everyone;
              // the rest is project-side, so an admin (accounts-only) sees none
              // of it. Review needs a manager.
              (item.href === "/" || item.personal || !isAdmin) &&
              (!item.managerOnly || isManager),
          ).map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "press flex h-11 items-center gap-3 rounded-chip px-3.5 text-sm",
                    // A crisper active pill: the current page reads at full weight,
                    // the rest sit quietly at medium (polish, phase 19).
                    active
                      ? "bg-primary-soft font-semibold text-primary-ink"
                      : "font-medium text-muted hover:bg-hover hover:text-ink",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      active ? "text-primary-ink" : "text-muted",
                    )}
                    strokeWidth={2}
                    aria-hidden
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {isAdmin ? null : (
      <>
      <div className="mt-4 flex items-center justify-between px-4 pb-1">
        <h2 className="text-sm font-bold text-ink">Departments</h2>
        {/* Hidden for non-executives as a courtesy; the POST endpoint is the
            thing that actually refuses them (phase 48: company-wide depts). */}
        {isExecutive ? (
          <div className="flex items-center gap-0.5">
            {/* Department-first (phase 16): projects are created INSIDE a
                department, so the only top-level "new" here is a department.
                The "New project" action lives on each department. */}
            <Tooltip content="New department">
              <button
                type="button"
                onClick={() => setCreatingDepartment(true)}
                aria-label="New department"
                className="press grid h-8 w-8 place-items-center rounded-card text-muted hover:text-ink"
              >
                <Building2 className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </Tooltip>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {isLoading ? (
          <div className="space-y-1 px-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-hover" />
            ))}
          </div>
        ) : null}

        {/* Phase 49 (owner's call): the sidebar shows ONE quiet row per
            department — a link, top to bottom, nothing expandable, no empty-
            state placeholders. Projects live on the department page itself. */}
        <ul className="space-y-0.5">
          {departmentList.map((department) => {
            const active = pathname === `/department/${department.id}`;
            const count = (byDepartment.get(department.id) ?? []).length;
            return (
              <li key={department.id}>
                <Link
                  href={`/department/${department.id}`}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "press flex h-10 items-center gap-2.5 rounded-chip px-3.5 text-sm",
                    active
                      ? "bg-primary-soft font-semibold text-primary-ink"
                      : "font-medium text-muted hover:bg-hover hover:text-ink",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{department.name}</span>
                  {count > 0 ? (
                    <span className="text-micro tabular-nums text-muted">{count}</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Projects shared via a collaboration invite still need a door. */}
        {shared.length > 0 ? (
          <div className="mt-3">
            <div className="flex h-8 items-center px-3">
              <span className="text-micro font-semibold uppercase tracking-widest text-muted">
                Shared with me
              </span>
            </div>
            <ul className="space-y-0.5">
              {shared.map((project) => (
                <li key={project.id}>
                  <Link
                    href={toolHref(project.slug)}
                    onClick={onNavigate}
                    className={cn(
                      "press flex h-10 items-center gap-2.5 rounded-chip px-3.5 text-sm",
                      pathname.startsWith(`/t/${project.slug}`)
                        ? "bg-primary-soft font-semibold text-primary-ink"
                        : "font-medium text-muted hover:bg-hover hover:text-ink",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* A brand-new company has no departments yet — and can't hold a
            project without one — so the first step is a department (executive). */}
        {!isLoading && !hasDepartments && isExecutive ? (
          <button
            type="button"
            onClick={() => setCreatingDepartment(true)}
            className="mt-2 w-full rounded-lg border border-dashed border-line px-3 py-6 text-sm text-muted transition-colors duration-150 ease-out hover:border-muted hover:text-ink"
          >
            Create your first department
          </button>
        ) : null}

        <ToolCreateModal
          open={createInDept !== null}
          departmentId={createInDept}
          onClose={() => setCreateInDept(null)}
        />
        <DepartmentManageModal open={creatingDepartment} onClose={() => setCreatingDepartment(false)} />
      </div>
      </>
      )}
    </div>
  );
}

/**
 * One department's section in the sidebar: a header (colour dot + icon + name that
 * links to the department overview, a collapse toggle, and a manager-only menu)
 * over the tools filed under it. Collapse state is per-department in localStorage so
 * it survives reloads. Empty departments still show for managers/leads (they see all
 * departments) so they can file tools into them; the API has already hidden empty
 * departments from a developer.
 */
function DepartmentSection({
  department,
  departments,
  index,
  projects,
  pathname,
  onNavigate,
  toolHref,
  isManager,
  isExecutive,
  myId,
  onCreateProject,
}: {
  department: DepartmentDTO;
  departments: DepartmentDTO[];
  index: number;
  projects: ProjectDTO[];
  pathname: string;
  onNavigate?: () => void;
  toolHref: (slug: string) => string;
  /** Whether the viewer is chain authority (project writes shown), and their id,
      so a tool's rename/delete affordance shows only to its OWNER (phase 14). */
  isManager: boolean;
  /** Phase 48: department edit/move/delete are founder/director-only. */
  isExecutive: boolean;
  myId: string | undefined;
  /** Open the create-project modal preset to this department (phase 16). */
  onCreateProject: () => void;
}) {
  const isFirst = index === 0;
  const isLast = index === departments.length - 1;
  const { show: toast } = useToast();
  const { updateDepartment, deleteDepartment } = useDepartmentMutations();
  const [collapsed, setCollapsed] = useCollapsed(department.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const onDepartmentPage = pathname === `/department/${department.id}`;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const move = (dir: "up" | "down") => {
    setMenuOpen(false);
    // Adjacent swap via a fractional index — the same util the tools use, no
    // second ordering scheme. Up: land between the department two above and the one
    // directly above. Down: between the one directly below and the one two below.
    const key =
      dir === "up"
        ? generateKeyBetween(departments[index - 2]?.orderKey ?? null, departments[index - 1].orderKey)
        : generateKeyBetween(departments[index + 1].orderKey, departments[index + 2]?.orderKey ?? null);
    updateDepartment.mutate({ id: department.id, patch: { orderKey: key } });
  };

  const remove = () => {
    setMenuOpen(false);
    // Phase 16: a department can only be deleted once EMPTY — every project lives
    // in exactly one department, so there's nowhere to un-file them to. Guard here
    // for a clear message; the server also refuses a non-empty delete (409).
    const n = projects.length;
    if (n > 0) {
      toast({
        message: `"${department.name}" still holds ${n} tool${n === 1 ? "" : "s"} — move them out first.`,
        tone: "danger",
      });
      return;
    }
    if (!window.confirm(`Delete the "${department.name}" department?`)) return;
    deleteDepartment.mutate(department.id, {
      onSuccess: () => toast({ message: `Deleted "${department.name}"` }),
      onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
    });
  };

  return (
    <div ref={wrapperRef} className="relative mt-1 first:mt-0">
      <div
        className={cn(
          "group flex items-center gap-1.5 rounded-chip pl-1.5 pr-1",
          onDepartmentPage ? "bg-primary-soft" : "hover:bg-hover",
        )}
      >
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? `Expand ${department.name}` : `Collapse ${department.name}`}
          aria-expanded={!collapsed}
          className="press grid h-7 w-6 shrink-0 place-items-center rounded-chip text-muted"
        >
          <ChevronRight
            className={cn("h-4 w-4 transition-transform duration-150", !collapsed && "rotate-90")}
            strokeWidth={2}
            aria-hidden
          />
        </button>

        <Link
          href={`/department/${department.id}`}
          onClick={onNavigate}
          aria-current={onDepartmentPage ? "page" : undefined}
          className="flex h-9 min-w-0 flex-1 items-center gap-2"
        >
          <span
            className="grid h-4 w-4 shrink-0 place-items-center text-[11px] leading-none"
            aria-hidden
          >
            {department.icon ? (
              department.icon
            ) : (
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: department.color }} />
            )}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm font-semibold",
              onDepartmentPage ? "text-primary-ink" : "text-ink",
            )}
          >
            {department.name}
          </span>
          <span className="shrink-0 text-micro font-medium tabular-nums text-muted">{projects.length}</span>
        </Link>

        {/* Projects toggle, on the RIGHT with the row's actions (phase 19): a
            second affordance for the same collapse state as the chevron, so the
            left stays clean (just › + dot + name). Highlights when open. */}
        <Tooltip content={collapsed ? "Show projects" : "Hide projects"}>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? `Show projects in ${department.name}` : `Hide projects in ${department.name}`}
            aria-expanded={!collapsed}
            className={cn(
              "press grid h-7 w-6 shrink-0 place-items-center rounded-chip transition-colors duration-150",
              collapsed ? "text-muted hover:text-ink" : "text-primary-ink",
            )}
          >
            <LayoutList className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </Tooltip>

        {isManager ? (
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Department options for ${department.name}`}
            className="press grid h-7 w-6 shrink-0 place-items-center rounded-chip text-muted opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
      </div>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            role="menu"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: reduce ? 0 : 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-1 top-10 z-drawer w-44 origin-top-right overflow-hidden rounded-xl border border-line bg-raised p-1 shadow-lift"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onCreateProject();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink transition-colors duration-150 ease-out hover:bg-hover"
            >
              <Plus className="h-3.5 w-3.5 text-muted" strokeWidth={2} aria-hidden />
              New project here
            </button>
            {/* Phase 48: reshaping company structure is executive-only; the
                chain below still creates projects inside the department. */}
            {isExecutive ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditing(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink transition-colors duration-150 ease-out hover:bg-hover"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted" strokeWidth={2} aria-hidden />
                  Edit department
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={isFirst}
                  onClick={() => move("up")}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink transition-colors duration-150 ease-out hover:bg-hover disabled:opacity-40"
                >
                  Move up
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={isLast}
                  onClick={() => move("down")}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink transition-colors duration-150 ease-out hover:bg-hover disabled:opacity-40"
                >
                  Move down
                </button>
                <div className="my-1 h-px bg-line" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={remove}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-danger transition-colors duration-150 ease-out hover:bg-danger-soft"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  Delete department
                </button>
              </>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!collapsed ? (
        <div className="mt-0.5 pl-2">
          {projects.length > 0 ? (
            <>
              {/* A quiet organizing sub-label (phase 17), so the hierarchy reads
                  Departments -> this department -> Projects -> the rows. Light on
                  purpose — not a second heading. */}
              <p className="px-3 pb-0.5 pt-1 text-micro font-semibold text-ink">Projects</p>
              <ul className="space-y-1">
                {projects.map((project) => (
                  <ProjectItem
                    key={project.id}
                    project={project}
                    departments={departments}
                    selected={pathname.startsWith(`/t/${project.slug}`)}
                    onNavigate={onNavigate}
                    toolHref={toolHref}
                    canManage={isManager && project.ownerId === myId}
                    canDelete={isManager && project.ownerId === myId}
                  />
                ))}
              </ul>
            </>
          ) : (
            <p className="px-3 py-1.5 text-micro italic text-muted">No projects yet</p>
          )}
        </div>
      ) : null}

      <DepartmentManageModal open={editing} department={department} onClose={() => setEditing(false)} />
    </div>
  );
}

/** Per-department collapse state, remembered across reloads. */
function useCollapsed(departmentId: string): [boolean, (fn: (v: boolean) => boolean) => void] {
  const storageKey = `orbit:departmentCollapsed:${departmentId}`;
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    try {
      setCollapsedState(window.localStorage.getItem(storageKey) === "1");
    } catch {
      /* private mode / no storage — default expanded */
    }
  }, [storageKey]);

  const setCollapsed = (fn: (v: boolean) => boolean) =>
    setCollapsedState((prev) => {
      const next = fn(prev);
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });

  return [collapsed, setCollapsed];
}

function ProjectItem({
  project,
  departments = [],
  selected,
  onNavigate,
  toolHref,
  canManage,
  canDelete,
}: {
  project: ProjectDTO;
  /** The caller's own departments — the "Move to department" targets (phase 16). */
  departments?: DepartmentDTO[];
  selected: boolean;
  onNavigate?: () => void;
  /** Managers and admins land on Overview; everyone else lands in the tree. */
  toolHref: (slug: string) => string;
  /** Rename / re-health / move / delete — the OWNER manager only (phase 14/16).
      Hidden for everyone else since the server refuses them and a menu that
      always 403s reads as broken. */
  canManage: boolean;
  /** Delete — managers only. */
  canDelete: boolean;
}) {
  const reduce = useReducedMotion();
  const { show: toast } = useToast();
  const { updateProject, deleteProject } = useProjectMutations();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const teamBtnRef = useRef<HTMLButtonElement>(null);
  const [creatingDept, setCreatingDept] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const wrapperRef = useRef<HTMLLIElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) renameRef.current?.select();
  }, [renaming]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const commitRename = () => {
    const trimmed = draft.trim();
    setRenaming(false);
    if (trimmed.length > 0 && trimmed !== project.name) {
      updateProject.mutate({ id: project.id, patch: { name: trimmed } });
    } else {
      setDraft(project.name);
    }
  };

  return (
    <li ref={wrapperRef} className="relative">
      <div
        className={cn(
          "group flex items-center gap-3 rounded-chip pl-3 pr-1 transition-colors duration-150 ease-out",
          selected ? "bg-primary-soft" : "hover:bg-hover",
        )}
      >
        {/* The tool's own colour, at a size you can actually see. */}
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: project.color }}
          aria-hidden
        />

        {renaming ? (
          <input
            ref={renameRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDraft(project.name);
                setRenaming(false);
              }
            }}
            aria-label="Project name"
            className="h-10 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
          />
        ) : (
          <Link
            href={toolHref(project.slug)}
            onClick={onNavigate}
            onDoubleClick={(e) => {
              if (!canManage) return;
              e.preventDefault();
              setDraft(project.name);
              setRenaming(true);
            }}
            aria-current={selected ? "page" : undefined}
            className="flex min-w-0 flex-1 items-center gap-2 py-1.5"
          >
            {/* Each row owns its height (no fixed h-10 to overflow): the name is
                one truncating line, and the meta a second line that never wraps —
                health truncates, the count is shrink-0 — so nothing bleeds into
                the row below. The name still wins the horizontal space. */}
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-sm leading-snug",
                  selected ? "font-semibold text-primary-ink" : "font-medium text-ink",
                )}
              >
                {project.name}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-micro text-muted">
                <span className={cn("min-w-0 truncate", HEALTH_TEXT[project.health])}>
                  {HEALTH_LABEL[project.health]}
                </span>
                <span aria-hidden className="shrink-0">·</span>
                <span className="shrink-0 whitespace-nowrap tabular-nums">
                  {project.taskCount} {project.taskCount === 1 ? "task" : "tasks"}
                </span>
              </span>
            </span>
          </Link>
        )}

        {/* Members popover (phase 17). Always present (not hover-gated) so it is
            reachable on the mobile drawer too; subtle + shrink-0 so the name
            still wins the row. */}
        <Tooltip content="View members">
          <button
            ref={teamBtnRef}
            type="button"
            onClick={() => setTeamOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={teamOpen}
            aria-label={`Members of ${project.name}`}
            className="press grid h-8 w-6 shrink-0 place-items-center rounded-chip text-muted hover:text-ink"
          >
            <Users className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        </Tooltip>

        {canManage ? (
          <Tooltip content={`Rename, change health, or delete ${project.name}`}>
            <button
              type="button"
              onClick={() => {
                setMenuOpen((v) => !v);
                setMoveOpen(false);
              }}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Options for ${project.name}`}
              className="press grid h-8 w-7 shrink-0 place-items-center rounded-chip text-muted opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </button>
          </Tooltip>
        ) : null}
      </div>

      {/* The pastel pill now carries selection; a separate bar would be a
          second thing saying the same thing. */}

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            role="menu"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: reduce ? 0 : 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-1 top-11 z-drawer w-44 origin-top-right overflow-hidden rounded-xl border border-line bg-raised p-1 shadow-lift"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setDraft(project.name);
                setRenaming(true);
              }}
              className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-ink transition-colors duration-150 ease-out hover:bg-hover"
            >
              Rename
            </button>

            {/* Move to department (phase 16). An in-place expanding submenu, not a
                floating one — it can never render off the sidebar edge, and it
                matches the reference pattern (a › that opens the list of the
                caller's own departments, with an inline "New department"). */}
            {canManage ? (
              <>
                <div className="my-1 h-px bg-line" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  aria-expanded={moveOpen}
                  onClick={() => setMoveOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink transition-colors duration-150 ease-out hover:bg-hover"
                >
                  Move to department
                  <ChevronRight
                    className={cn("h-3.5 w-3.5 text-muted transition-transform duration-150", moveOpen && "rotate-90")}
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
                {moveOpen ? (
                  <div className="mb-1 ml-2 border-l border-line pl-1">
                    {departments
                      .filter((d) => d.id !== project.departmentId)
                      .map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            updateProject.mutate({ id: project.id, patch: { departmentId: d.id } });
                            toast({ message: `Moved "${project.name}" to ${d.name}` });
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-ink transition-colors duration-150 ease-out hover:bg-hover"
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{d.name}</span>
                        </button>
                      ))}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setCreatingDept(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      New department…
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="my-1 h-px bg-line" role="separator" />
            <p className="px-2.5 pb-1 pt-0.5 text-micro uppercase tracking-widest text-muted">
              Health
            </p>
            {HEALTHS.map((health: Health) => (
              <button
                key={health}
                type="button"
                role="menuitemradio"
                aria-checked={project.health === health}
                onClick={() => {
                  updateProject.mutate({ id: project.id, patch: { health } });
                  setMenuOpen(false);
                }}
                className={cn(
                  "w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 ease-out hover:bg-hover",
                  project.health === health ? "text-primary-ink" : "text-ink",
                )}
              >
                {HEALTH_LABEL[health]}
              </button>
            ))}

            {/* Delete is manager-only — an admin edits a project but never
                removes one, so they don't see this. */}
            {canDelete ? (
              <>
                <div className="my-1 h-px bg-line" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    // Projects have no soft-delete column, so this one is permanent
                    // — the only place in the app that asks before acting.
                    const ok = window.confirm(
                      `Delete "${project.name}" and all of its tasks? This cannot be undone.`,
                    );
                    if (!ok) return;
                    deleteProject.mutate(project.id);
                    toast({ message: `Deleted ${project.name}`, tone: "danger" });
                  }}
                  className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-danger transition-colors duration-150 ease-out hover:bg-danger-soft"
                >
                  Delete project
                </button>
              </>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* "New department…" from the move submenu opens the create modal here. */}
      <DepartmentManageModal open={creatingDept} onClose={() => setCreatingDept(false)} />

      {teamOpen ? (
        <MembersPopover
          projectId={project.id}
          anchorRef={teamBtnRef}
          onClose={() => setTeamOpen(false)}
        />
      ) : null}
    </li>
  );
}

/**
 * The per-project members popover (phase 17): team lead first (with a "Lead"
 * marker), then the developer members — names only. Portalled to escape the
 * sidebar's sticky stacking context, and positioned by measurement so it always
 * stays fully on-screen: it opens to the right of its icon, flips to the left
 * when that would overflow, and shifts up when it would run off the bottom.
 * Closes on outside-click or Escape.
 */
function MembersPopover({
  projectId,
  anchorRef,
  onClose,
}: {
  projectId: string;
  anchorRef: RefObject<HTMLButtonElement>;
  onClose: () => void;
}) {
  const { data: team, isLoading, isError } = useProjectTeam(projectId, true);
  // A callback ref (state), not useRef: the OverlayPortal mounts a tick late, so
  // this fires once its node actually attaches, which is when we can measure.
  const [popEl, setPopEl] = useState<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Measure after the content is laid out, so a flip/shift uses the real size.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !popEl) return;
    const a = anchor.getBoundingClientRect();
    const W = popEl.offsetWidth || 240;
    const H = popEl.offsetHeight || 160;
    const M = 8;
    let left = a.right + 6;
    if (left + W + M > window.innerWidth) left = a.left - W - 6; // flip to the left
    left = Math.max(M, Math.min(left, window.innerWidth - W - M));
    let top = a.top;
    if (top + H + M > window.innerHeight) top = window.innerHeight - H - M; // shift up
    top = Math.max(M, top);
    setPos({ top, left });
  }, [anchorRef, popEl, team, isLoading, isError]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!popEl?.contains(t) && !anchorRef.current?.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchorRef, popEl, onClose]);

  return (
    <OverlayPortal>
      <div
        ref={setPopEl}
        role="dialog"
        aria-label={`Members of ${team?.name ?? "project"}`}
        style={{
          position: "fixed",
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          visibility: pos ? "visible" : "hidden",
        }}
        className="z-drawer w-60 rounded-xl border border-line bg-raised p-2 shadow-lift"
      >
        <p className="truncate px-1.5 pb-1.5 text-sm font-semibold text-ink">
          {team?.name ?? "…"}
        </p>
        {isLoading ? (
          <p className="px-1.5 py-1 text-micro text-muted">Loading…</p>
        ) : isError || !team ? (
          <p className="px-1.5 py-1 text-micro text-muted">Couldn’t load members.</p>
        ) : (
          <>
            {team.lead ? (
              <div className="flex items-center gap-2 rounded-lg px-1.5 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{team.lead.name}</span>
                <span className="shrink-0 rounded-full bg-primary-soft px-1.5 py-0.5 text-micro font-medium text-primary-ink">
                  Lead
                </span>
              </div>
            ) : (
              <p className="px-1.5 py-1.5 text-sm italic text-muted">No lead assigned</p>
            )}

            <div className="my-1 h-px bg-line" role="separator" />

            {team.developers.length > 0 ? (
              <ul className="space-y-0.5">
                {team.developers.map((d, i) => (
                  <li key={i} className="truncate rounded-lg px-1.5 py-1.5 text-sm text-ink">
                    {d.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-1.5 py-1.5 text-sm italic text-muted">No team members</p>
            )}
          </>
        )}
      </div>
    </OverlayPortal>
  );
}
