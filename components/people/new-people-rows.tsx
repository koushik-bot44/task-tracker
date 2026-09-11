"use client";

import { Field, inputClass } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { ROLE_LABEL, type UserRole } from "@/lib/types";

/**
 * Someone not on Orbit yet: a name, one or more addresses (the first gets the
 * invite), a position — a Team member unless one is picked — and, where the
 * screen asks, the department they sit in.
 */
export type NewPerson = { name: string; emails: string[]; role: UserRole; departmentId: string };

export const blankPerson = (departmentId = ""): NewPerson => ({ name: "", emails: [""], role: "RESOURCE", departmentId });

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The rows as the server takes them: trimmed, and only the people given an address. */
export function toInvites(rows: NewPerson[]): { name: string; emails: string[]; role: UserRole; departmentId: string | null }[] {
  return rows
    .map((p) => ({ name: p.name.trim(), emails: p.emails.map((e) => e.trim()).filter(Boolean), role: p.role, departmentId: p.departmentId || null }))
    .filter((p) => p.emails.length > 0);
}

/** What stops the rows being sent, in words — or null when nothing does. */
export function invitesProblem(rows: NewPerson[], opts: { needDepartment?: boolean } = {}): string | null {
  const seen = new Set<string>();
  for (const p of rows) {
    const name = p.name.trim();
    const emails = p.emails.map((e) => e.trim()).filter(Boolean);
    if (!emails.length) {
      // A name with no address used to be dropped without a word (2026-09-11).
      if (name) return `Write an email for ${name}.`;
      continue;
    }
    for (const e of emails) {
      if (!EMAIL_SHAPE.test(e)) return `“${e}” doesn't look like an email.`;
      if (seen.has(e.toLowerCase())) return `${e} is written twice.`;
      seen.add(e.toLowerCase());
    }
    if (opts.needDepartment && !p.departmentId) return `Pick a department for ${name || emails[0]}.`;
  }
  return null;
}

/**
 * People who are not on Orbit yet, one row each — the same rows on People →
 * Invite, a new project, a project's Add people and a new task (owner,
 * 2026-09-10; several people at once, with a position or without, everywhere:
 * 2026-09-11). A person may hold several addresses; the first is where the
 * invite goes. `roles` offers a position when there is more than one to give;
 * `departments` offers where each person sits.
 */
export function NewPeopleRows({
  rows,
  onChange,
  roles,
  departments,
  allowUnplaced = true,
  defaultDepartmentId = "",
  addLabel = "+ Someone not on Orbit yet",
  autoFocusLast = false,
}: {
  rows: NewPerson[];
  onChange: (rows: NewPerson[]) => void;
  /** The positions the person inviting may give. Leaving it is a Team member. */
  roles?: UserRole[];
  /** Offer a department per person. Without it, the screen's own department is used. */
  departments?: { id: string; name: string }[];
  /** "Not placed yet" is a choice (the CEO); a head or a manager places everyone. */
  allowUnplaced?: boolean;
  /** Where a newly added row starts. */
  defaultDepartmentId?: string;
  addLabel?: string;
  /** A row added by a tap takes the cursor. */
  autoFocusLast?: boolean;
}) {
  const edit = (i: number, patch: Partial<NewPerson>) => onChange(rows.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const offered = roles ?? [];
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

            {offered.length > 1 ? (
              <Field label="Position" hint={p.role === "RESOURCE" ? "No position to give? Leave Team member — it can be changed later on People." : undefined}>
                <select
                  value={offered.includes(p.role) ? p.role : "RESOURCE"}
                  onChange={(e) => edit(i, { role: e.target.value as UserRole })}
                  aria-label={`Position for ${who}`}
                  className={cn(inputClass, "appearance-none")}
                >
                  {offered.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {departments && departments.length ? (
              <Field label="Department" hint={p.role === "HOD" ? "They become this department's head if it has none yet." : undefined}>
                <select value={p.departmentId} onChange={(e) => edit(i, { departmentId: e.target.value })} aria-label={`Department for ${who}`} className={cn(inputClass, "appearance-none")}>
                  <option value="">{allowUnplaced ? "Not placed yet" : "Pick a department…"}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>
        );
      })}

      <button type="button" onClick={() => onChange([...rows, blankPerson(defaultDepartmentId)])} className="press min-h-[32px] text-sm font-medium text-primary-ink">
        {addLabel}
      </button>
    </div>
  );
}
