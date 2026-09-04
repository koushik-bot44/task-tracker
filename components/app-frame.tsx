"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarClock, CalendarDays, LogOut, PanelLeft, Sun, UserRound, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { HelpButton } from "@/components/help-sheet";
import { RoleChip } from "@/components/role-chip";
import { useProjects } from "@/lib/hooks/use-projects";
import { Tooltip } from "@/components/tooltip";
import { canAdministerAccountsRole, canSeeUserListRole, isManagerRole } from "@/lib/roles";
import { useMe } from "@/lib/hooks/use-users";
import { cn } from "@/lib/cn";
import { CommandPalette } from "@/components/command-palette";
import { DetailPanelHost } from "@/components/detail-panel";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { PwaNudges } from "@/components/pwa/pwa-nudges";
import { Sidebar } from "@/components/sidebar";

export function AppFrame({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The Well Being tab paints a dark scene right beneath the chrome. A translucent header
  // would let that scene + its light heading bleed through as the page scrolls under it, so
  // there the header goes opaque and content slides cleanly beneath it.
  const onWellBeing = pathname === "/routine";

  // The drawer is a navigation surface; navigating away should close it.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh bg-bg">
      <ResizableSidebar>
        <Sidebar />
      </ResizableSidebar>

      <AnimatePresence>
        {drawerOpen ? (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.16 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-drawer bg-black/50 md:hidden"
              aria-hidden
            />
            <motion.aside
              key="drawer"
              initial={reduce ? { opacity: 0 } : { x: "-100%" }}
              animate={reduce ? { opacity: 1 } : { x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: "-100%" }}
              transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 left-0 z-drawer w-[17rem] max-w-[85vw] overflow-y-auto bg-surface-2 md:hidden"
              role="dialog"
              aria-label="Navigation"
            >
              <Sidebar onNavigate={() => setDrawerOpen(false)} />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Gutters match the page containers below, so the title in this bar
            sits directly above the content it names. */}
        <header
          data-tooltip-obstacle
          className={cn(
            "sticky top-0 z-sticky flex h-16 shrink-0 items-center gap-1 px-3 sm:px-8",
            onWellBeing ? "border-b border-line bg-bg" : "bg-scrim backdrop-blur-md",
          )}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-ink md:hidden"
          >
            <PanelLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>

          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 md:hidden"
          >
            <Image src="/orbit-logo.png" alt="Orbit" width={256} height={256} priority className="h-7 w-7 rounded-lg" />
            <span className="font-display text-base font-semibold text-ink">Orbit</span>
          </Link>

          {/* The bar used to be a thousand pixels of nothing. It now says where
              you are, which is the cheapest orientation cue there is. */}
          <h1 className="ml-1 hidden min-w-0 flex-1 truncate text-page font-bold text-ink md:block">
            <RouteTitle />
          </h1>
          <div className="min-w-0 flex-1 md:hidden" />

          <QuickNav />

          <NotificationBell />

          <HelpButton />

          <UserMenu />
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* Reads ?task= — Suspense keeps useSearchParams out of the static render. */}
      <Suspense fallback={null}>
        <DetailPanelHost />
      </Suspense>
      <CommandPalette />
      <PwaNudges />
    </div>
  );
}

/**
 * The desktop sidebar, resizable by a right-edge drag handle (phase 19). Width
 * lives in localStorage and is restored on load. During a drag the width is
 * written straight to the DOM (a ref), never through React state, so it stays
 * smooth and doesn't re-render the tree; only the released, clamped value is
 * committed. Resizing is desktop-only — the aside is `hidden md:block`, and the
 * mobile drawer (a separate element) has no handle. The responsive split stays
 * purely in CSS (the `md:` breakpoint) — no JS media-query branching.
 */
const SIDEBAR_DEFAULT = 264;
const SIDEBAR_MIN = 220; // narrow enough to reclaim space, wide enough to read rows
const SIDEBAR_MAX = 420; // wide enough for long names, not so wide it dominates
const SIDEBAR_KEY = "orbit:sidebarWidth";

function ResizableSidebar({ children }: { children: React.ReactNode }) {
  const asideRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(SIDEBAR_DEFAULT);

  // Client-only restore, so the server and first client render agree on the
  // default (no hydration mismatch); the saved width lands a tick later.
  useEffect(() => {
    const saved = Number(localStorage.getItem(SIDEBAR_KEY));
    if (Number.isFinite(saved) && saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX) {
      setWidth(saved);
    }
  }, []);

  const clamp = (n: number) => Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, n));

  const onHandleDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = asideRef.current?.offsetWidth ?? width;

    const onMove = (ev: PointerEvent) => {
      if (!asideRef.current) return;
      asideRef.current.style.width = `${clamp(startW + (ev.clientX - startX))}px`;
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const final = clamp(asideRef.current?.offsetWidth ?? width);
      setWidth(final);
      try {
        localStorage.setItem(SIDEBAR_KEY, String(final));
      } catch {
        /* private mode / storage disabled — width still works for this session */
      }
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const reset = () => {
    if (asideRef.current) asideRef.current.style.width = `${SIDEBAR_DEFAULT}px`;
    setWidth(SIDEBAR_DEFAULT);
    try {
      localStorage.setItem(SIDEBAR_KEY, String(SIDEBAR_DEFAULT));
    } catch {
      /* ignore */
    }
  };

  return (
    <aside
      ref={asideRef}
      style={{ width }}
      // Spec: the sidebar is its own tonal layer (#fafafa via surface-2), one
      // step off the canvas — no divider line needed; tone does the work.
      className="sticky top-0 hidden h-dvh shrink-0 bg-surface-2 md:block"
    >
      <div className="relative h-full">
        {children}
        {/* Drag handle on the right edge — a hairline that warms to primary on
            hover/drag. Sits desktop-only; double-click resets to the default. */}
        <div
          onPointerDown={onHandleDown}
          onDoubleClick={reset}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar (double-click to reset)"
          className="group absolute inset-y-0 -right-1.5 z-sticky w-3 cursor-col-resize"
        >
          <div className="ml-auto h-full w-px bg-line transition-colors duration-150 group-hover:w-0.5 group-hover:bg-primary" />
        </div>
      </div>
    </aside>
  );
}

/**
 * Phase 48: People / Calendar / Meetings / Well Being live in the TOP BAR as a
 * compact, role-gated icon cluster (the owner asked them out of the sidebar).
 * Icons only, tooltips on hover; the active one takes the accent tint.
 */
function QuickNav() {
  const { data: me } = useMe();
  const pathname = usePathname();
  if (!me) return null;

  const items: { href: string; label: string; icon: typeof CalendarDays; show: boolean }[] = [
    { href: "/people", label: "People", icon: Users, show: canSeeUserListRole(me.role) },
    { href: "/calendar", label: "Calendar", icon: CalendarDays, show: me.role !== "ADMIN" },
    { href: "/meetings", label: "Meetings", icon: CalendarClock, show: isManagerRole(me.role) },
    // Well Being is a MANAGER-personal feature — literally MANAGER, not the chain.
    { href: "/routine", label: "Well Being", icon: Sun, show: me.role === "MANAGER" },
  ];

  return (
    <nav aria-label="Quick access" className="mr-1 flex items-center gap-0.5">
      {items
        .filter((i) => i.show)
        .map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Tooltip key={href} content={label}>
              <Link
                href={href}
                aria-label={label}
                className={cn(
                  "press grid h-9 w-9 place-items-center rounded-card transition-colors duration-150 ease-out",
                  active ? "bg-primary-soft text-primary-ink" : "text-muted hover:text-ink",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </Link>
            </Tooltip>
          );
        })}
    </nav>
  );
}

/** Where am I? Derived from the route so no page has to remember to say. */
function RouteTitle() {
  const pathname = usePathname();
  const { data: projects } = useProjects();

  if (pathname === "/") return <>Home</>;
  if (pathname === "/my-space") return <>My Space</>;
  if (pathname === "/focus") return <>Focus</>;
  if (pathname === "/changelog") return <>Recent updates</>;
  if (pathname === "/review") return <>Review</>;
  if (pathname === "/calendar") return <>Calendar</>;
  if (pathname.startsWith("/meetings")) return <>Meetings</>;
  if (pathname === "/people") return <>People</>;
  if (pathname === "/settings/users") return <>People</>;
  if (pathname === "/settings/account") return <>Account</>;

  const slug = pathname.match(/^\/t\/([^/]+)/)?.[1];
  if (slug) {
    const project = (projects ?? []).find((p) => p.slug === slug);
    return <>{project?.name ?? "Project"}</>;
  }
  return <>Orbit</>;
}

function UserMenu() {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-10 items-center gap-2 rounded-lg px-2 text-sm transition-colors duration-150 ease-out hover:bg-hover"
      >
        <span className="hidden max-w-[9rem] truncate text-ink sm:inline">
          {me?.name ?? "…"}
        </span>
        {me ? <RoleChip role={me.role} /> : null}
        <UserRound className="h-4 w-4 shrink-0 text-muted sm:hidden" strokeWidth={1.75} aria-hidden />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: reduce ? 0 : 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-11 z-drawer w-52 origin-top-right overflow-hidden rounded-xl border border-line bg-raised p-1 shadow-lift"
          >
            {me ? (
              <p className="truncate px-2.5 py-1.5 text-micro text-muted">{me.email}</p>
            ) : null}

            <MenuLink href="/settings/account" icon={<UserRound className="h-4 w-4" strokeWidth={1.75} aria-hidden />} label="Account" onClick={() => setOpen(false)} />
            {/* People is the admin's page (phase 14): accounts are theirs to
                run. Managers and leads read the user list through the API for
                their dropdowns, but do not manage accounts. */}
            {canAdministerAccountsRole(me?.role) ? (
              <MenuLink href="/settings/users" icon={<Users className="h-4 w-4" strokeWidth={1.75} aria-hidden />} label="People" onClick={() => setOpen(false)} />
            ) : null}

            <div className="my-1 h-px bg-line" role="separator" />
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                await fetch("/api/auth", { method: "DELETE" });
                window.location.href = "/login";
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink transition-colors duration-150 ease-out hover:bg-hover"
            >
              <LogOut className="h-4 w-4 text-muted" strokeWidth={1.75} aria-hidden />
              Sign out
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MenuLink({
  href,
  icon,
  label,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink transition-colors duration-150 ease-out hover:bg-hover",
      )}
    >
      <span className="text-muted">{icon}</span>
      {label}
    </Link>
  );
}
