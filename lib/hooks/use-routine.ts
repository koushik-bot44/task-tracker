"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type {
  CalendarMonthDTO,
  LocationDayDTO,
  LocationPointDTO,
  CircleKind,
  CircleMemberDTO,
  HabitMarkValue,
  MentorReportDTO,
  MentorViewDTO,
  PersonViewDTO,
  RoutineInviteDTO,
  RoutineOverviewDTO,
  RoutinePermission,
  RoutinePersonDTO,
  RoutineTaskDTO,
  WeightEntryDTO,
  WhoDTO,
} from "@/lib/types";

/** The manager view is per-week AND per-routine (own person or a collaboration).
    The query is keyed by both so switching either refetches cleanly. */
export const routineKey = (week: string | null, personId: string | null) =>
  ["routine", personId ?? "default", week ?? "current"] as const;
export const kidKey = ["routine-kid"] as const;
export const routineInvitesKey = ["routine-invites"] as const;
/* 2026-09-25 — the circle: who/mentor keyed by nothing; the rest by day or month. */
export const whoKey = ["routine-who"] as const;
export const reportsKey = (personId: string | null) => ["routine-reports", personId ?? "default"] as const;
export const locationKey = (day: string | null, personId: string | null) => ["routine-location", personId ?? "default", day ?? "today"] as const;
export const kidLocationKey = (day: string | null) => ["routine-kid-location", day ?? "today"] as const;
export const calendarKey = (month: string | null, personId: string | null) => ["routine-calendar", personId ?? "default", month ?? "current"] as const;
export const kidCalendarKey = (month: string | null) => ["routine-kid-calendar", month ?? "current"] as const;
export const mentorKey = ["routine-mentor"] as const;

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

/** Parent optimistic: log / unlog a crossed day; the week's count and the summary follow. */
function applyNnCross(prev: RoutineOverviewDTO, nonNegotiableId: string, date: string, crossed: boolean): RoutineOverviewDTO {
  const nonNegotiables = prev.nonNegotiables.map((n) => {
    if (n.id !== nonNegotiableId) return n;
    const days = { ...n.days };
    if (crossed) days[date] = true;
    else delete days[date];
    return { ...n, days, crossedThisWeek: Object.keys(days).length };
  });
  return { ...prev, nonNegotiables, summary: { ...prev.summary, violations: nonNegotiables.reduce((a, n) => a + n.crossedThisWeek, 0) } };
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
  // Structural edits can shift any week — refetch every cached routine week (and the calendar).
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["routine"] });
    void qc.invalidateQueries({ queryKey: ["routine-calendar"] });
  };

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
  // The parent logs a day a non-negotiable was crossed (2026-09-25); the person only sees it.
  const crossNonNegotiableDay = useMutation({
    mutationFn: (input: { nonNegotiableId: string; date: string; crossed: boolean }) => apiPatch(p("/api/routine/non-negotiable-mark"), input),
    onMutate: async ({ nonNegotiableId, date, crossed }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<RoutineOverviewDTO>(key);
      if (prev) qc.setQueryData<RoutineOverviewDTO>(key, applyNnCross(prev, nonNegotiableId, date, crossed));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const addTask = useMutation({
    mutationFn: (input: { title: string; dueDate?: string | null; startDate?: string | null }) => apiPost<RoutineTaskDTO>(p("/api/routine/tasks"), input),
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

  const inviteCircle = useMutation({
    mutationFn: (input: { name: string; email: string; kind: CircleKind; subject?: string; permission?: RoutinePermission; sendEmail?: boolean }) =>
      apiPost<{ member: CircleMemberDTO; inviteUrl: string; emailSent: boolean }>(p("/api/routine/circle"), input),
    onSettled: refresh,
  });
  const updateCircle = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { permission?: RoutinePermission; subject?: string | null } }) => apiPatch<CircleMemberDTO>(p(`/api/routine/circle/${id}`), patch),
    onSettled: refresh,
  });
  const removeCircle = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(p(`/api/routine/circle/${id}`)),
    onSettled: refresh,
  });
  const resendCircle = useMutation({
    mutationFn: ({ id, sendEmail }: { id: string; sendEmail?: boolean }) => apiPost<{ inviteUrl: string; emailSent: boolean }>(p(`/api/routine/circle/${id}/resend`), { sendEmail }),
    onSettled: refresh,
  });

  // 2026-09-25 — phone sharing (owner only): mint or drop the link.
  const setSharing = useMutation({
    mutationFn: (input: { on: boolean }) => apiPost<{ on: boolean; url: string | null }>(p("/api/routine/location/sharing"), input),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["routine-location"] }),
  });

  return {
    setSharing,
    createPerson, updatePerson, deletePerson,
    addSegment, renameSegment, deleteSegment,
    addHabit, updateHabit, deleteHabit, markHabit,
    addNonNegotiable, updateNonNegotiable, deleteNonNegotiable, crossNonNegotiableDay,
    addTask, deleteTask,
    addWeight, updateWeight, deleteWeight,
    inviteCollaborator, updateCollaborator, revokeCollaborator, sendReminder,
    inviteCircle, updateCircle, removeCircle, resendCircle,
  };
}

/** One IST day of the person's positions for the parent side (null = today). */
export function useLocationDay(day: string | null, personId: string | null, enabled = true) {
  return useQuery({
    queryKey: locationKey(day, personId),
    queryFn: () => apiGet<LocationDayDTO>(withPerson(`/api/routine/location${day ? `?day=${day}` : ""}`, personId)),
    enabled,
    refetchInterval: 60_000,
  });
}

/** Everything the tutors punched in, newest first — the parents' Tutors tab. */
export function useReports(personId: string | null, enabled = true) {
    return useQuery({ queryKey: reportsKey(personId), queryFn: () => apiGet<{ reports: MentorReportDTO[] }>(withPerson("/api/routine/reports", personId)), enabled });
}


/** The month calendar for the parent side. `month` is "YYYY-MM" or null for now. */
export function useCalendar(month: string | null, personId: string | null, enabled = true) {
  return useQuery({
    queryKey: calendarKey(month, personId),
    queryFn: () => apiGet<CalendarMonthDTO>(withPerson(`/api/routine/calendar${month ? `?month=${month}` : ""}`, personId)),
    enabled,
  });
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

/* ---- 2026-09-25 — the person's own extras ---- */

/** The person adds an extra of their own for today (addedBy PERSON). */
export function usePersonAddTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string }) => apiPost<RoutineTaskDTO>("/api/routine/kid/tasks", input),
    onSettled: () => void qc.invalidateQueries({ queryKey: kidKey }),
  });
}
/** …and removes one of their own (never a task the parent set). */
export function usePersonDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/routine/kid/tasks/${id}`),
    onSettled: () => void qc.invalidateQueries({ queryKey: kidKey }),
  });
}

/** The person's own month calendar (no habit rollup). */
export function usePersonCalendar(month: string | null) {
  return useQuery({
    queryKey: kidCalendarKey(month),
    queryFn: () => apiGet<CalendarMonthDTO>(`/api/routine/kid/calendar${month ? `?month=${month}` : ""}`),
  });
}

/** The person sets a rule of their own, and removes only their own. */
export function usePersonAddRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => apiPost<{ id: string }>("/api/routine/kid/rules", input),
    onSettled: () => void qc.invalidateQueries({ queryKey: kidKey }),
  });
}
export function usePersonDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/routine/kid/rules/${id}`),
    onSettled: () => void qc.invalidateQueries({ queryKey: kidKey }),
  });
}

/** The person's own positions for a day (null = today), for their Map tab. */
export function usePersonLocationDay(day: string | null) {
  return useQuery({
    queryKey: kidLocationKey(day),
    queryFn: () => apiGet<LocationDayDTO>(`/api/routine/kid/location${day ? `?day=${day}` : ""}`),
  });
}
/** The app itself noting where he is (on open, hourly while open) — a position only. */
export function usePersonPing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { lat: number; lng: number; accuracy?: number }) => apiPost<LocationPointDTO>("/api/routine/kid/ping", input),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["routine-kid-location"] }),
  });
}
/** The person taps "Check in": a place, a note, and the phone's position if allowed. */
export function usePersonCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { place: string; note?: string; lat?: number; lng?: number; accuracy?: number }) => apiPost<LocationPointDTO>("/api/routine/kid/checkin", input),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["routine-kid-location"] }),
  });
}


/* ---- Which walled login is this? (the person, a co-parent, a tutor) ---- */
export function useWho() {
  return useQuery({ queryKey: whoKey, queryFn: () => apiGet<WhoDTO>("/api/routine/who"), retry: false });
}

/* ---- The tutor's / coach's screen ---- */
export function useMentor() {
  return useQuery({ queryKey: mentorKey, queryFn: () => apiGet<MentorViewDTO>("/api/routine/mentor") });
}
export function useMentorReportAdd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { collaboratorId: string; date: string; covered: string; homework?: string; homeworkDue?: string; note?: string }) => apiPost<MentorReportDTO>("/api/routine/mentor/reports", input),
    onSettled: () => void qc.invalidateQueries({ queryKey: mentorKey }),
  });
}
export function useMentorReportDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/routine/mentor/reports/${id}`),
    onSettled: () => void qc.invalidateQueries({ queryKey: mentorKey }),
  });
}
