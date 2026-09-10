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
      apiPost<{ user: UserDTO; emailSent: boolean }>("/api/users", input),
    onSuccess: refresh,
  });

  const resendInvite = useMutation({
    mutationFn: (id: string) => apiPost<{ ok: true; emailSent: boolean }>(`/api/users/${id}/resend`, {}),
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

  return { createUser, updateUser, changeMyPassword, updateMe, resendInvite, cancelInvite, setPassword };
}
