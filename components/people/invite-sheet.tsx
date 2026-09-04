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
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole | null>(defaultRole);
  const [departmentId, setDepartmentId] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setEmail("");
    setRole(defaultRole);
    setDepartmentId("");
  }, [open, defaultRole]);

  const ready = name.trim().length > 0 && email.trim().length > 0 && role !== null;

  const submit = () => {
    if (!ready || !role) return;
    createUser.mutate(
      { name: name.trim(), email: email.trim(), role, departmentId: departmentId || null },
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
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            autoComplete="off"
            inputMode="email"
            placeholder="name@company.com"
            className={inputClass}
          />
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
