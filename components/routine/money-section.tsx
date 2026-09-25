"use client";

import { ChevronLeft, ChevronRight, Loader2, Wallet, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useMoney, useRoutineMutations } from "@/lib/hooks/use-routine";
import { useToast } from "@/components/toast";
import type { MoneyEntryDTO, MoneyKind, MoneyMonthDTO } from "@/lib/types";
import { inputCls, prettyDate } from "./shared";

/** Whole rupees with the sign and Indian grouping: 2450 -> "₹2,450". */
export const rupees = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;

/** "2026-09" -> "September 2026" (read as UTC so the month never shifts). */
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00.000Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
/** Step a "YYYY-MM" key by n months. */
const addMonths = (m: string, n: number) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7);
};

/**
 * Pocket money, kept by hand (2026-09-25). The parent mostly logs what was GIVEN;
 * the person logs what they SPENT from their own screen. One calendar month at a
 * time, the two totals big at the top, every line below, newest first. Nothing is
 * computed beyond the two sums — this is a ledger, not a bank.
 */
export function MoneySection({ personId, weekParam, readOnly = false, today }: { personId: string | null; weekParam: string | null; readOnly?: boolean; today: string }) {
  // null = the current month (the server picks); "YYYY-MM" = a specific month.
  const [month, setMonth] = useState<string | null>(null);
  const currentMonth = today.slice(0, 7);
  const shown = month ?? currentMonth;
  const { data, isLoading } = useMoney(month, personId);
  const { addMoney, deleteMoney } = useRoutineMutations(weekParam, personId);
  const { show: toast } = useToast();
  const err = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });

  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<MoneyKind>("GIVEN");
  const [date, setDate] = useState(today);

  const go = (n: number) => {
    const next = addMonths(shown, n);
    setMonth(next === currentMonth ? null : next);
  };
  const atCurrent = shown >= currentMonth;

  const save = () => {
    const value = Number(amount);
    if (!Number.isInteger(value) || value <= 0) return toast({ message: "Enter the amount in whole rupees.", tone: "danger" });
    if (!note.trim()) return toast({ message: "Say what it was for.", tone: "danger" });
    if (note.trim().length > 120) return toast({ message: "Keep the note under 120 letters.", tone: "danger" });
    if (!date || date > today) return toast({ message: "The date can't be after today.", tone: "danger" });
    addMoney.mutate(
      { date, amount: value, kind, note: note.trim() },
      {
        onSuccess: () => {
          setAmount("");
          setNote("");
          setKind("GIVEN");
          setDate(today);
          setAdding(false);
          // A line dated in another month lands there — take them to it.
          const m = date.slice(0, 7);
          setMonth(m === currentMonth ? null : m);
          toast({ message: "Saved" });
        },
        onError: err,
      },
    );
  };

  const remove = (e: MoneyEntryDTO) => {
    if (!window.confirm(`Remove ${rupees(e.amount)} ${e.kind === "GIVEN" ? "given" : "spent"} — ${e.note}?`)) return;
    deleteMoney.mutate(e.id, { onError: err });
  };

  const entries = data?.entries ?? [];

  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Wallet className="h-5 w-5 shrink-0 pk-fg-soft" strokeWidth={2} aria-hidden />
          <h2 className="font-display text-lg font-semibold pk-fg">Money</h2>
        </div>
        {readOnly ? null : (
          <button type="button" onClick={() => setAdding((v) => !v)} className="press h-11 shrink-0 rounded-card px-3 text-sm font-medium pk-fg hover:bg-[color:var(--pk-cell)]">
            {adding ? "Close" : "Add"}
          </button>
        )}
      </div>

      {/* Month nav — the Money tab keeps its own calendar, apart from the week. */}
      <div className="mb-3 flex items-center justify-between gap-2 rounded-card pk-cell px-1 py-1">
        <button type="button" onClick={() => go(-1)} aria-label="Previous month" className="press grid h-11 w-11 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:pk-fg">
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <p className="min-w-0 truncate text-center text-sm font-semibold pk-fg">{monthLabel(shown)}</p>
        <button type="button" onClick={() => go(1)} disabled={atCurrent} aria-label="Next month" className="press grid h-11 w-11 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:pk-fg disabled:opacity-30 disabled:hover:bg-transparent">
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="min-w-0 rounded-card pk-cell px-3 py-2.5">
          <p className="text-micro font-medium pk-fg-soft">Given</p>
          <p className="truncate font-display text-xl font-semibold tabular-nums text-ok-ink">{rupees(data?.given ?? 0)}</p>
        </div>
        <div className="min-w-0 rounded-card pk-cell px-3 py-2.5">
          <p className="text-micro font-medium pk-fg-soft">Spent</p>
          <p className="truncate font-display text-xl font-semibold tabular-nums pk-fg">{rupees(data?.spent ?? 0)}</p>
        </div>
      </div>

      {adding && !readOnly ? (
        <div className="mb-4 space-y-2 rounded-card pk-cell p-3">
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="₹"
              aria-label="Amount in rupees"
              className={cn(inputCls, "w-28 shrink-0 tabular-nums")}
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              maxLength={120}
              placeholder="What for?"
              aria-label="What for"
              className={cn(inputCls, "min-w-0 flex-1")}
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="pk-glass inline-flex h-11 shrink-0 items-center rounded-card" role="group" aria-label="Given or spent">
              {(["GIVEN", "SPENT"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={cn("pk-press h-11 rounded-card px-3 text-sm font-medium", kind === k ? "pk-tab-active" : "pk-tab pk-tab-hover")}>
                  {k === "GIVEN" ? "Given" : "Spent"}
                </button>
              ))}
            </div>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="Date" className={cn(inputCls, "min-w-0 flex-1")} />
          </div>
          <button type="button" onClick={save} disabled={addMoney.isPending} className="press flex h-11 w-full items-center justify-center gap-2 rounded-card bg-primary text-sm font-medium text-on-primary disabled:opacity-40">
            {addMoney.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save
          </button>
        </div>
      ) : null}

      {isLoading && !data ? (
        <p className="py-4 text-center text-sm pk-fg-soft">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="py-4 text-center text-sm pk-fg-soft">Nothing this month yet.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-card pk-cell px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm pk-fg">{e.note}</p>
                <p className="truncate text-micro pk-fg-soft">{prettyDate(e.date)} · {e.addedByName}</p>
              </div>
              <span className={cn("shrink-0 text-sm font-semibold tabular-nums", e.kind === "GIVEN" ? "text-ok-ink" : "pk-fg")}>
                {e.kind === "GIVEN" ? "+" : "−"}{rupees(e.amount)}
              </span>
              {readOnly ? null : (
                <button type="button" onClick={() => remove(e)} aria-label={`Remove ${e.note}`} className="press -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:text-danger-ink">
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The compact card on Summary: this month's two totals and a way into the tab. */
export function MoneyCard({ money, onOpen }: { money: MoneyMonthDTO; onOpen: () => void }) {
  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      {/* The two figures get their own line under the heading, so neither is cut off beside the
          button on a phone (rig, 2026-09-25). */}
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 font-display text-lg font-semibold pk-fg">Money this month</h2>
        <button type="button" onClick={onOpen} className="pk-press pk-btn inline-flex h-11 shrink-0 items-center gap-1.5 rounded-card px-4 text-sm font-medium">
          <Wallet className="h-4 w-4" aria-hidden /> Open Money
        </button>
      </div>
      <p className="mt-1 text-sm tabular-nums pk-fg-soft">
        Given <span className="font-semibold text-ok-ink">{rupees(money.given)}</span> · Spent <span className="font-semibold pk-fg">{rupees(money.spent)}</span>
      </p>
    </section>
  );
}
