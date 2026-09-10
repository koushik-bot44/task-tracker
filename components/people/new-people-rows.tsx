"use client";

import { Field, inputClass } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

/** Someone not on Orbit yet: a name, one or more addresses (the first gets the invite), and how they join. */
export type NewPerson = { name: string; emails: string[]; role: "RESOURCE" | "TEAM_LEAD" };

export const blankPerson = (): NewPerson => ({ name: "", emails: [""], role: "RESOURCE" });

const JOINS_AS: Record<NewPerson["role"], string> = { RESOURCE: "Team member", TEAM_LEAD: "Team lead" };
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The rows as the server takes them: trimmed, and only the people given an address. */
export function toInvites(rows: NewPerson[]): { name: string; emails: string[]; role: NewPerson["role"] }[] {
  return rows
    .map((p) => ({ name: p.name.trim(), emails: p.emails.map((e) => e.trim()).filter(Boolean), role: p.role }))
    .filter((p) => p.emails.length > 0);
}

/** What stops the rows being sent, in words — or null when nothing does. */
export function invitesProblem(rows: NewPerson[]): string | null {
  const seen = new Set<string>();
  for (const p of toInvites(rows)) {
    for (const e of p.emails) {
      if (!EMAIL_SHAPE.test(e)) return `“${e}” doesn't look like an email.`;
      if (seen.has(e.toLowerCase())) return `${e} is written twice.`;
      seen.add(e.toLowerCase());
    }
  }
  return null;
}

/**
 * People who are not on Orbit yet, one row each — the same rows when a project
 * is made and when people are added to it later (owner, 2026-09-10). A person
 * may hold several addresses; the first is where the invite goes. `roles`
 * offers "Joins as" when there is more than one to choose from.
 */
export function NewPeopleRows({
  rows,
  onChange,
  roles,
  addLabel = "+ Someone not on Orbit yet",
  autoFocusLast = false,
}: {
  rows: NewPerson[];
  onChange: (rows: NewPerson[]) => void;
  roles?: NewPerson["role"][];
  addLabel?: string;
  /** A row added by a tap takes the cursor. */
  autoFocusLast?: boolean;
}) {
  const edit = (i: number, patch: Partial<NewPerson>) => onChange(rows.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-3">
      {rows.map((p, i) => {
        const who = p.name.trim() || `new person ${i + 1}`;
        return (
          <div key={i} className="space-y-2 rounded-input bg-hover p-3">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Field label="Name">
                  <input
                    value={p.name}
                    onChange={(e) => edit(i, { name: e.target.value })}
                    placeholder="Kiran"
                    aria-label={`Name of ${who}`}
                    autoComplete="off"
                    autoFocus={autoFocusLast && i === rows.length - 1}
                    className={inputClass}
                  />
                </Field>
              </div>
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                aria-label={`Remove ${who}`}
                className="press mb-0.5 grid h-12 w-10 shrink-0 place-items-center rounded-full text-lg text-muted hover:text-danger-ink"
              >
                ×
              </button>
            </div>

            {/* One person can hold several addresses; the first is the one written to. */}
            <Field label={p.emails.length > 1 ? "Emails" : "Email"} hint={p.emails.length > 1 ? "The invite goes to the first one." : undefined}>
              <div className="space-y-2">
                {p.emails.map((email, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      value={email}
                      onChange={(e) => edit(i, { emails: p.emails.map((x, k) => (k === j ? e.target.value : x)) })}
                      placeholder={j === 0 ? "kiran@company.com" : "their other address"}
                      aria-label={j === 0 ? `Email for ${who}` : `Another email for ${who}`}
                      className={inputClass}
                    />
                    {p.emails.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => edit(i, { emails: p.emails.filter((_, k) => k !== j) })}
                        aria-label={`Remove this email for ${who}`}
                        className="press grid h-12 w-10 shrink-0 place-items-center rounded-full text-lg text-muted hover:text-danger-ink"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </Field>

            <button type="button" onClick={() => edit(i, { emails: [...p.emails, ""] })} className="press min-h-[32px] text-micro font-medium text-primary-ink">
              + Another email for this person
            </button>

            {roles && roles.length > 1 ? (
              <Field label="Joins as">
                <select
                  value={p.role}
                  onChange={(e) => edit(i, { role: e.target.value as NewPerson["role"] })}
                  aria-label={`How ${who} joins`}
                  className={cn(inputClass, "appearance-none")}
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {JOINS_AS[r]}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>
        );
      })}

      <button type="button" onClick={() => onChange([...rows, blankPerson()])} className="press min-h-[32px] text-sm font-medium text-primary-ink">
        {addLabel}
      </button>
    </div>
  );
}
