"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { MeDTO, UserDTO, UserRole } from "@/lib/types";

export const meKey = ["me"] as const;
export const usersKey = ["users"] as const;

/** The signed-in account. Drives every role-aware bit of UI, and the Well Being tab. */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: () => apiGet<MeDTO>("/api/users/me"),
    staleTime: 5 * 60_000,
  });
}

export function useUsers(enabled = true) {
  return useQuery({
    queryKey: usersKey,
    queryFn: () => apiGet<UserDTO[]>("/api/users"),
    enabled,
  });
}

export function useUserMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: usersKey });
    // A renamed person reads the new name on every project too (2026-09-10).
    void qc.invalidateQueries({ queryKey: ["project-people"] });
    // A head of department heads their department as soon as they are placed (2026-09-11).
    void qc.invalidateQueries({ queryKey: ["departments"] });
    void qc.invalidateQueries({ queryKey: ["org-setup"] });
  };

  const createUser = useMutation({
    mutationFn: (input: {
      name: string;
      /** The main address — where the invite is sent. */
      email: string;
      /** Their other addresses, if they have any. Each one signs them in. */
      emails?: string[];
      role: UserRole;
      departmentId?: string | null;
    }) =>
      apiPost<{ user: UserDTO; emailSent: boolean; inviteUrl: string }>("/api/users", input),
    onSuccess: refresh,
  });

  const resendInvite = useMutation({
    /** `email: false` makes a new link without emailing it (2026-09-10). */
    mutationFn: (input: string | { id: string; email?: boolean }) => {
      const id = typeof input === "string" ? input : input.id;
      const email = typeof input === "string" ? true : input.email ?? true;
      return apiPost<{ ok: true; emailSent: boolean; inviteUrl: string }>(`/api/users/${id}/resend`, { email });
    },
    onSuccess: refresh,
  });

  const setPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => apiPost<{ ok: true }>(`/api/users/${id}/password`, { password }),
    onSuccess: refresh,
  });

  const cancelInvite = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true; deletedProjects: number }>(`/api/users/${id}`),
    onSuccess: refresh,
  });

  const updateUser = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { name?: string; email?: string; role?: UserRole; disable?: boolean; reset?: true; phone?: string | null; departmentId?: string | null };
    }) => apiPatch<{ user: UserDTO; tempPassword?: string }>(`/api/users/${id}`, patch),
    onSuccess: refresh,
  });

  const changeMyPassword = useMutation({
    mutationFn: (input: { current: string; next: string }) => apiPost<{ ok: true }>("/api/users/me/password", input),
  });

  const updateMe = useMutation({
    mutationFn: (patch: { name?: string; emailOptIn?: boolean; whatsappOptIn?: boolean; phone?: string | null }) =>
      apiPatch<UserDTO>("/api/users/me", patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: meKey });
      const previous = qc.getQueryData<MeDTO>(meKey);
      if (previous) qc.setQueryData<MeDTO>(meKey, { ...previous, ...patch });
      return { previous };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.previous) qc.setQueryData(meKey, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: meKey });
      // Your own new name shows wherever people are listed.
      void qc.invalidateQueries({ queryKey: usersKey });
      void qc.invalidateQueries({ queryKey: ["project-people"] });
    },
  });

  // Several people at once, each with a position or none (owner, 2026-09-11).
  const invitePeople = useMutation({
    mutationFn: (input: { people: { name?: string; emails: string[]; role?: UserRole | null; departmentId?: string | null }[] }) =>
      apiPost<{ people: { id: string; name: string; email: string; role: UserRole; departmentId: string | null; url: string; emailSent: boolean }[] }>("/api/users/invite", input),
    onSuccess: refresh,
  });

  // Your own sign-in address, proved with your password (2026-09-11).
  const changeMyEmail = useMutation({
    mutationFn: (input: { email: string; password: string }) => apiPost<{ ok: true; email: string }>("/api/users/me/email", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: meKey });
      void qc.invalidateQueries({ queryKey: usersKey });
    },
  });

  return { createUser, invitePeople, updateUser, changeMyPassword, updateMe, changeMyEmail, resendInvite, cancelInvite, setPassword };
}
