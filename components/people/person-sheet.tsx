"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Face } from "@/components/ui/face";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { useUserMutations } from "@/lib/hooks/use-users";
import { ROLE_RANK, canAdministerAccountsRole, isAdminRole, wearsNoDesignation } from "@/lib/roles";
import { ROLE_LABEL, ROLES, type DepartmentDTO, type UserDTO, type UserRole } from "@/lib/types";

/** Roles People can ever hand out — never ADMIN, PERSON or FOUNDER. */
export const ASSIGNABLE_ROLES = ROLES.filter((r) => r !== "ADMIN" && r !== "PERSON" && r !== "FOUNDER") as UserRole[];

/**
 * Mirror of the server's assertCanCreateUserWithRole: chain actors offer
 * strictly lower ranks; the
 * admin offers manager and below. Hiding is a courtesy — the server decides.
 */
export function rolesOfferedTo(actor: UserRole | null | undefined): UserRole[] {
  if (!actor || !canAdministerAccountsRole(actor)) return [];
  const ceiling = isAdminRole(actor)
    ? ROLE_RANK.MANAGER
    : actor === "FOUNDER"
      ? ROLE_RANK.FOUNDER
      : ROLE_RANK[actor] - 1;
  return ASSIGNABLE_ROLES.filter((r) => ROLE_RANK[r] <= ceiling);
}

/** Mirror of assertCanAdministerTarget — may this actor open this person's controls? */
export function canAdministerTarget(actor: UserRole | null | undefined, target: UserRole): boolean {
  if (!actor || !canAdministerAccountsRole(actor)) return false;
  if (target === "PERSON") return false;
  if (target === "ADMIN") return isAdminRole(actor);
  if (target === "FOUNDER") return actor === "FOUNDER";
  if (isAdminRole(actor)) return ROLE_RANK[target] <= ROLE_RANK.MANAGER;
  return ROLE_RANK[target] < ROLE_RANK[actor];
}

const PHONE = /^\+[1-9]\d{6,14}$/;

/**
 * One person's account, for those allowed to run it: where they sit, their
 * role, their WhatsApp number, and the account switches (reset, disable,
 * resend or cancel an invite, delete).
 */
export function PersonSheet({
  user,
  me,
  departments,
  onClose,
}: {
  user: UserDTO | null;
  me: UserDTO;
  departments: DepartmentDTO[];
  onClose: () => void;
}) {
  return (
    <Sheet
      open={Boolean(user)}
      onClose={onClose}
      title={user?.name ?? ""}
      subtitle={user ? [wearsNoDesignation(user.role) ? null : ROLE_LABEL[user.role], user.departmentName].filter(Boolean).join(" · ") || undefined : undefined}
    >
      {user ? <PersonBody user={user} me={me} departments={departments} onClose={onClose} /> : null}
    </Sheet>
  );
}

type Action = "name" | "email" | "department" | "role" | "phone" | "reset" | "disable" | "resend" | "cancel" | "delete" | "password";

function PersonBody({ user, me, departments, onClose }: { user: UserDTO; me: UserDTO; departments: DepartmentDTO[]; onClose: () => void }) {
  const { updateUser, updateMe, resendInvite, cancelInvite, setPassword } = useUserMutations();
  const { show: toast } = useToast();
  const [action, setAction] = useState<Action | null>(null);
  const [reveal, setReveal] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [phone, setPhone] = useState(user.phone ?? "");
  const savedPhone = user.phone ?? "";
  useEffect(() => setPhone(savedPhone), [savedPhone]);
  const [name, setName] = useState(user.name);
  useEffect(() => setName(user.name), [user.name]);
  const [email, setEmail] = useState(user.email);
  useEffect(() => setEmail(user.email), [user.email]);

  const isSelf = user.id === me.id;
  const pending = user.status === "PENDING";
  const disabled = user.disabledAt !== null;
  const offered = rolesOfferedTo(me.role);
  const roleChoices = offered.includes(user.role) ? offered : [user.role, ...offered];
  const roleLocked = user.role === "ADMIN" || user.role === "FOUNDER" || offered.length === 0;
  const busy = updateUser.isPending || updateMe.isPending || resendInvite.isPending || cancelInvite.isPending || setPassword.isPending;
  const trimmedName = name.trim();
  const nameDirty = trimmedName !== user.name;
  const nextEmail = email.trim().toLowerCase();
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextEmail);
  const emailDirty = nextEmail !== user.email;

  const savePassword = () => {
    const pw = (newPassword ?? "").trim();
    if (pw.length < 6) return;
    setAction("password");
    setPassword.mutate(
      { id: user.id, password: pw },
      {
        onSuccess: () => {
          setNewPassword(null);
          toast({ message: `Password set — tell ${user.name} personally. They can sign in with it right away.` });
        },
        onError: fail,
        onSettled: done,
      },
    );
  };

  const trimmedPhone = phone.trim();
  const phoneValid = trimmedPhone === "" || PHONE.test(trimmedPhone);
  const phoneDirty = trimmedPhone !== savedPhone;

  const fail = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });
  const done = () => setAction(null);

  // A name can change as often as it needs to (owner, 2026-09-10); your own goes through your account.
  const saveName = () => {
    if (!trimmedName || !nameDirty) return;
    setAction("name");
    const after = { onSuccess: () => toast({ message: `Name saved: ${trimmedName}` }), onError: fail, onSettled: done };
    if (isSelf) updateMe.mutate({ name: trimmedName }, after);
    else updateUser.mutate({ id: user.id, patch: { name: trimmedName } }, after);
  };

  // The address someone signs in with, changed as often as needed (owner, 2026-09-10).
  const saveEmail = () => {
    if (!emailValid || !emailDirty) return;
    setAction("email");
    updateUser.mutate(
      { id: user.id, patch: { email: nextEmail } },
      { onSuccess: () => toast({ message: `${user.name} signs in with ${nextEmail} now` }), onError: fail, onSettled: done },
    );
  };

  const setDepartment = (departmentId: string | null) => {
    setAction("department");
    const deptName = departments.find((d) => d.id === departmentId)?.name;
    updateUser.mutate(
      { id: user.id, patch: { departmentId } },
      {
        onSuccess: () => toast({ message: deptName ? `${user.name} is now in ${deptName}` : `${user.name} is not placed in a department` }),
        onError: fail,
        onSettled: done,
      },
    );
  };

  const setRole = (role: UserRole) => {
    setAction("role");
    updateUser.mutate(
      { id: user.id, patch: { role } },
      { onSuccess: () => toast({ message: `${user.name} is now ${ROLE_LABEL[role]}` }), onError: fail, onSettled: done },
    );
  };

  const savePhone = () => {
    if (!phoneValid || !phoneDirty) return;
    setAction("phone");
    updateUser.mutate(
      { id: user.id, patch: { phone: trimmedPhone === "" ? null : trimmedPhone } },
      {
        onSuccess: () => toast({ message: trimmedPhone ? `WhatsApp number saved for ${user.name}.` : `WhatsApp number removed for ${user.name}.` }),
        onError: fail,
        onSettled: done,
      },
    );
  };

  const reset = () => {
    setAction("reset");
    updateUser.mutate(
      { id: user.id, patch: { reset: true } },
      {
        onSuccess: ({ tempPassword }) => {
          if (tempPassword) setReveal(tempPassword);
        },
        onError: fail,
        onSettled: done,
      },
    );
  };

  const toggleDisabled = () => {
    setAction("disable");
    updateUser.mutate(
      { id: user.id, patch: { disable: !disabled } },
      {
        onSuccess: () => toast({ message: disabled ? `${user.name} can sign in again.` : `${user.name} can't sign in until you enable them again.` }),
        onError: fail,
        onSettled: done,
      },
    );
  };

  const resend = () => {
    setAction("resend");
    resendInvite.mutate(user.id, {
      onSuccess: ({ emailSent }) =>
        toast({ message: emailSent ? `Invite resent to ${user.email}.` : "Couldn't send the invite email.", tone: emailSent ? undefined : "danger" }),
      onError: fail,
      onSettled: done,
    });
  };

  const cancel = () => {
    setAction("cancel");
    cancelInvite.mutate(user.id, {
      onSuccess: () => {
        toast({ message: `Invite for ${user.email} cancelled.` });
        onClose();
      },
      onError: fail,
      onSettled: done,
    });
  };

  const remove = () => {
    if (!window.confirm(`Delete ${user.name}? This can't be undone.`)) return;
    setAction("delete");
    cancelInvite.mutate(user.id, {
      onSuccess: () => {
        toast({ message: `Deleted ${user.name}.`, tone: "danger" });
        onClose();
      },
      onError: fail,
      onSettled: done,
    });
  };

  const owned = user.ownedProjectCount;

  return (
    <div className="space-y-5 pt-1">
      <div className="flex items-center gap-3">
        <Face name={user.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink">{user.email}</p>
          <p className="truncate text-micro text-muted">
            {pending ? "Invited — hasn't set a password yet" : disabled ? "Disabled — can't sign in" : isSelf ? "This is you" : "Active"}
          </p>
        </div>
        {pending ? <Chip>Invited</Chip> : disabled ? <Chip>Disabled</Chip> : null}
      </div>

      {reveal ? <PasswordReveal email={user.email} password={reveal} onDone={() => setReveal(null)} /> : null}

      <div>
        <label htmlFor={`name-${user.id}`} className="mb-1.5 block text-micro font-medium text-muted">
          Name
        </label>
        <div className="flex gap-2">
          <input
            id={`name-${user.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveName();
              }
            }}
            maxLength={80}
            autoComplete="off"
            className={cn(inputClass, "min-w-0 flex-1", !trimmedName && "border-danger")}
          />
          <Button variant="secondary" onClick={saveName} disabled={!trimmedName || !nameDirty || busy} loading={action === "name"} aria-label="Save name">
            Save
          </Button>
        </div>
        {!trimmedName ? <p className="mt-1 text-micro text-danger-ink">A name can&apos;t be empty.</p> : null}
      </div>

      {isSelf ? null : (
        <div>
          <label htmlFor={`email-${user.id}`} className="mb-1.5 block text-micro font-medium text-muted">
            Email
          </label>
          <div className="flex gap-2">
            <input
              id={`email-${user.id}`}
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveEmail();
                }
              }}
              autoComplete="off"
              className={cn(inputClass, "min-w-0 flex-1", !emailValid && "border-danger")}
            />
            <Button variant="secondary" onClick={saveEmail} disabled={!emailValid || !emailDirty || busy} loading={action === "email"} aria-label="Save email">
              Save
            </Button>
          </div>
          <p className={cn("mt-1 text-micro", emailValid ? "text-muted" : "text-danger-ink")}>
            {emailValid ? "The address they sign in with, and where Orbit writes to them." : "That doesn't look like an email."}
          </p>
        </div>
      )}

      {/* The admin can't read the department list, so placement is read-only there. */}
      {departments.length > 0 ? (
        <Field label="Department">
          <select
            value={user.departmentId ?? ""}
            onChange={(e) => setDepartment(e.target.value || null)}
            disabled={busy}
            aria-label={`Department for ${user.name}`}
            className={cn(inputClass, "appearance-none disabled:opacity-60")}
          >
            <option value="">Not placed yet</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field label="Role" hint={roleLocked ? "This role can't be changed from here." : undefined}>
        <select
          value={user.role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          disabled={busy || roleLocked}
          aria-label={`Role for ${user.name}`}
          className={cn(inputClass, "appearance-none disabled:opacity-60")}
        >
          {roleLocked ? (
            <option value={user.role}>{ROLE_LABEL[user.role]}</option>
          ) : (
            roleChoices.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))
          )}
        </select>
      </Field>

      <div>
        <label htmlFor={`phone-${user.id}`} className="mb-1.5 block text-micro font-medium text-muted">
          WhatsApp number
        </label>
        <div className="flex gap-2">
          <input
            id={`phone-${user.id}`}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                savePhone();
              }
            }}
            inputMode="tel"
            placeholder="e.g. +916302608825"
            className={cn(inputClass, "min-w-0 flex-1", !phoneValid && "border-danger")}
          />
          <Button variant="secondary" onClick={savePhone} disabled={!phoneValid || !phoneDirty || busy} loading={action === "phone"}>
            Save
          </Button>
        </div>
        <p className={cn("mt-1 text-micro", phoneValid ? "text-muted" : "text-danger-ink")}>
          {phoneValid ? "With the country code. Leave blank to remove." : "Start with the country code, e.g. +916302608825."}
        </p>
      </div>

      <div className="space-y-2 pt-1">
        {isSelf || user.role === "FOUNDER" ? null : newPassword === null ? (
          <Button full variant="secondary" onClick={() => setNewPassword("")}>
            Set a password
          </Button>
        ) : (
          <div>
            <div className="flex gap-2">
              <input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    savePassword();
                  }
                }}
                placeholder="At least 6 characters"
                aria-label="New password"
                autoFocus
                className={cn(inputClass, "min-w-0 flex-1")}
              />
              <Button variant="primary" onClick={savePassword} disabled={newPassword.trim().length < 6 || busy} loading={action === "password"}>
                Save
              </Button>
            </div>
            <p className="mt-1 text-micro text-muted">Tell {user.name.split(" ")[0]} personally. Any old invite link stops working.</p>
          </div>
        )}
        {pending ? (
          <>
            <Button full variant="secondary" onClick={resend} disabled={busy} loading={action === "resend"}>
              Resend invite
            </Button>
            <Button full variant="danger" onClick={cancel} disabled={busy} loading={action === "cancel"}>
              Cancel invite
            </Button>
          </>
        ) : (
          <>
            <Button full variant="secondary" onClick={reset} disabled={busy} loading={action === "reset"}>
              Reset password
            </Button>
            <Button
              full
              variant={disabled ? "secondary" : "danger"}
              onClick={toggleDisabled}
              disabled={busy || isSelf}
              loading={action === "disable"}
              title={isSelf ? "You can't disable your own account" : undefined}
            >
              {disabled ? "Enable account" : "Disable account"}
            </Button>
            {isSelf ? null : (
              <>
                <Button
                  full
                  variant="danger"
                  onClick={remove}
                  disabled={busy || owned > 0}
                  loading={action === "delete"}
                  title={owned > 0 ? `Reassign or delete their ${owned} project${owned === 1 ? "" : "s"} first` : undefined}
                >
                  Delete account
                </Button>
                {owned > 0 ? (
                  <p className="text-micro text-muted">
                    {user.name} owns {owned} project{owned === 1 ? "" : "s"}. Reassign or delete {owned === 1 ? "it" : "them"} first, then delete the account.
                  </p>
                ) : null}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Shown exactly once. There is no way to read this back afterwards. */
function PasswordReveal({ email, password, onDone }: { email: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-card bg-warn-soft p-4">
      <p className="text-sm font-semibold text-ink">Temporary password for {email}</p>
      <p className="mt-0.5 text-micro text-muted">Shown once and never stored. Copy it now — if it is lost, reset again.</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-input bg-surface px-3 py-2.5 font-mono text-row text-ink">{password}</code>
        <IconButton
          label={copied ? "Copied" : "Copy this password"}
          className="bg-surface"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              /* clipboard blocked; the value is on screen regardless */
            }
          }}
        >
          {copied ? <Check className="h-5 w-5 text-ok-ink" strokeWidth={2.5} aria-hidden /> : <Copy className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
        </IconButton>
        <Button variant="quiet" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
