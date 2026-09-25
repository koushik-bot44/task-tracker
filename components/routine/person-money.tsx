"use client";

import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { usePersonAddMoney, usePersonDeleteMoney, usePersonMoney } from "@/lib/hooks/use-routine";
import { useToast } from "@/components/toast";
import type { MoneyEntryDTO, MoneyKind } from "@/lib/types";
import { inputCls, prettyDate } from "./shared";

/* Month helpers — keys are IST "YYYY-MM"; read as UTC so the label never shifts
   under the phone's timezone (same approach as prettyDate in ./shared). */
export const monthLabel = (m: string) => new Date(`${m}-01T00:00:00.000Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
export const shiftMonth = (m: string, n: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
/** Whole rupees with the sign and Indian grouping: 2450 -> "₹2,450". */
export const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/**
 * The person's own pocket-money page (2026-09-25) — one month at a time. The
 * parent side logs what was GIVEN, the person logs what they SPENT (either side
 * may write either line; the API only guards the date). The person removes only
 * lines they wrote themselves. New lines always land on today, so the add line
 * shows only while the current month is open — a past month is a record.
 */
export function PersonMoney({ today }: { today: string }) {
  const currentMonth = today.slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const atCurrent = month >= currentMonth;
  const { data, isLoading, isError } = usePersonMoney(month);
  const addMoney = usePersonAddMoney();
  const deleteMoney = usePersonDeleteMoney();
  const { show: toast } = useToast();
  const err = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<MoneyKind>("SPENT");
  const amountNum = Number(amount);
  const canAdd = amountNum > 0 && note.trim().length > 0 && !addMoney.isPending;

  const add = () => {
    if (!canAdd) return;
    addMoney.mutate(
      { date: today, amount: amountNum, kind, note: note.trim() },
      {
        onSuccess: () => {
          setAmount("");
          setNote("");
        },
        onError: err,
      },
    );
  };

  const entries = data?.entries ?? [];

  return (
    <div>
      {/* Month header — previous / next, never past the current month. */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month" className="pk-press pk-btn grid h-11 w-11 shrink-0 place-items-center rounded-card">
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <h2 className="pk-fg min-w-0 truncate text-center font-display text-lg font-semibold">{monthLabel(month)}</h2>
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={atCurrent} aria-label="Next month" className="pk-press pk-btn grid h-11 w-11 shrink-0 place-items-center rounded-card disabled:opacity-30">
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {/* The two figures for the month. */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Figure label="Got" value={data?.given ?? 0} tone="ok" />
        <Figure label="Spent" value={data?.spent ?? 0} />
      </div>

      {atCurrent ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 7))}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            inputMode="numeric"
            placeholder="₹"
            aria-label="Amount in rupees"
            // inputCls carries w-full; a flex-basis wins over width inside the flex row.
            className={cn(inputCls, "shrink-0 grow-0 basis-24 tabular-nums")}
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="What for?"
            aria-label="What for"
            maxLength={120}
            className={cn(inputCls, "min-w-[8rem] flex-1")}
          />
          {/* Below 640px this pair drops to its own line; wider, it sits on the same line. */}
          <div className="flex basis-full items-center gap-2 sm:basis-auto">
            <div role="group" aria-label="Got or spent" className="flex flex-1 gap-1.5 sm:flex-none">
              {(["GIVEN", "SPENT"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={cn("press h-11 flex-1 rounded-card px-4 text-sm font-medium sm:flex-none", kind === k ? "pk-tab-active" : "pk-chip pk-fg-soft")}
                >
                  {k === "GIVEN" ? "Got" : "Spent"}
                </button>
              ))}
            </div>
            <button type="button" onClick={add} disabled={!canAdd} aria-label="Add" className="press grid h-11 w-11 shrink-0 place-items-center rounded-card bg-primary text-on-primary disabled:opacity-40">
              <Plus className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <p className="py-6 text-center text-sm pk-fg-soft">Loading…</p>
      ) : isError ? (
        <p className="py-6 text-center text-sm pk-fg-soft">Couldn’t load this month.</p>
      ) : entries.length === 0 ? (
        <p className="py-6 text-center text-sm pk-fg-soft">Nothing this month yet.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <EntryRow key={e.id} entry={e} onRemove={e.side === "PERSON" ? () => deleteMoney.mutate(e.id, { onError: err }) : undefined} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Got ₹2,450" as one line of text (label small, figure big). */
function Figure({ label, value, tone }: { label: string; value: number; tone?: "ok" }) {
  return (
    <p className="min-w-0 rounded-card pk-cell p-3">
      <span className="block text-micro font-semibold pk-fg-soft">{label}</span>{" "}
      <span className={cn("block truncate font-display text-2xl font-bold tabular-nums", tone === "ok" ? "text-ok-ink" : "pk-fg")}>{rupees(value)}</span>
    </p>
  );
}

/** One ledger line: the note, with the date (and who wrote it, when it was the
    parent side) in soft text under it, then the amount. The note may wrap to two
    lines — the person wrote it and wants to read it back. */
function EntryRow({ entry, onRemove }: { entry: MoneyEntryDTO; onRemove?: () => void }) {
  const given = entry.kind === "GIVEN";
  return (
    <li className="flex items-center gap-2.5 rounded-card pk-cell py-2 pl-3 pr-1">
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words text-sm pk-fg">{entry.note}</span>
        <span className="block truncate text-micro pk-fg-soft">
          {prettyDate(entry.date)}
          {entry.side === "PARENT" ? ` · ${entry.addedByName}` : ""}
        </span>
      </span>
      <span className={cn("shrink-0 text-sm font-semibold tabular-nums", given ? "text-ok-ink" : "pk-fg")}>
        {given ? "+" : "-"}{rupees(entry.amount)}
      </span>
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label={`Remove ${entry.note}`} className="press grid h-11 w-10 shrink-0 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:text-danger-ink">
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <span className="h-11 w-10 shrink-0" aria-hidden />
      )}
    </li>
  );
}
