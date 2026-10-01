"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Download, KeyRound, LogOut, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChangePasswordSheet } from "@/components/account/change-password-sheet";
import { Face } from "@/components/ui/face";
import { apiDelete } from "@/lib/api";
import { useMyProfile } from "@/lib/hooks/use-my-account";
import { ORBIT_CHILD_APK, ORBIT_CHILD_FILENAME } from "@/lib/orbit-child-app";

/**
 * The profile button on the walled family screens — the child, a co-parent, a
 * tutor (owner, 2026-10-01: "a profile symbol for every POV"). The same menu the
 * work app's avatar opens: who you are, change password, the Orbit Child app,
 * sign out.
 */
export function ProfileMenu() {
  const { data: me } = useMyProfile();
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const reduce = useReducedMotion();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const qc = useQueryClient();

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

  const signOut = async () => {
    setOpen(false);
    await apiDelete("/api/auth").catch(() => {});
    // A shared phone: the next login must not see this one's cached screens (review, 2026-09-25).
    qc.clear();
    router.replace("/login");
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Your menu"
        className="press grid h-11 w-11 place-items-center rounded-full bg-raised/80 shadow-e1"
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
            className="absolute right-0 top-12 z-drawer w-64 origin-top-right overflow-hidden rounded-card bg-raised p-1.5 text-left shadow-lift"
          >
            {me ? (
              <div className="px-3 py-2">
                <p className="truncate text-sm font-semibold text-ink">{me.name}</p>
                <p className="truncate text-micro text-muted">{me.email}</p>
              </div>
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setPasswordOpen(true);
              }}
              className="press flex h-11 w-full items-center gap-3 rounded-input px-3 text-left text-sm text-ink"
            >
              <KeyRound className="h-4 w-4 text-muted" strokeWidth={1.75} aria-hidden />
              Change password
            </button>
            <a href={ORBIT_CHILD_APK} download={ORBIT_CHILD_FILENAME} role="menuitem" onClick={() => setOpen(false)} className="press flex h-11 items-center gap-3 rounded-input px-3 text-sm text-ink">
              <Download className="h-4 w-4 text-muted" strokeWidth={1.75} aria-hidden />
              Download Orbit Child app
            </a>
            <div className="my-1 h-px bg-line" role="separator" />
            <button type="button" role="menuitem" onClick={signOut} className="press flex h-11 w-full items-center gap-3 rounded-input px-3 text-left text-sm text-ink">
              <LogOut className="h-4 w-4 text-muted" strokeWidth={1.75} aria-hidden />
              Sign out
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <ChangePasswordSheet open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}
