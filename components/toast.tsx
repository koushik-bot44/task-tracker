"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export type ToastAction = {
  label: string;
  onAction: () => void;
};

type Toast = {
  id: string;
  message: string;
  action?: ToastAction;
  /** Dismissive choice, e.g. "Keep open". Replaces the close button. */
  secondary?: ToastAction;
  durationMs: number;
  tone: "default" | "danger";
};

type ShowToast = (input: {
  message: string;
  action?: ToastAction;
  secondary?: ToastAction;
  durationMs?: number;
  tone?: Toast["tone"];
}) => void;

type ToastApi = {
  show: ShowToast;
  /** Clear everything — used when the view underneath changes out from under it. */
  dismissAll: () => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

let toastSeq = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    setToasts([]);
  }, []);

  const show = useCallback<ShowToast>(
    ({ message, action, secondary, durationMs = 10_000, tone = "default" }) => {
      const id = `toast-${++toastSeq}`;
      // One at a time: the newest message replaces whatever was showing, so a
      // prompt never stacks on top of an undo the user is still reading.
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
      setToasts([{ id, message, action, secondary, durationMs, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), durationMs),
      );
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show, dismissAll }), [show, dismissAll]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-toast flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        role="region"
        aria-label="Notifications"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastCard
              key={toast.id}
              toast={toast}
              onDismiss={() => dismiss(toast.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      layout
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: reduce ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-xl border border-line bg-raised shadow-lift"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            toast.tone === "danger" ? "bg-danger" : "bg-primary"
          }`}
          aria-hidden
        />
        <p className="min-w-0 flex-1 truncate text-sm text-ink">{toast.message}</p>

        {toast.secondary ? (
          <button
            type="button"
            onClick={() => {
              toast.secondary?.onAction();
              onDismiss();
            }}
            className="-my-1 shrink-0 rounded-md px-2 py-1 text-sm text-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
          >
            {toast.secondary.label}
          </button>
        ) : null}

        {toast.action ? (
          <button
            type="button"
            onClick={() => {
              toast.action?.onAction();
              onDismiss();
            }}
            className="-my-1 shrink-0 rounded-md px-2 py-1 text-sm font-medium text-primary-ink transition-colors duration-150 ease-out hover:bg-primary-soft"
          >
            {toast.action.label}
          </button>
        ) : null}

        {/* The secondary action is the dismissal, so the close button would be
            a third way to say the same thing. */}
        {toast.secondary ? null : (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss this message"
            title="Dismiss"
            className="-mr-1 shrink-0 rounded-chip p-1 text-muted transition-colors duration-150 ease-out hover:text-ink"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Time remaining, drawn rather than counted. */}
      <motion.div
        className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary-soft"
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: reduce ? 0 : toast.durationMs / 1000, ease: "linear" }}
      />
    </motion.div>
  );
}
