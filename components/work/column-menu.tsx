"use client";

import { Check, ListFilter } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { WORK_PRIORITIES, WORK_PRIORITY_LABEL, WORK_STATE_LABEL } from "@/lib/types";

export type SortDir = "asc" | "desc";
export type Patch = Record<string, string | null>;
export type Named = { id: string; name: string };

/** What a column can be narrowed by, decided by what it holds. */
export type FilterKind = "none" | "search" | "pick" | "status" | "priority" | "dates" | "due";

/** What the two ways round are CALLED here: a date is not A to Z. */
export function sortWords(sortKey: string): { asc: string; desc: string } {
  switch (sortKey) {
    case "priority":
      return { asc: "Highest first", desc: "Lowest first" };
    case "status":
      return { asc: "In work order", desc: "Reverse order" };
    case "number":
    case "created":
    case "updated":
    case "assigned":
    case "due":
      return { asc: "Oldest first", desc: "Newest first" };
    default:
      return { asc: "A to Z", desc: "Z to A" };
  }
}

const day = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** The statuses as people read them; NEW and ASSIGNED both say "New", so they go together. */
const STATUS_CHOICES: { label: string; value: string }[] = [
  { label: WORK_STATE_LABEL.ASSIGNED, value: "NEW,ASSIGNED" },
  { label: WORK_STATE_LABEL.IN_PROGRESS, value: "IN_PROGRESS" },
  { label: WORK_STATE_LABEL.WAITING, value: "WAITING" },
  { label: WORK_STATE_LABEL.ESCALATED, value: "ESCALATED" },
  { label: WORK_STATE_LABEL.REOPENED, value: "REOPENED" },
  { label: WORK_STATE_LABEL.RESOLVED, value: "RESOLVED" },
  { label: WORK_STATE_LABEL.CLOSED, value: "CLOSED" },
  { label: WORK_STATE_LABEL.CANCELLED, value: "CANCELLED" },
];

/**
 * The lines symbol on a column heading: tap it and it says what THIS column can
 * do, in this column's own words — sort it the two ways round, and narrow the
 * list by what the column holds.
 *
 * The panel is placed `fixed` from the button's own corner rather than dropped
 * inside the heading, because the table scrolls sideways and anything absolute
 * inside it is cut off at the edge.
 */
export function ColumnMenu({
  label,
  sortKey,
  sort,
  dir,
  onSort,
  kind = "none",
  filterKeys = [],
  filter = {},
  onFilter,
  values = [],
}: {
  label: string;
  /** Absent means this column does not sort (Short description); it may still narrow. */
  sortKey?: string;
  sort?: string;
  dir?: SortDir;
  onSort?: (key: string, dir: SortDir) => void;
  kind?: FilterKind;
  /** The address keys this column owns, so "Clear" knows what to take off. */
  filterKeys?: string[];
  filter?: Record<string, string | null | undefined>;
  onFilter?: (patch: Patch) => void;
  /** For "pick": the departments, projects or people this column can be narrowed to. */
  values?: Named[];
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const sorted = Boolean(sortKey) && sort === sortKey;
  const narrowed = filterKeys.some((k) => filter[k]);
  const canFilter = Boolean(onFilter) && kind !== "none";

  useLayoutEffect(() => {
    if (!open) return;
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const width = 232;
    setAt({ top: Math.round(r.bottom + 4), left: Math.round(Math.min(r.left, window.innerWidth - width - 8)) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    /* Follow the heading rather than closing. Reaching the last columns scrolls
       the table sideways, and closing on that shut the menu the instant it was
       opened — the click that opened it caused the scroll (2026-09-15). */
    const follow = () => {
      const r = button.current?.getBoundingClientRect();
      if (!r) return;
      const width = 232;
      setAt({ top: Math.round(r.bottom + 4), left: Math.round(Math.min(r.left, window.innerWidth - width - 8)) });
    };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open]);

  const words = sortKey ? sortWords(sortKey) : null;
  const pickSort = (d: SortDir) => {
    if (!sortKey || !onSort) return;
    setOpen(false);
    onSort(sortKey, d);
  };
  /* Narrowing leaves the menu OPEN (owner, 2026-09-16: "keep it open ... closes
     soon after selecting something"). Status and Priority take several at once,
     and shutting on the first tick meant re-opening the menu for every one.
     Sorting still closes: that is one decisive choice, not a list. The menu goes
     when you click away or press Escape. */
  const set = (patch: Patch) => {
    onFilter?.(patch);
  };
  /** One of a list: picking the same one again takes it off. */
  const only = (key: string, value: string) => set({ [key]: filter[key] === value ? null : value });
  /* One choice can stand for SEVERAL states: "New" is NEW and ASSIGNED together.
     Both of these used to compare that whole choice against the comma list it had
     just been split into, so "NEW,ASSIGNED" was never found among ["NEW",
     "ASSIGNED"]: the row never showed its tick, and pressing it again added it a
     second time instead of taking it off, leaving state=NEW,ASSIGNED,NEW,ASSIGNED.
     A choice is now its parts, so a row is ticked when all of its parts are on,
     and pressing it takes all of them off (2026-09-16). */
  const partsOf = (value: string) => value.split(",").filter(Boolean);
  const applied = (key: string) => (filter[key] ?? "").split(",").filter(Boolean);
  /** Several at once, held as a comma list. */
  const toggle = (key: string, value: string) => {
    const on = applied(key);
    const parts = partsOf(value);
    const allOn = parts.every((p) => on.includes(p));
    const next = allOn ? on.filter((v) => !parts.includes(v)) : [...on, ...parts.filter((p) => !on.includes(p))];
    set({ [key]: next.length ? next.join(",") : null });
  };
  const ticked = (key: string, value: string) => {
    const on = applied(key);
    const parts = partsOf(value);
    return parts.length > 0 && parts.every((p) => on.includes(p));
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`What ${label} can do`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          // Always there, never fading in on hover: a control you cannot see is a
          // control that does not exist (owner, 2026-09-15).
          "grid h-6 w-6 shrink-0 place-items-center rounded transition-opacity hover:bg-line/60",
          sorted || narrowed ? "text-primary-ink opacity-100" : "text-muted opacity-70 hover:opacity-100 focus-visible:opacity-100",
          open && "opacity-100",
        )}
      >
        <ListFilter className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </button>

      {open && at ? (
        <div
          ref={panel}
          role="menu"
          aria-label={label}
          style={{ position: "fixed", top: at.top, left: at.left, width: 232 }}
          className="z-drawer max-h-[70vh] overflow-y-auto rounded-[3px] border border-line bg-surface py-1 text-left font-normal shadow-e2"
        >
          <p className="px-3 pb-1 pt-0.5 text-micro font-semibold uppercase tracking-wider text-muted">{label}</p>

          {words && sortKey && onSort ? (
            <>
              <Row picked={sorted && dir === "asc"} onClick={() => pickSort("asc")}>{words.asc}</Row>
              <Row picked={sorted && dir === "desc"} onClick={() => pickSort("desc")}>{words.desc}</Row>
            </>
          ) : null}

          {canFilter ? (
            <>
              <hr className="my-1 border-line" />
              {kind === "search" ? <SearchRow value={filter[filterKeys[0]] ?? ""} onSet={(v) => set({ [filterKeys[0]]: v || null })} label={label} /> : null}

              {kind === "pick" ? (
                values.length === 0 ? (
                  <p className="px-3 py-1.5 text-[13px] text-muted">Nothing to pick from.</p>
                ) : (
                  values.slice(0, 40).map((v) => (
                    <Row key={v.id} picked={filter[filterKeys[0]] === v.id} onClick={() => only(filterKeys[0], v.id)}>
                      {v.name}
                    </Row>
                  ))
                )
              ) : null}

              {kind === "status"
                ? STATUS_CHOICES.map((s) => (
                    <Row key={s.value} picked={ticked(filterKeys[0], s.value)} onClick={() => toggle(filterKeys[0], s.value)}>
                      {s.label}
                    </Row>
                  ))
                : null}

              {kind === "priority"
                ? WORK_PRIORITIES.map((p) => (
                    <Row key={p} picked={ticked(filterKeys[0], p)} onClick={() => toggle(filterKeys[0], p)}>
                      {WORK_PRIORITY_LABEL[p]}
                    </Row>
                  ))
                : null}

              {kind === "due" ? (
                <>
                  <Row picked={Boolean(filter.dueToday)} onClick={() => set({ dueToday: filter.dueToday ? null : "1", overdue: null, dueFrom: null, dueTo: null })}>Today</Row>
                  <Row picked={filter.dueTo === day(7)} onClick={() => set({ dueFrom: day(0), dueTo: day(7), dueToday: null, overdue: null })}>This week</Row>
                  <Row picked={Boolean(filter.overdue)} onClick={() => set({ overdue: filter.overdue ? null : "1", dueToday: null, dueFrom: null, dueTo: null })}>Overdue</Row>
                  <Between from={filter.dueFrom ?? ""} to={filter.dueTo ?? ""} onSet={(from, to) => set({ dueFrom: from || null, dueTo: to || null, dueToday: null, overdue: null })} />
                </>
              ) : null}

              {kind === "dates" ? (
                <>
                  <Row picked={filter[filterKeys[0]] === day(0)} onClick={() => set({ [filterKeys[0]]: day(0), [filterKeys[1]]: day(0) })}>Today</Row>
                  <Row picked={filter[filterKeys[0]] === day(-7)} onClick={() => set({ [filterKeys[0]]: day(-7), [filterKeys[1]]: null })}>This week</Row>
                  <Between from={filter[filterKeys[0]] ?? ""} to={filter[filterKeys[1]] ?? ""} onSet={(from, to) => set({ [filterKeys[0]]: from || null, [filterKeys[1]]: to || null })} />
                </>
              ) : null}

              {narrowed ? (
                <>
                  <hr className="my-1 border-line" />
                  <Row picked={false} onClick={() => set(Object.fromEntries(filterKeys.map((k) => [k, null])))}>
                    Clear {label.toLowerCase()}
                  </Row>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function Row({ picked, onClick, children }: { picked: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={picked}
      onClick={onClick}
      className="flex min-h-[32px] w-full items-center gap-2 px-3 text-[13px] text-ink hover:bg-hover"
    >
      <Check className={cn("h-3.5 w-3.5 shrink-0", picked ? "text-primary-ink" : "opacity-0")} aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}

/** Words to look for, applied on Enter so it does not search every keystroke. */
function SearchRow({ value, onSet, label }: { value: string; onSet: (v: string) => void; label: string }) {
  const [draft, setDraft] = useState(value);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSet(draft.trim());
      }}
      className="px-3 py-1.5"
    >
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label={`Words in ${label}`}
        placeholder="Type and press enter"
        className="h-8 w-full rounded-[3px] border border-line bg-surface px-2 text-[13px] text-ink outline-none placeholder:text-muted"
      />
    </form>
  );
}

/** Between two days. Both ends are optional — one alone means from, or until. */
function Between({ from, to, onSet }: { from: string; to: string; onSet: (from: string, to: string) => void }) {
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSet(a, b);
      }}
      className="space-y-1 px-3 py-1.5"
    >
      <input type="date" value={a} onChange={(e) => setA(e.target.value)} aria-label="From" className="h-8 w-full rounded-[3px] border border-line bg-surface px-2 text-[13px] text-ink outline-none" />
      <input type="date" value={b} onChange={(e) => setB(e.target.value)} aria-label="To" className="h-8 w-full rounded-[3px] border border-line bg-surface px-2 text-[13px] text-ink outline-none" />
      <button type="submit" className="h-8 w-full rounded-[3px] bg-hover text-[13px] font-medium text-ink hover:bg-line/60">
        Between these days
      </button>
    </form>
  );
}
