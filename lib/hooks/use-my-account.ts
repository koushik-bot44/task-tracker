"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type { UserRole } from "@/lib/types";

/** The profile menu every account wears (2026-10-01), the walled family logins
    included — they read /api/me, which they can reach, not /api/users/me. */
export type MyProfileDTO = { name: string; email: string; role: UserRole; emailReady: boolean };

export function useMyProfile() {
  return useQuery({ queryKey: ["my-profile"], queryFn: () => apiGet<MyProfileDTO>("/api/me"), staleTime: 5 * 60_000 });
}

export function useMyPasswordMutations() {
  const changePassword = useMutation({
    mutationFn: (input: { current: string; next: string }) => apiPost<{ ok: true }>("/api/me/password", input),
  });
  const sendResetLink = useMutation({
    mutationFn: () => apiPost<{ ok: true; sentTo: string }>("/api/me/reset-link", {}),
  });
  return { changePassword, sendResetLink };
}

/** The CEO's other sign-in addresses (a dev login that is the CEO account itself). */
export type MyEmailsDTO = { main: string; others: string[] };

export function useMyEmails(enabled: boolean) {
  return useQuery({ queryKey: ["my-emails"], queryFn: () => apiGet<MyEmailsDTO>("/api/me/emails"), enabled });
}

export function useMyEmailMutations() {
  const qc = useQueryClient();
  const set = (data: MyEmailsDTO) => qc.setQueryData(["my-emails"], data);
  const addEmail = useMutation({
    mutationFn: (input: { email: string; password: string }) => apiPost<MyEmailsDTO>("/api/me/emails", input),
    onSuccess: set,
  });
  const removeEmail = useMutation({
    mutationFn: (email: string) => apiDelete<MyEmailsDTO>(`/api/me/emails?email=${encodeURIComponent(email)}`),
    onSuccess: set,
  });
  return { addEmail, removeEmail };
}
