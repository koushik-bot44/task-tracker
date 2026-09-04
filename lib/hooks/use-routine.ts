"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type {
  HabitMarkValue,
  PersonViewDTO,
  RoutineInviteDTO,
  RoutineOverviewDTO,
  RoutinePermission,
  RoutinePersonDTO,
  RoutineTaskDTO,
  WeightEntryDTO,
} from "@/lib/types";

/** The manager view is per-week AND per-routine (own person or a collaboration).
    The query is keyed by both so switching either refetches cleanly. */
export const routineKey = (week: string | null, personId: string | null) =>
  ["routine", personId ?? "default", week ?? "current"] as const;
export const kidKey = ["routine-kid"] as const;
export const routineInvitesKey = ["routine-invites"] as const;

/** Append ?person=<id> (or &person=) to a routine URL when a routine is selected. */
function withPerson(path: string, personId: string | null): string {
  if (!personId) return path;
  return `${path}${path.includes("?") ? "&" : "?"}person=${personId}`;
}

/* ---- Manager side ---- */
export function useRoutine(week: string | null, personId: string | null, enabled = true) {
  return useQuery({
    queryKey: routineKey(week, personId),
    queryFn: () => apiGet<RoutineOverviewDTO>(withPerson(`/api/routine${week ? `?week=${week}` : ""}`, personId)),
    enabled,
  });
}

/** Recompute a habit's + its segment's weekly MET tally after a local mark edit. */
function applyHabitMark(prev: RoutineOverviewDTO, habitId: string, date: string, value: HabitMarkValue | null): RoutineOverviewDTO {
  return {
    ...prev,
    segments: prev.segments.map((seg) => {
      if (!seg.habits.some((h) => h.id === habitId)) return seg;
      const habits = seg.habits.map((h) => {
        if (h.id !== habitId) return h;
        const marks = { ...h.marks };
        if (value === null) delete marks[date];
        else marks[date] = value;
        return { ...h, marks, metThisWeek: Object.values(marks).filter((v) => v === "MET").length };
      });
      return { ...seg, habits, metThisWeek: habits.reduce((a, h) => a + h.metThisWeek, 0) };
    }),
  };
}

/** Manager optimistic: add/remove a scheduled (required) day; recompute the tallies.
    A day added starts not-done; removing a day drops any done mark with it. */
function applyNnRequire(prev: RoutineOverviewDTO, nonNegotiableId: string, date: string, required: boolean, today: string): RoutineOverviewDTO {
  return {
    ...prev,
    nonNegotiables: prev.nonNegotiables.map((n) => {
      if (n.id !== nonNegotiableId) return n;
      const days = { ...n.days };
      if (required) days[date] = days[date] ?? false;
      else delete days[date];
      const entries = Object.entries(days);
      return {
        ...n,
        days,
        requiredThisWeek: entries.length,
        doneThisWeek: entries.filter(([, d]) => d).length,
        missedThisWeek: entries.filter(([d, done]) => !done && d < today).length,
      };
    }),
  };
}

export type ReminderResult =
  | { sent: true; count: number }
  | { sent: false; reason: "none" }
  | { sent: false; reason: "rate_limited"; retryInMs: number };

export function useRoutineMutations(week: string | null, personId: string | null) {
  const qc = useQueryClient();
  const key = routineKey(week, personId);
  // Every write targets the SELECTED routine via ?person=.
  const p = (path: string) => withPerson(path, personId);
  // Structural edits can shift any week — refetch every cached routine week.
  const refresh = () => void qc.invalidateQueries({ queryKey: ["routine"] });

  const createPerson = useMutation({
    mutationFn: (input: { name: string; email: string; password: string }) => apiPost<RoutinePersonDTO>("/api/routine", input),
    onSettled: refresh,
  });
  const updatePerson = useMutation({
    mutationFn: (patch: { name?: string; email?: string; password?: string }) => apiPatch<RoutinePersonDTO>(p("/api/routine/person"), patch),
    onSettled: refresh,
  });
  const deletePerson = useMutation({
    mutationFn: () => apiDelete<{ ok: true }>(p("/api/routine/person")),
    onSettled: refresh,
  });

  const addSegment = useMutation({
    mutationFn: (input: { name: string }) => apiPost(p("/api/routine/segments"), input),
    onSettled: refresh,
  });
  const renameSegment = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => apiPatch(p(`/api/routine/segments/${id}`), { name }),
    onSettled: refresh,
  });
  const deleteSegment = useMutation({
    mutationFn: (id: string) => apiDelete(p(`/api/routine/segments/${id}`)),
    onSettled: refresh,
  });

  const addHabit = useMutation({
    mutationFn: (input: { segmentId: string; name: string; targetPerWeek?: number }) => apiPost(p("/api/routine/habits"), input),
    onSettled: refresh,
  });
  const updateHabit = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; targetPerWeek?: number; active?: boolean } }) =>
      apiPatch(p(`/api/routine/habits/${id}`), patch),
    onSettled: refresh,
  });
  const deleteHabit = useMutation({
    mutationFn: (id: string) => apiDelete(p(`/api/routine/habits/${id}`)),
    onSettled: refresh,
  });

  // The tap-to-cycle grid cell — optimistic so it feels instant/effortless.
  const markHabit = useMutation({
    mutationFn: (input: { habitId: string; date: string; value: HabitMarkValue | null }) => apiPatch(p("/api/routine/habit-mark"), input),
    onMutate: async ({ habitId, date, value }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<RoutineOverviewDTO>(key);
      if (prev) qc.setQueryData<RoutineOverviewDTO>(key, applyHabitMark(prev, habitId, date, value));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const addNonNegotiable = useMutation({
    mutationFn: (input: { name: string }) => apiPost(p("/api/routine/non-negotiables"), input),
    onSettled: refresh,
  });
  const updateNonNegotiable = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; active?: boolean } }) => apiPatch(p(`/api/routine/non-negotiables/${id}`), patch),
    onSettled: refresh,
  });
  const deleteNonNegotiable = useMutation({
    mutationFn: (id: string) => apiDelete(p(`/api/routine/non-negotiables/${id}`)),
    onSettled: refresh,
  });
  // The manager schedules whether a rule is required on a day (the person marks done).
  const setNonNegotiableDay = useMutation({
    mutationFn: (input: { nonNegotiableId: string; date: string; required: boolean }) => apiPatch(p("/api/routine/non-negotiable-mark"), input),
    onMutate: async ({ nonNegotiableId, date, required }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<RoutineOverviewDTO>(key);
      if (prev) qc.setQueryData<RoutineOverviewDTO>(key, applyNnRequire(prev, nonNegotiableId, date, required, prev.today));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const addTask = useMutation({
    mutationFn: (input: { title: string; dueDate?: string | null }) => apiPost<RoutineTaskDTO>(p("/api/routine/tasks"), input),
    onSettled: refresh,
  });
  const deleteTask = useMutation({
    mutationFn: (id: string) => apiDelete(p(`/api/routine/tasks/${id}`)),
    onSettled: refresh,
  });

  const addWeight = useMutation({
    mutationFn: (input: { date: string; weightKg: number }) => apiPost<WeightEntryDTO>(p("/api/routine/weight"), input),
    onSettled: refresh,
  });
  const updateWeight = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { date?: string; weightKg?: number } }) => apiPatch<WeightEntryDTO>(p(`/api/routine/weight/${id}`), patch),
    onSettled: refresh,
  });
  const deleteWeight = useMutation({
    mutationFn: (id: string) => apiDelete(p(`/api/routine/weight/${id}`)),
    onSettled: refresh,
  });

  // Phase 39 — collaborators (owner) + reminder (owner/editable).
  const inviteCollaborator = useMutation({
    mutationFn: (input: { managerId: string; permission: RoutinePermission }) => apiPost(p("/api/routine/collaborators"), input),
    onSettled: refresh,
  });
  const updateCollaborator = useMutation({
    mutationFn: ({ id, permission }: { id: string; permission: RoutinePermission }) => apiPatch(`/api/routine/collaborators/${id}`, { permission }),
    onSettled: refresh,
  });
  const revokeCollaborator = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/routine/collaborators/${id}`),
    onSettled: refresh,
  });
  const sendReminder = useMutation({
    mutationFn: () => apiPost<ReminderResult>(p("/api/routine/reminder"), {}),
  });

  return {
    createPerson, updatePerson, deletePerson,
    addSegment, renameSegment, deleteSegment,
    addHabit, updateHabit, deleteHabit, markHabit,
    addNonNegotiable, updateNonNegotiable, deleteNonNegotiable, setNonNegotiableDay,
    addTask, deleteTask,
    addWeight, updateWeight, deleteWeight,
    inviteCollaborator, updateCollaborator, revokeCollaborator, sendReminder,
  };
}

/** The caller's pending routine invites (Home) + accept/decline. Mirrors the
    project collaboration-invites hook. */
export function useRoutineInvites() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: routineInvitesKey, queryFn: () => apiGet<RoutineInviteDTO[]>("/api/routine/invites") });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: routineInvitesKey });
    void qc.invalidateQueries({ queryKey: ["routine"] });
  };
  const accept = useMutation({ mutationFn: (id: string) => apiPost(`/api/routine/invites/${id}`, {}), onSettled: refresh });
  const decline = useMutation({ mutationFn: (id: string) => apiDelete(`/api/routine/invites/${id}`), onSettled: refresh });
  return { invites: query.data ?? [], accept, decline };
}

/* ---- Person (walled-off login) side ---- */
export function usePerson() {
  return useQuery({ queryKey: kidKey, queryFn: () => apiGet<PersonViewDTO>("/api/routine/kid") });
}

/** The person marks THEIR OWN habit cell — optimistic so the tap feels instant,
    then reconciled. Writes the SAME HabitMark row the manager writes (last-write-
    wins); the manager's Routine view reflects it on refresh. */
export function usePersonHabitMark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { habitId: string; date: string; value: HabitMarkValue | null }) => apiPost("/api/routine/kid/habit-mark", input),
    onMutate: async ({ habitId, date, value }) => {
      await qc.cancelQueries({ queryKey: kidKey });
      const prev = qc.getQueryData<PersonViewDTO>(kidKey);
      if (prev) {
        qc.setQueryData<PersonViewDTO>(kidKey, {
          ...prev,
          segments: prev.segments.map((s) =>
            s.habits.some((h) => h.id === habitId)
              ? {
                  ...s,
                  habits: s.habits.map((h) => {
                    if (h.id !== habitId) return h;
                    const marks = { ...h.marks };
                    if (value === null) delete marks[date];
                    else marks[date] = value;
                    return { ...h, marks };
                  }),
                }
              : s,
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(kidKey, ctx.prev);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: kidKey }),
  });
}

/** The person marks THEIR OWN scheduled non-negotiable done for a day (phase 42) —
    optimistic so the tap feels instant, then reconciled. Flips `done` on the SAME
    NonNegotiableMark row the manager scheduled; the manager's view reflects it. */
export function usePersonNonNegotiableMark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { nonNegotiableId: string; date: string; done: boolean }) => apiPost("/api/routine/kid/non-negotiable-mark", input),
    onMutate: async ({ nonNegotiableId, date, done }) => {
      await qc.cancelQueries({ queryKey: kidKey });
      const prev = qc.getQueryData<PersonViewDTO>(kidKey);
      if (prev) {
        qc.setQueryData<PersonViewDTO>(kidKey, {
          ...prev,
          nonNegotiables: prev.nonNegotiables.map((n) => {
            if (n.id !== nonNegotiableId) return n;
            // Only flip a day the manager scheduled (present in the map); never add one.
            if (!(date in n.days)) return n;
            return { ...n, days: { ...n.days, [date]: done } };
          }),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(kidKey, ctx.prev);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: kidKey }),
  });
}

export function usePersonTaskToggle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => apiPatch<RoutineTaskDTO>(`/api/routine/kid/tasks/${id}`, { done }),
    // Optimistic tick so the checklist feels instant.
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: kidKey });
      const prev = qc.getQueryData<PersonViewDTO>(kidKey);
      if (prev) {
        qc.setQueryData<PersonViewDTO>(kidKey, { ...prev, tasks: prev.tasks.map((t) => (t.id === id ? { ...t, done } : t)) });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(kidKey, ctx.prev);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: kidKey }),
  });
}
