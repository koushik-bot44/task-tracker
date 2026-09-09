"use client";

import { useEffect, useState } from "react";
import { rolesOfferedTo } from "@/components/people/person-sheet";
import { Button } from "@/components/ui/button";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { useUserMutations } from "@/lib/hooks/use-users";
import { ROLE_LABEL, type DepartmentDTO, type UserDTO, type UserRole } from "@/lib/types";

/**
 * Invite someone: name, email, role (only the roles this person may hand
 * out), and — optionally — where they sit. They get an email with a link to
 * set their own password; the account stays "Invited" until they do.
 *
 * A person may hold several addresses (2026-09-09). The first is the one the
 * invite is sent to; every one of them signs them in afterwards.
 */
export function InviteSheet({
  open,
  onClose,
  me,
  departments,
}: {
  open: boolean;
  onClose: () => void;
  me: UserDTO;
  departments: DepartmentDTO[];
}) {
  const { createUser } = useUserMutations();
  const { show: toast } = useToast();
  const roles = rolesOfferedTo(me.role);
  const defaultRole: UserRole | null = roles.includes("RESOURCE") ? "RESOURCE" : roles[roles.length - 1] ?? null;

  const [name, setName] = useState("");
  /** One row per address; the first is their main one. */
  const [emails, setEmails] = useState<string[]>([""]);
  const [role, setRole] = useState<UserRole | null>(defaultRole);
  const [departmentId, setDepartmentId] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setEmails([""]);
    setRole(defaultRole);
    setDepartmentId("");
  }, [open, defaultRole]);

  const filled = emails.map((e) => e.trim()).filter(Boolean);
  const ready = name.trim().length > 0 && filled.length > 0 && role !== null;

  const submit = () => {
    if (!ready || !role) return;
    const [main, ...rest] = filled;
    createUser.mutate(
      { name: name.trim(), email: main, ...(rest.length ? { emails: rest } : {}), role, departmentId: departmentId || null },
      {
        onSuccess: ({ user, emailSent }) => {
          toast({
            message: emailSent ? `Invite sent to ${user.email}.` : `${user.name} added, but the invite email didn't send — try Resend.`,
            tone: emailSent ? undefined : "danger",
          });
          onClose();
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invite someone"
      subtitle="They'll get an email to set a password."
      footer={
        <Button variant="primary" full onClick={submit} disabled={!ready} loading={createUser.isPending}>
          Send invite
        </Button>
      }
    >
      <div className="space-y-4 pt-1">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="Their full name" className={inputClass} autoFocus />
        </Field>
        <Field label={emails.length > 1 ? "Emails" : "Email"} hint={emails.length > 1 ? "The invite goes to the first one; any of them signs them in." : undefined}>
          <div className="space-y-2">
            {emails.map((value, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="email"
                  value={value}
                  onChange={(e) => setEmails((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  autoComplete="off"
                  inputMode="email"
                  placeholder={i === 0 ? "name@company.com" : "their other address"}
                  aria-label={i === 0 ? "Email" : `Another email (${i + 1})`}
                  className={inputClass}
                  autoFocus={i > 0}
                />
                {emails.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setEmails((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Remove this email"
                    className="press grid h-12 w-10 shrink-0 place-items-center rounded-full text-lg text-muted hover:text-danger-ink"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEmails((prev) => [...prev, ""])}
            className="press mt-2 min-h-[32px] text-micro font-medium text-primary-ink"
          >
            + Another email for this person
          </button>
        </Field>
        <Field label="Role">
          <select value={role ?? ""} onChange={(e) => setRole(e.target.value as UserRole)} className={cn(inputClass, "appearance-none")}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        {departments.length > 0 ? (
          <Field label="Department" hint="You can place them later.">
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={cn(inputClass, "appearance-none")}>
              <option value="">Not placed yet</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
    </Sheet>
  );
}
