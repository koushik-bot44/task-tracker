"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarDays, CircleHelp, FolderKanban, LogOut, NotebookPen, Settings, Sun, SunMedium, UserRound, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { CommandPalette } from "@/components/command-palette";
import { DetailPanelHost } from "@/components/detail-panel";
import { HelpSheet } from "@/components/help-sheet";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { PwaNudges } from "@/components/pwa/pwa-nudges";
import { Face } from "@/components/ui/face";
import { cn } from "@/lib/cn";
import { useProjects } from "@/lib/hooks/use-projects";
import { useMe } from "@/lib/hooks/use-users";
import { canSeeUserListRole, isAdminRole } from "@/lib/roles";

/**
 * The shell (restructure): five tabs — Today · Projects · Calendar · People ·
 * Family — as a 220px rail on a desktop and bottom tabs on a phone. The top
 * bar carries only the bell and your Face; the Face opens My notes, Account,
 * Notifications and Sign out. Nothing else lives in the chrome.
 */
type Tab = { href: string; label: string; icon: typeof SunMedium; show: boolean };

function useTabs(): Tab[] {
  const { data: me } = useMe();
  const admin = isAdminRole(me?.role);
  return [
    { href: "/", label: "Today", icon: SunMedium, show: !admin },
    { href: "/projects", label: "Projects", icon: FolderKanban, show: !admin },
    { href: "/calendar", label: "Calendar", icon: CalendarDays, show: !admin },
    { href: "/people", label: "People", icon: Users, show: canSeeUserListRole(me?.role) },
    { href: "/routine", label: "Family", icon: Sun, show: Boolean(me?.hasFamily) },
  ];
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/projects") return pathname === "/projects" || pathname.startsWith("/project/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const tabs = useTabs().filter((t) => t.show);
  const onWellBeing = pathname === "/routine";

  return (
    <div className="flex min-h-dvh bg-bg">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh w-[220px] shrink-0 flex-col bg-surface-2 px-3 pb-4 pt-4 md:flex">
        <Link href="/" className="mb-4 flex items-center gap-2 rounded-input px-2 py-1.5">
          <Image src="/orbit-logo.png" alt="Orbit" width={256} height={256} priority className="h-7 w-7 rounded-lg" />
          <span className="text-row font-semibold text-ink">Orbit</span>
        </Link>
        <nav aria-label="Main" className="space-y-1">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "press flex h-11 items-center gap-3 rounded-input px-3 text-row",
                  active ? "bg-primary-soft font-semibold text-primary-ink" : "font-medium text-muted hover:text-ink",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-tooltip-obstacle
          className={cn(
            "sticky top-0 z-sticky flex h-14 shrink-0 items-center gap-1 px-3 md:px-6",
            onWellBeing ? "border-b border-line bg-bg" : "bg-scrim backdrop-blur-md",
          )}
        >
          <Link href="/" className="flex items-center gap-2 rounded-input px-1 py-1 md:hidden">
            <Image src="/orbit-logo.png" alt="Orbit" width={256} height={256} priority className="h-7 w-7 rounded-lg" />
          </Link>
          <h1 className="ml-1 min-w-0 flex-1 truncate text-section font-semibold text-ink">
            <RouteTitle />
          </h1>
          <NotificationBell />
          <UserMenu />
        </header>

        {/* Bottom tabs leave room on a phone. */}
        <main className="min-w-0 flex-1 pb-24 md:pb-0">{children}</main>
      </div>

      {/* Mobile bottom tabs */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-sticky flex h-[calc(64px+env(safe-area-inset-bottom))] items-start justify-around border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-16 min-w-[64px] flex-1 flex-col items-center justify-center gap-1 text-micro font-medium",
                active ? "text-primary-ink" : "text-muted",
              )}
            >
              <Icon className="h-6 w-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      <Suspense fallback={null}>
        <DetailPanelHost />
      </Suspense>
      <CommandPalette />
      <PwaNudges />
    </div>
  );
}

/** Where am I? Derived from the route so no page has to say. */
function RouteTitle() {
  const pathname = usePathname();
  const { data: projects } = useProjects();

  if (pathname === "/") return <>Today</>;
  if (pathname === "/projects") return <>Projects</>;
  if (pathname === "/calendar") return <>Calendar</>;
  if (pathname === "/people") return <>People</>;
  if (pathname === "/routine") return <>Family</>;
  if (pathname === "/my-space") return <>My notes</>;
  if (pathname === "/settings/account") return <>Account</>;

  const slug = pathname.match(/^\/project\/([^/]+)/)?.[1];
  if (slug) {
    const project = (projects ?? []).find((p) => p.slug === slug);
    return <>{project?.name ?? "Project"}</>;
  }
  return <>Orbit</>;
}

function UserMenu() {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
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
        aria-label="Your menu"
        className="press grid h-11 w-11 place-items-center rounded-full"
      >
        {me ? <Face name={me.name} /> : <UserRound className="h-5 w-5 text-muted" strokeWidth={1.75} aria-hidden />}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: reduce ? 0 : 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-12 z-drawer w-60 origin-top-right overflow-hidden rounded-card bg-raised p-1.5 shadow-lift"
          >
            {me ? (
              <div className="px-3 py-2">
                <p className="truncate text-sm font-semibold text-ink">{me.name}</p>
                <p className="truncate text-micro text-muted">{me.email}</p>
              </div>
            ) : null}
            <MenuLink href="/my-space" icon={<NotebookPen className="h-4 w-4" strokeWidth={1.75} aria-hidden />} label="My notes" onClick={() => setOpen(false)} />
            <MenuLink href="/settings/account" icon={<Settings className="h-4 w-4" strokeWidth={1.75} aria-hidden />} label="Account" onClick={() => setOpen(false)} />
            <MenuLink href="/settings/account#notifications" icon={<UserRound className="h-4 w-4" strokeWidth={1.75} aria-hidden />} label="Notifications" onClick={() => setOpen(false)} />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setHelpOpen(true);
              }}
              className="press flex h-11 w-full items-center gap-3 rounded-input px-3 text-left text-sm text-ink"
            >
              <CircleHelp className="h-4 w-4 text-muted" strokeWidth={1.75} aria-hidden />
              How Orbit works
            </button>
            <div className="my-1 h-px bg-line" role="separator" />
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                await fetch("/api/auth", { method: "DELETE" });
                window.location.href = "/login";
              }}
              className="press flex h-11 w-full items-center gap-3 rounded-input px-3 text-left text-sm text-ink"
            >
              <LogOut className="h-4 w-4 text-muted" strokeWidth={1.75} aria-hidden />
              Sign out
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

function MenuLink({ href, icon, label, onClick }: { href: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Link href={href} role="menuitem" onClick={onClick} className="press flex h-11 items-center gap-3 rounded-input px-3 text-sm text-ink">
      <span className="text-muted">{icon}</span>
      {label}
    </Link>
  );
}
