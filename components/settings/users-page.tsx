"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, MessageCircle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RoleChip } from "@/components/role-chip";
import { Select } from "@/components/select";
import { useToast } from "@/components/toast";
import { apiGet, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useMe, useUserMutations, useUsers } from "@/lib/hooks/use-users";
import { ROLE_RANK, canAdministerAccountsRole, isAdminRole } from "@/lib/roles";
import { ROLE_LABEL, ROLES, type UserDTO, type UserRole } from "@/lib/types";

const inputClass =
  "h-9 w-full rounded-input border border-line bg-bg px-2.5 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary";

/** Roles that can EVER be assigned via People — never ADMIN (single-admin
    cap), never PERSON (phase 35 — a walled-off routine login, created only via
    the Routine tab), never FOUNDER (phase 48 — minted only by a controlled
    promotion). Which of these a given actor may offer is the rank rule below. */
const ASSIGNABLE_ROLES = ROLES.filter(
  (r) => r !== "ADMIN" && r !== "PERSON" && r !== "FOUNDER",
) as UserRole[];

/** Phase 48 rank rule, mirrored from the server: chain actors invite strictly
    below their own level; the admin invites manager-and-below. */
function rolesOfferedTo(actorRole: UserRole | undefined): UserRole[] {
  if (!actorRole) return [];
  const ceiling = isAdminRole(actorRole) ? ROLE_RANK.MANAGER : ROLE_RANK[actorRole] - 1;
  return ASSIGNABLE_ROLES.filter((r) => ROLE_RANK[r] <= ceiling);
}

export function UsersPage() {
  const router = useRouter();
  const { data: me, isLoading: loadingMe } = useMe();
  /* Account admin is shared by managers and admins (phase 21). Only an admin
     may manage the admin account, and admins are capped at one — both enforced
     on the server; the UI mirrors them (no ADMIN in the pickers, the admin row's
     controls hidden from a manager). */
  const canAdmin = canAdministerAccountsRole(me?.role);
  const isAdminActor = isAdminRole(me?.role);
  const canBeHere = canAdmin;
  const { data: users, isLoading } = useUsers(canBeHere);
  const { createUser, updateUser, resendInvite, cancelInvite } = useUserMutations();
  const { show: toast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("RESOURCE");
  const [reveal, setReveal] = useState<{ email: string; password: string } | null>(null);

  // The server is the authority; this only avoids rendering a page the
  // viewer will never be allowed to use.
  useEffect(() => {
    if (!loadingMe && me && !canAdministerAccountsRole(me.role)) {
      router.replace("/");
    }
  }, [loadingMe, me, router]);

  if (loadingMe || !me) return null;
  if (!canBeHere) return null;

  const submit = () => {
    if (!name.trim() || !email.trim()) return;
    createUser.mutate(
      { name: name.trim(), email: email.trim(), role },
      {
        onSuccess: ({ user, emailSent }) => {
          toast({
            message: emailSent
              ? `Invite sent to ${user.email}.`
              : `${user.name} added, but the invite email didn't send — try Resend.`,
            tone: emailSent ? undefined : "danger",
          });
          setName("");
          setEmail("");
          setRole("RESOURCE");
        },
        onError: (error) => toast({ message: (error as Error).message, tone: "danger" }),
      },
    );
  };

  return (
    <div className="max-w-3xl px-4 py-4 sm:px-8 sm:py-6">
      {/* The app bar already says People; repeating it here was the same word
          twice in sixty pixels. */}
      <p className="text-sm text-muted">
        Accounts are yours to run. Managers own and run projects; team leads own
        delivery inside them; team members do the work. A manager who owns projects
        can&apos;t be deleted until those projects are reassigned or removed.
      </p>

      {reveal ? <PasswordReveal reveal={reveal} onDone={() => setReveal(null)} /> : null}

      <section className="mt-5 rounded-xl border border-line bg-surface p-3">
        <h2 className="text-micro font-medium uppercase tracking-widest text-muted">
          Invite someone
        </h2>
        <p className="mt-1 text-micro text-muted">
          They get an email with a link to set their own password. The account stays pending
          until they do.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            aria-label="Name"
            className={inputClass}
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            aria-label="Email"
            type="email"
            className={inputClass}
          />
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            aria-label="Role"
            className="sm:w-32"
          >
            {/* Driven by the rank rule (phase 48), never hand-listed — each
                actor is offered only the roles below their own level; ADMIN,
                PERSON and FOUNDER are never offered at all. */}
            {rolesOfferedTo(me.role).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={submit}
            disabled={createUser.isPending || !name.trim() || !email.trim()}
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-on-primary transition-opacity duration-150 ease-out hover:opacity-90 disabled:opacity-40"
          >
            {createUser.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            )}
            Add
          </button>
        </div>
      </section>

      {/* The forgot-password request queue stays the admin's job (phase 21) —
          a manager has the direct Reset control on each row instead. */}
      {isAdminActor ? <ResetRequestQueue /> : null}

      <section className="mt-5">
        {isLoading ? (
          <div className="space-y-2" aria-hidden>
            {[0, 1].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-hover" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {(users ?? []).map((user) => (
              <UserRow
                key={user.id}
                user={user}
                /* Only an admin may administer the admin account; a manager sees
                   the admin row but with no controls on it (phase 21). */
                canAdminister={canAdmin && (isAdminActor || user.role !== "ADMIN")}
                canResend={canAdmin && (isAdminActor || user.role !== "ADMIN")}
                isSelf={user.id === me.id}
                onReset={() =>
                  updateUser.mutate(
                    { id: user.id, patch: { reset: true } },
                    {
                      onSuccess: ({ tempPassword }) => {
                        if (tempPassword) {
                          setReveal({ email: user.email, password: tempPassword });
                        }
                      },
                    },
                  )
                }
                onToggleDisabled={() =>
                  updateUser.mutate(
                    { id: user.id, patch: { disable: user.disabledAt === null } },
                    {
                      onError: (error) =>
                        toast({ message: (error as Error).message, tone: "danger" }),
                    },
                  )
                }
                onRole={(next) => updateUser.mutate({ id: user.id, patch: { role: next } })}
                onSetPhone={(phone) =>
                  updateUser.mutate(
                    { id: user.id, patch: { phone } },
                    {
                      onSuccess: () => toast({ message: phone ? `WhatsApp number saved for ${user.name}.` : `WhatsApp number removed for ${user.name}.` }),
                      onError: (error) => toast({ message: (error as Error).message, tone: "danger" }),
                    },
                  )
                }
                onResend={() =>
                  resendInvite.mutate(user.id, {
                    onSuccess: ({ emailSent }) =>
                      toast({
                        message: emailSent
                          ? `Invite resent to ${user.email}.`
                          : "Couldn't send the invite email.",
                        tone: emailSent ? undefined : "danger",
                      }),
                    onError: (error) => toast({ message: (error as Error).message, tone: "danger" }),
                  })
                }
                onCancel={() =>
                  cancelInvite.mutate(user.id, {
                    onSuccess: () => toast({ message: `Invite for ${user.email} cancelled.` }),
                    onError: (error) => toast({ message: (error as Error).message, tone: "danger" }),
                  })
                }
                onDelete={() =>
                  cancelInvite.mutate(user.id, {
                    onSuccess: () =>
                      toast({ message: `Deleted ${user.name}.`, tone: "danger" }),
                    onError: (error) => toast({ message: (error as Error).message, tone: "danger" }),
                  })
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function UserRow({
  user,
  canAdminister,
  canResend,
  isSelf,
  onReset,
  onToggleDisabled,
  onRole,
  onResend,
  onCancel,
  onDelete,
  onSetPhone,
}: {
  user: UserDTO;
  /** True when the viewer (a manager or admin) may administer THIS account —
      false on the admin row for a manager, who can see it but not act on it. */
  canAdminister: boolean;
  /** Same scope: may resend this account's pending invite. */
  canResend: boolean;
  isSelf: boolean;
  onReset: () => void;
  onToggleDisabled: () => void;
  onRole: (role: UserRole) => void;
  onResend: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onSetPhone: (phone: string | null) => void;
}) {
  const disabled = user.disabledAt !== null;
  const pending = user.status === "PENDING";

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
      {/* Identity gets its own line before any control competes with it. */}
      <div className="w-full min-w-0 sm:w-auto sm:flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("min-w-0 truncate text-sm", disabled ? "text-muted" : "text-ink")}>
            {user.name}
          </span>
          <RoleChip role={user.role} />
          {isSelf ? <span className="text-micro text-muted">you</span> : null}
        </p>
        <p className="truncate text-micro text-muted">{user.email}</p>
        {/* Phase 32: a manager/admin can set this person's WhatsApp number so
            meeting alerts can reach them. Only on rows they may administer. */}
        {canAdminister ? <PhoneCell user={user} onSave={onSetPhone} /> : null}
      </div>

      <span
        className={cn(
          "shrink-0 rounded-chip px-2 py-px text-micro",
          disabled
            ? "bg-hover text-muted"
            : pending
              ? "bg-hover text-muted"
              : "bg-ok-soft text-ok-ink",
        )}
      >
        {disabled ? "Disabled" : pending ? "Invited · pending" : "Active"}
      </span>

      {/* No role picker on the admin's own row — the admin role can't be
          reassigned (single-admin cap) and can't be granted here (phase 21). */}
      {canAdminister && user.role !== "ADMIN" ? (
        <Select
          value={user.role}
          onChange={(e) => onRole(e.target.value as UserRole)}
          aria-label={`Role for ${user.name}`}
          size="sm"
          className="shrink-0"
        >
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
      ) : null}

      {/* Pending accounts have no password to reset — they get Resend + Cancel
          instead. Active accounts get Reset + Disable, unchanged. */}
      {pending ? (
        <>
          {canResend ? (
            <button
              type="button"
              onClick={onResend}
              className="h-8 shrink-0 rounded-lg bg-hover px-2.5 text-micro text-ink transition-colors duration-150 ease-out hover:bg-pressed"
            >
              Resend invite
            </button>
          ) : null}
          {canAdminister ? (
            <button
              type="button"
              onClick={onCancel}
              className="h-8 shrink-0 rounded-lg bg-danger-soft px-2.5 text-micro text-danger-ink transition-colors duration-150 ease-out"
            >
              Cancel
            </button>
          ) : null}
        </>
      ) : canAdminister ? (
        <>
          <button
            type="button"
            onClick={onReset}
            className="h-8 shrink-0 rounded-lg bg-hover px-2.5 text-micro text-ink transition-colors duration-150 ease-out hover:bg-pressed"
          >
            Reset password
          </button>

          <button
            type="button"
            onClick={onToggleDisabled}
            disabled={isSelf}
            title={isSelf ? "You cannot disable your own account" : undefined}
            className={cn(
              "h-8 shrink-0 rounded-lg px-2.5 text-micro transition-colors duration-150 ease-out disabled:opacity-30",
              disabled ? "bg-hover text-ink" : "bg-danger-soft text-danger-ink",
            )}
          >
            {disabled ? "Enable" : "Disable"}
          </button>

          {/* Phase 29: a manager who OWNS projects cannot be deleted — the Delete
              is shown disabled with the reason (a plain span so it can never fire
              a doomed 409), rather than an enabled button that always fails. Once
              their projects are reassigned/removed, Delete becomes available. */}
          {(user.role === "FOUNDER" || user.role === "DIRECTOR" || user.role === "HOD" || user.role === "MANAGER") && !isSelf ? (
            user.ownedProjectCount > 0 ? (
              <span
                aria-disabled="true"
                title={`Reassign or delete their ${user.ownedProjectCount} project${user.ownedProjectCount === 1 ? "" : "s"} first`}
                className="flex h-8 shrink-0 cursor-not-allowed items-center rounded-lg bg-danger-soft px-2.5 text-micro font-medium text-danger-ink opacity-50"
              >
                Delete
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete ${user.name}? They own no projects. This cannot be undone.`)) onDelete();
                }}
                className="h-8 shrink-0 rounded-lg bg-danger px-2.5 text-micro font-medium text-on-primary transition-opacity duration-150 ease-out hover:opacity-90"
              >
                Delete
              </button>
            )
          ) : null}
        </>
      ) : null}
    </li>
  );
}

/** Shown exactly once. There is no way to read this back afterwards. */
function PasswordReveal({
  reveal,
  onDone,
}: {
  reveal: { email: string; password: string };
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-4 rounded-card bg-warn-soft p-3">
      <p className="text-sm font-medium text-ink">
        Temporary password for {reveal.email}
      </p>
      <p className="mt-0.5 text-micro text-muted">
        Shown once and never stored. Copy it now — if it is lost, reset instead.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-bg px-2.5 py-2 font-mono text-sm text-ink">
          {reveal.password}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(reveal.password);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              /* clipboard blocked; the value is on screen regardless */
            }
          }}
          aria-label="Copy this password"
          title="Copy this password"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-card border border-line text-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
        >
          {copied ? (
            <Check className="h-4 w-4 text-primary-ink" strokeWidth={2.5} aria-hidden />
          ) : (
            <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-9 shrink-0 rounded-lg px-3 text-sm text-muted transition-colors duration-150 ease-out hover:text-ink"
        >
          Done
        </button>
      </div>
    </div>
  );
}

type ResetRow = { id: string; name: string; email: string; requestedAt: string };

/** The admin's queue of pending password-reset requests (phase 14). "Send reset
    link" issues a set-password link and resolves the request; the admin never
    sees or sets a password. */
function ResetRequestQueue() {
  const qc = useQueryClient();
  const { show: toast } = useToast();
  const key = ["password-reset-requests"] as const;

  const { data } = useQuery({
    queryKey: key,
    queryFn: () => apiGet<ResetRow[]>("/api/password-reset"),
  });
  const rows = data ?? [];

  const resolve = useMutation({
    mutationFn: (id: string) => apiPost<{ ok: true; emailSent: boolean }>(`/api/password-reset/${id}/resolve`, {}),
    onSuccess: ({ emailSent }) => {
      void qc.invalidateQueries({ queryKey: key });
      toast({
        message: emailSent ? "Reset link sent." : "Marked resolved, but the email didn't send.",
        tone: emailSent ? undefined : "danger",
      });
    },
    onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
  });

  if (rows.length === 0) return null;

  return (
    <section className="mt-5 rounded-xl border border-warn bg-warn-soft p-3">
      <h2 className="text-micro font-medium uppercase tracking-widest text-warn-ink">
        Password-reset requests
      </h2>
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-surface px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{r.name}</p>
              <p className="truncate text-micro text-muted">{r.email}</p>
            </div>
            <button
              type="button"
              onClick={() => resolve.mutate(r.id)}
              disabled={resolve.isPending}
              className="press h-8 shrink-0 rounded-lg bg-primary px-2.5 text-micro font-medium text-on-primary disabled:opacity-40"
            >
              Send reset link
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Compact per-row WhatsApp-number editor (phase 32) for accounts a manager/admin
 * may administer. Saves on blur or Enter when the value is a valid E.164 (or
 * cleared). Kept small so it doesn't crowd the row's identity block.
 */
function PhoneCell({ user, onSave }: { user: UserDTO; onSave: (phone: string | null) => void }) {
  const [val, setVal] = useState(user.phone ?? "");
  useEffect(() => setVal(user.phone ?? ""), [user.phone]);
  const trimmed = val.trim();
  const valid = trimmed === "" || /^\+[1-9]\d{6,14}$/.test(trimmed);
  const dirty = trimmed !== (user.phone ?? "");
  const commit = () => {
    if (valid && dirty) onSave(trimmed === "" ? null : trimmed);
  };
  return (
    <span className="mt-1 flex items-center gap-1.5">
      <MessageCircle className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={2} aria-hidden />
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        inputMode="tel"
        placeholder="WhatsApp +countrycode…"
        aria-label={`WhatsApp number for ${user.name}`}
        className={cn(
          "h-7 w-52 max-w-full rounded-input border bg-bg px-2 text-micro text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary",
          valid ? "border-line" : "border-danger",
        )}
      />
    </span>
  );
}
