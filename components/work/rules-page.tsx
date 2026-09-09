"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useMe, useUsers } from "@/lib/hooks/use-users";
import { useCategories, useCategoryMutations, useGroups, useRuleMutations, useRules } from "@/lib/hooks/use-work";
import { canSeeUserListRole } from "@/lib/roles";
import { WORK_PRIORITIES, WORK_PRIORITY_LABEL, WORK_TYPES, WORK_TYPE_LABEL, type AssignmentRuleDTO, type WorkPriority, type WorkType } from "@/lib/types";
import { FormRow, Panel, PanelHeader, Tabs, snButton, snInput, snLink, snPrimary } from "./sn";

type Field = "type" | "priority" | "categoryId" | "departmentId";
type Cond = { field: Field; value: string };
const FIELD_LABEL: Record<Field, string> = { type: "Type", priority: "Priority", categoryId: "Category", departmentId: "Department" };

function condsOf(r: AssignmentRuleDTO | null): Cond[] {
  if (!r) return [{ field: "categoryId", value: "" }];
  const out: Cond[] = [];
  if (r.match.type) out.push({ field: "type", value: r.match.type });
  if (r.match.priority) out.push({ field: "priority", value: r.match.priority });
  if (r.match.categoryId) out.push({ field: "categoryId", value: r.match.categoryId });
  if (r.match.departmentId) out.push({ field: "departmentId", value: r.match.departmentId });
  return out.length ? out : [{ field: "categoryId", value: "" }];
}

/**
 * Assignment Rules, laid out like the service desk's: a list of rules
 * (name, order, active, what it applies to, who it assigns to), and a form
 * with Applies To (conditions, all of which must be met) and Assign To.
 * Categories live on their own tab, since a rule usually matches on one.
 */
export function RulesPage() {
  const { data: me } = useMe();
  const canWrite = me?.role === "FOUNDER";
  const { data: rules, isLoading } = useRules(Boolean(me));
  const { data: groups } = useGroups(Boolean(me));
  const { data: categories } = useCategories(Boolean(me));
  const { data: departments } = useDepartments();
  const { data: users } = useUsers(Boolean(me) && canSeeUserListRole(me?.role));
  const { createRule, updateRule, deleteRule } = useRuleMutations();
  const { createCategory, updateCategory, deleteCategory } = useCategoryMutations();
  const { show: toast } = useToast();
  const [tab, setTab] = useState<"rules" | "categories">("rules");
  const [editing, setEditing] = useState<AssignmentRuleDTO | "new" | null>(null);
  const [catName, setCatName] = useState("");
  const [catDept, setCatDept] = useState("");
  const [catGroup, setCatGroup] = useState("");

  if (me && me.role !== "FOUNDER" && me.role !== "HOD") {
    return (
      <div className="w-full px-2 pb-8 pt-2 md:px-4">
        <EmptyState title="Assignment Rules are the CEO's to set." />
      </div>
    );
  }

  const fail = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });
  const nameOf = (kind: "group" | "category" | "department" | "user", id?: string) => {
    if (!id) return "";
    if (kind === "group") return (groups ?? []).find((g) => g.id === id)?.name ?? id;
    if (kind === "category") return (categories ?? []).find((c) => c.id === id)?.name ?? id;
    if (kind === "department") return (departments ?? []).find((d) => d.id === id)?.name ?? id;
    return (users ?? []).find((u) => u.id === id)?.name ?? id;
  };
  const describe = (r: AssignmentRuleDTO) =>
    [
      r.match.type ? `Type is ${WORK_TYPE_LABEL[r.match.type]}` : null,
      r.match.priority ? `Priority is ${WORK_PRIORITY_LABEL[r.match.priority]}` : null,
      r.match.categoryId ? `Category is ${nameOf("category", r.match.categoryId)}` : null,
      r.match.departmentId ? `Department is ${nameOf("department", r.match.departmentId)}` : null,
    ]
      .filter(Boolean)
      .join(" AND ") || "Every task";
  const assigns = (r: AssignmentRuleDTO) =>
    [
      r.set.assignmentGroupId ? nameOf("group", r.set.assignmentGroupId) : null,
      r.set.assigneeId ? nameOf("user", r.set.assigneeId) : null,
      r.set.departmentId ? nameOf("department", r.set.departmentId) : null,
      r.set.priority ? `Priority → ${WORK_PRIORITY_LABEL[r.set.priority]}` : null,
      r.set.escalate ? "Escalate" : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="w-full px-2 pb-8 pt-2 md:px-4">
      <Panel>
        <PanelHeader
          title={
            <span className="flex items-center gap-2">
              <Link href="/work" className={cn(snLink, "text-[13px] font-normal")}>Tasks</Link>
              <span className="text-muted">›</span>
              <span>Assignment Rules</span>
            </span>
          }
          right={canWrite && tab === "rules" ? (
            <button type="button" onClick={() => setEditing("new")} className={snPrimary}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              New
            </button>
          ) : undefined}
        />
        <Tabs<"rules" | "categories"> tabs={[{ value: "rules", label: "Assignment Rules", count: rules?.length }, { value: "categories", label: "Categories", count: categories?.length }]} value={tab} onChange={setTab} />

        {tab === "rules" ? (
          isLoading ? (
            <div className="p-3"><Skeleton rows={3} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-hover text-left text-muted">
                    <th className="border-b border-line px-3 py-2 font-semibold">Name</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Order</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Active</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Applies to</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Assign to</th>
                  </tr>
                </thead>
                <tbody>
                  {(rules ?? []).map((r) => (
                    <tr key={r.id} className="border-b border-line hover:bg-hover">
                      <td className="px-3 py-2">
                        <button type="button" disabled={!canWrite} onClick={() => setEditing(r)} className={cn(snLink, "font-medium")}>{r.name}</button>
                      </td>
                      <td className="px-3 py-2 text-ink">{r.order}</td>
                      <td className="px-3 py-2 text-ink">{r.active ? "true" : "false"}</td>
                      <td className="px-3 py-2 text-ink">{describe(r)}</td>
                      <td className="px-3 py-2 text-ink">{assigns(r)}</td>
                    </tr>
                  ))}
                  {(rules ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-muted">No rules yet. A rule sends a new task to a team automatically.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-hover text-left text-muted">
                    <th className="border-b border-line px-3 py-2 font-semibold">Category</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Department</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Default assignment group</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Active</th>
                    <th className="border-b border-line px-3 py-2 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {(categories ?? []).map((c) => (
                    <tr key={c.id} className="border-b border-line hover:bg-hover">
                      <td className="px-3 py-2 text-ink">{c.name}</td>
                      <td className="px-3 py-2 text-ink">{nameOf("department", c.departmentId ?? undefined)}</td>
                      <td className="px-3 py-2">
                        <select value={c.assignmentGroupId ?? ""} disabled={!canWrite} onChange={(e) => updateCategory.mutate({ id: c.id, patch: { assignmentGroupId: e.target.value || null } }, { onError: fail })} className={cn(snInput, "!w-auto")} aria-label="Default assignment group">
                          <option value="">—</option>
                          {(groups ?? []).map((g) => (
                            <option key={g.id} value={g.id}>{g.departmentName} · {g.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-ink">{c.active ? "true" : "false"}</td>
                      <td className="px-3 py-2 text-right">
                        {canWrite ? (
                          <button type="button" onClick={() => deleteCategory.mutate(c.id, { onError: fail })} className="press text-muted hover:text-danger-ink" aria-label={`Delete ${c.name}`}>
                            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {(categories ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-muted">No categories yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {canWrite ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!catName.trim()) return;
                  createCategory.mutate({ name: catName.trim(), departmentId: catDept || null, assignmentGroupId: catGroup || null }, { onSuccess: () => { setCatName(""); setCatGroup(""); }, onError: fail });
                }}
                className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2"
              >
                <input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="New category, e.g. Hardware" aria-label="New category" className={cn(snInput, "!w-56")} />
                <select value={catDept} onChange={(e) => setCatDept(e.target.value)} className={cn(snInput, "!w-auto")} aria-label="Department">
                  <option value="">Company-wide</option>
                  {(departments ?? []).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <select value={catGroup} onChange={(e) => setCatGroup(e.target.value)} className={cn(snInput, "!w-auto")} aria-label="Default assignment group">
                  <option value="">No default group</option>
                  {(groups ?? []).map((g) => (
                    <option key={g.id} value={g.id}>{g.departmentName} · {g.name}</option>
                  ))}
                </select>
                <button type="submit" className={snPrimary} disabled={!catName.trim() || createCategory.isPending}>Add</button>
              </form>
            ) : null}
          </div>
        )}
      </Panel>

      {editing ? (
        <RuleForm
          rule={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (input, id) => {
            try {
              if (id) await updateRule.mutateAsync({ id, patch: input });
              else await createRule.mutateAsync(input);
              setEditing(null);
            } catch (e) {
              fail(e);
            }
          }}
          onDelete={(id) => deleteRule.mutate(id, { onSuccess: () => setEditing(null), onError: fail })}
          groups={groups ?? []}
          categories={categories ?? []}
          departments={departments ?? []}
          users={(users ?? []).filter((u) => u.role !== "ADMIN" && u.role !== "PERSON" && !u.disabledAt)}
        />
      ) : null}
    </div>
  );
}

function RuleForm({
  rule,
  onClose,
  onSave,
  onDelete,
  groups,
  categories,
  departments,
  users,
}: {
  rule: AssignmentRuleDTO | null;
  onClose: () => void;
  onSave: (input: Omit<AssignmentRuleDTO, "id">, id?: string) => Promise<void>;
  onDelete: (id: string) => void;
  groups: { id: string; name: string; departmentName: string }[];
  categories: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  users: { id: string; name: string }[];
}) {
  const [name, setName] = useState(rule?.name ?? "");
  const [order, setOrder] = useState(String(rule?.order ?? 100));
  const [active, setActive] = useState(rule?.active ?? true);
  const [conds, setConds] = useState<Cond[]>(condsOf(rule));
  const [group, setGroup] = useState(rule?.set.assignmentGroupId ?? "");
  const [assignee, setAssignee] = useState(rule?.set.assigneeId ?? "");
  const [dept, setDept] = useState(rule?.set.departmentId ?? "");
  const [prio, setPrio] = useState(rule?.set.priority ?? "");
  const [escalate, setEscalate] = useState(rule?.set.escalate ?? false);
  const [side, setSide] = useState<"applies" | "assign">("applies");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setName(rule?.name ?? "");
    setOrder(String(rule?.order ?? 100));
    setActive(rule?.active ?? true);
    setConds(condsOf(rule));
    setGroup(rule?.set.assignmentGroupId ?? "");
    setAssignee(rule?.set.assigneeId ?? "");
    setDept(rule?.set.departmentId ?? "");
    setPrio(rule?.set.priority ?? "");
    setEscalate(rule?.set.escalate ?? false);
  }, [rule]);

  const valuesFor = (f: Field): { value: string; label: string }[] => {
    switch (f) {
      case "type":
        return WORK_TYPES.map((t) => ({ value: t, label: WORK_TYPE_LABEL[t] }));
      case "priority":
        return WORK_PRIORITIES.map((p) => ({ value: p, label: WORK_PRIORITY_LABEL[p] }));
      case "categoryId":
        return categories.map((c) => ({ value: c.id, label: c.name }));
      case "departmentId":
        return departments.map((d) => ({ value: d.id, label: d.name }));
    }
  };

  const save = async () => {
    const match: AssignmentRuleDTO["match"] = {};
    for (const c of conds) {
      if (!c.value) continue;
      if (c.field === "type") match.type = c.value as WorkType;
      else if (c.field === "priority") match.priority = c.value as WorkPriority;
      else if (c.field === "categoryId") match.categoryId = c.value;
      else match.departmentId = c.value;
    }
    const set: AssignmentRuleDTO["set"] = {};
    if (group) set.assignmentGroupId = group;
    if (assignee) set.assigneeId = assignee;
    if (dept) set.departmentId = dept;
    if (prio) set.priority = prio as WorkPriority;
    if (escalate) set.escalate = true;
    setSaving(true);
    await onSave({ name: name.trim(), order: Number(order) || 0, active, match, set }, rule?.id);
    setSaving(false);
  };

  return (
    <Panel className="mt-3">
      <PanelHeader
        title={<span>Assignment Rule <span className="font-normal text-muted">{rule ? rule.name : "New record"}</span></span>}
        right={
          <>
            <button type="button" onClick={onClose} className={snButton}>Cancel</button>
            {rule ? <button type="button" onClick={() => onDelete(rule.id)} className={cn(snButton, "text-danger-ink")}>Delete</button> : null}
            <button type="button" onClick={() => void save()} disabled={!name.trim() || saving} className={snPrimary}>{rule ? "Update" : "Submit"}</button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-x-6 py-2 md:grid-cols-2">
        <div>
          <FormRow label="Name" required><input value={name} onChange={(e) => setName(e.target.value)} placeholder="High-priority tasks to Network" className={snInput} autoFocus /></FormRow>
          <FormRow label="Execution order"><input type="number" value={order} onChange={(e) => setOrder(e.target.value)} className={snInput} /></FormRow>
        </div>
        <div>
          <FormRow label="Active"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" /></FormRow>
          <FormRow label="Table"><input value="Task" readOnly className={snInput} /></FormRow>
        </div>
      </div>
      <Tabs<"applies" | "assign"> tabs={[{ value: "applies", label: "Applies To" }, { value: "assign", label: "Assign To" }]} value={side} onChange={setSide} />
      {side === "applies" ? (
        <div className="p-3">
          <p className="mb-2 text-[13px] text-muted">All of these conditions must be met</p>
          <div className="space-y-2">
            {conds.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select value={c.field} onChange={(e) => setConds((prev) => prev.map((x, j) => (j === i ? { field: e.target.value as Field, value: "" } : x)))} className={cn(snInput, "!w-40")} aria-label="Field">
                  {(Object.keys(FIELD_LABEL) as Field[]).map((f) => (
                    <option key={f} value={f}>{FIELD_LABEL[f]}</option>
                  ))}
                </select>
                <span className="text-[13px] text-muted">is</span>
                <select value={c.value} onChange={(e) => setConds((prev) => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className={cn(snInput, "!w-56")} aria-label="Value">
                  <option value="">-- choose --</option>
                  {valuesFor(c.field).map((v) => (
                    <option key={v.value} value={v.value}>{v.label}</option>
                  ))}
                </select>
                {i < conds.length - 1 ? <span className="text-[12px] font-semibold text-primary-ink">AND</span> : null}
                <button type="button" onClick={() => setConds((prev) => prev.filter((_, j) => j !== i))} disabled={conds.length === 1} className="press text-muted hover:text-danger-ink disabled:opacity-30" aria-label="Remove condition">
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setConds((prev) => [...prev, { field: "priority", value: "" }])} className={cn(snButton, "mt-3")} disabled={conds.length >= 4}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            Add &quot;AND&quot; clause
          </button>
        </div>
      ) : (
        <div className="py-2">
          <FormRow label="Department">
            <select value={dept} onChange={(e) => setDept(e.target.value)} className={snInput} aria-label="Department">
              <option value="">— leave as is —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Assignment group">
            <select value={group} onChange={(e) => setGroup(e.target.value)} className={snInput} aria-label="Assignment group">
              <option value="">— none —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.departmentName} · {g.name}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Assigned to">
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={snInput} aria-label="Assigned to">
              <option value="">— none —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Set priority">
            <select value={prio} onChange={(e) => setPrio(e.target.value)} className={snInput} aria-label="Set priority">
              <option value="">— leave as is —</option>
              {WORK_PRIORITIES.map((p) => (
                <option key={p} value={p}>{WORK_PRIORITY_LABEL[p]}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Escalate"><input type="checkbox" checked={escalate} onChange={(e) => setEscalate(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" /></FormRow>
        </div>
      )}
    </Panel>
  );
}
