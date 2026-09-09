"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Faces } from "@/components/ui/face";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useGroupMutations, useGroups } from "@/lib/hooks/use-work";
import type { AssignmentGroupDTO, UserDTO } from "@/lib/types";

/**
 * The teams inside a department, under its people on the People page. A
 * team is a name, a lead and its members; the CEO or the head shapes them.
 */
export function TeamsSection({ departmentId, people, canShape }: { departmentId: string; people: UserDTO[]; canShape: boolean }) {
  const { data: groups } = useGroups();
  const mine = (groups ?? []).filter((g) => g.departmentId === departmentId);
  const [open, setOpen] = useState<AssignmentGroupDTO | "new" | null>(null);
  if (mine.length === 0 && !canShape) return null;
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <h3 className="text-micro font-medium text-muted">Teams</h3>
        {canShape ? (
          <button type="button" onClick={() => setOpen("new")} className="press inline-flex h-8 items-center gap-1 rounded-chip px-2 text-micro font-medium text-primary-ink">
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            Team
          </button>
        ) : null}
      </div>
      {mine.length ? (
        <Card className="divide-y divide-line overflow-hidden">
          {mine.map((g) => (
            <button key={g.id} type="button" disabled={!canShape} onClick={() => setOpen(g)} className={cn("flex min-h-[52px] w-full items-center gap-3 px-4 text-left", canShape && "press")}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {g.name}
                  {!g.active ? <span className="ml-2 text-micro font-normal text-muted">paused</span> : null}
                </span>
                <span className="block truncate text-micro text-muted">
                  {g.leadName ? `Lead: ${g.leadName} · ` : ""}
                  {g.members.length} {g.members.length === 1 ? "person" : "people"}
                  {g.openTasks ? ` · ${g.openTasks} open` : ""}
                </span>
              </span>
              <Faces names={g.members.map((m) => m.name)} max={4} size="sm" />
            </button>
          ))}
        </Card>
      ) : (
        <p className="px-1 text-micro text-muted">No teams yet.</p>
      )}
      {canShape ? <TeamSheet open={open !== null} onClose={() => setOpen(null)} departmentId={departmentId} people={people} group={open === "new" ? null : open} /> : null}
    </div>
  );
}

function TeamSheet({ open, onClose, departmentId, people, group }: { open: boolean; onClose: () => void; departmentId: string; people: UserDTO[]; group: AssignmentGroupDTO | null }) {
  const { createGroup, updateGroup, addMembers, removeMembers, deleteGroup } = useGroupMutations();
  const { show: toast } = useToast();
  const [name, setName] = useState("");
  const [leadId, setLeadId] = useState("");
  const [members, setMembers] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? "");
    setLeadId(group?.leadId ?? "");
    setMembers(new Set(group?.members.map((m) => m.id) ?? []));
  }, [open, group]);

  // Anyone active in the department, plus whoever is already on the team.
  const candidates = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const p of people) if (p.status === "ACTIVE" && !p.disabledAt && p.role !== "ADMIN" && p.role !== "PERSON") map.set(p.id, { id: p.id, name: p.name });
    for (const m of group?.members ?? []) map.set(m.id, { id: m.id, name: m.name });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [people, group]);

  const fail = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });
  const busy = createGroup.isPending || updateGroup.isPending || addMembers.isPending || removeMembers.isPending || deleteGroup.isPending;

  const save = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      if (!group) {
        await createGroup.mutateAsync({ departmentId, name: n, leadId: leadId || null, memberIds: [...members] });
      } else {
        if (n !== group.name || (leadId || null) !== group.leadId) await updateGroup.mutateAsync({ id: group.id, patch: { name: n, leadId: leadId || null } });
        const had = new Set(group.members.map((m) => m.id));
        const add = [...members].filter((id) => !had.has(id));
        const drop = [...had].filter((id) => !members.has(id));
        if (add.length) await addMembers.mutateAsync({ id: group.id, userIds: add });
        if (drop.length) await removeMembers.mutateAsync({ id: group.id, userIds: drop });
      }
      onClose();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={group ? group.name : "New team"}
      footer={
        <div className="flex gap-2">
          {group ? (
            <Button variant="danger" disabled={busy} onClick={() => deleteGroup.mutate(group.id, { onSuccess: onClose, onError: fail })}>
              Remove
            </Button>
          ) : null}
          <Button variant="primary" full loading={busy} disabled={!name.trim()} onClick={() => void save()}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Team name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Network" aria-label="Team name" autoFocus={!group} className={inputClass} />
        </Field>
        <Field label="Lead">
          <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className={inputClass} aria-label="Lead">
            <option value="">Nobody yet</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Who is on it">
          <ul className="divide-y divide-line rounded-input border border-line">
            {candidates.map((p) => {
              const on = members.has(p.id);
              return (
                <li key={p.id}>
                  <label className="flex min-h-[48px] cursor-pointer items-center gap-3 px-3">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setMembers((prev) => {
                          const next = new Set(prev);
                          if (on) next.delete(p.id);
                          else next.add(p.id);
                          return next;
                        })
                      }
                      className="h-5 w-5 accent-[var(--primary)]"
                    />
                    <span className="text-sm text-ink">{p.name}</span>
                  </label>
                </li>
              );
            })}
            {candidates.length === 0 ? <li className="px-3 py-4 text-sm text-muted">Nobody is placed in this department yet.</li> : null}
          </ul>
        </Field>
      </div>
    </Sheet>
  );
}
